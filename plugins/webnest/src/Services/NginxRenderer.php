<?php

namespace WebNest\Services;

use InvalidArgumentException;

/** Pure renderer: callers must pass only SiteValidator output and DB-owned IDs. */
class NginxRenderer
{
    private function quote(string $value): string
    {
        // nginx still compiles \$name as a complex-value variable in add_header.
        // Reject dollars, rather than pretending backslash escaping makes them literal.
        if (str_contains($value, '$')) {
            throw new InvalidArgumentException('A fejléc értéke nem tartalmazhat $ változójelet.');
        }
        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
    }

    public function render(array $sites, int $port, array $trustedProxies = []): string
    {
        if ($port < 1024 || $port > 65535) {
            throw new InvalidArgumentException('Az allocation portja 1024–65535 közötti legyen.');
        }
        $zones = '';
        $servers = '';
        foreach ($sites as $site) {
            $s = $site['settings'];
            if (!$s['enabled'] || empty($site['domains'])) {
                continue;
            }
            $id = (int) $site['id'];
            $hosts = implode(' ', array_column($site['domains'], 'hostname'));
            $rate = (int) $s['rate_limit'];
            $zones .= "limit_req_zone \$binary_remote_addr zone=wn$id:1m rate={$rate}r/s;\n";
            $body = "listen $port;\nserver_name $hosts;\n";
            $body .= 'root /home/container/'.$s['root'].";\nindex index.php index.html;\nautoindex off;\ndisable_symlinks on from=/home/container;\n";
            $body .= 'client_max_body_size '.(int) $s['upload_mb']."m;\nlimit_req zone=wn$id burst=20 nodelay;\nlimit_req_status 429;\n";
            // remote_addr is restored only for admin-allowlisted edge source IPs.
            foreach ($s['allowed_ips'] as $ip) {
                $body .= "allow $ip;\n";
            }
            if ($s['allowed_ips']) {
                $body .= "deny all;\n";
            }
            foreach ($s['headers'] as $header) {
                $body .= 'add_header '.$header['name'].' '.$this->quote($header['value'])." always;\n";
            }
            $body .= "location ~ /(?:\\.env|\\.git|\\.webnest)(?:/|$) { deny all; }\n";
            if ($s['block_dotfiles']) {
                $body .= "location ~ /\\. { deny all; }\n";
            }
            if ($s['kind'] === 'proxy') {
                if ((int) parse_url($s['proxy_target'], PHP_URL_PORT) === $port) {
                    throw new InvalidArgumentException('A proxy nem mutathat a saját nginx portjára.');
                }
                $body .= "location / {\nproxy_pass {$s['proxy_target']};\nproxy_http_version 1.1;\nproxy_set_header Host \$host;\nproxy_set_header X-Real-IP \$remote_addr;\nproxy_set_header X-Forwarded-For \$remote_addr;\nproxy_set_header X-Forwarded-Proto \$webnest_scheme;\nproxy_connect_timeout 5s;\nproxy_read_timeout 60s;\n";
                if ($s['websocket']) {
                    $body .= "proxy_set_header Upgrade \$http_upgrade;\nproxy_set_header Connection \$connection_upgrade;\n";
                }
                $body .= "}\n";
            } else {
                $body .= $s['kind'] === 'php'
                    ? "location / { try_files \$uri \$uri/ /index.php?\$query_string; }\n"
                    : "location / { try_files \$uri \$uri/ =404; }\n";
                if ($s['kind'] === 'php') {
                    $phpValue = 'memory_limit='.(int) $s['memory_mb']."M\nupload_max_filesize=".(int) $s['upload_mb']."M\npost_max_size=".(int) $s['upload_mb'].'M';
                    $body .= "location ~ \\.php$ {\ntry_files \$uri =404;\ninclude fastcgi_params;\nfastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;\nfastcgi_param REQUEST_SCHEME \$webnest_scheme;\nfastcgi_param HTTPS \$webnest_https if_not_empty;\nfastcgi_param HTTP_X_FORWARDED_PROTO \$webnest_scheme;\nfastcgi_param PHP_VALUE ".$this->quote($phpValue).";\nfastcgi_pass 127.0.0.1:9000;\n}\n";
                } else {
                    $body .= "location ~ \\.php$ { return 404; }\n";
                }
            }
            $servers .= "server {\n$body}\n";
        }
        $trusted = "geo \$realip_remote_addr \$webnest_trusted_proxy {\ndefault 0;\n";
        $realIp = "real_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n";
        foreach ($trustedProxies as $ip) {
            $trusted .= "$ip 1;\n";
            $realIp .= "set_real_ip_from $ip;\n";
        }
        $trusted .= "}\n";
        $scheme = "map \"\$webnest_trusted_proxy:\$http_x_forwarded_proto\" \$webnest_scheme {\ndefault \$scheme;\n\"1:https\" https;\n\"1:http\" http;\n}\nmap \$webnest_scheme \$webnest_https { default ''; https on; }\n";
        // A default vhost prevents arbitrary Host headers reaching a customer's site.
        return "worker_processes 1;\npid nginx.pid;\nerror_log stderr warn;\nevents { worker_connections 1024; }\nhttp {\ninclude mime.types;\ndefault_type application/octet-stream;\nserver_tokens off;\naccess_log access.log;\nclient_body_temp_path client_temp;\nproxy_temp_path proxy_temp;\nfastcgi_temp_path fastcgi_temp;\nuwsgi_temp_path uwsgi_temp;\nscgi_temp_path scgi_temp;\n$realIp\n$trusted\n$scheme\nmap \$http_upgrade \$connection_upgrade { default upgrade; '' close; }\n$zones\nserver { listen $port default_server; server_name _; return 404; }\n$servers}\n";
    }
}
