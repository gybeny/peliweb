<?php

namespace WebNest\Services;

use App\Models\Server;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use WebNest\Models\Deployment;
use WebNest\Models\Domain;
use WebNest\Models\Setting;

class Edge
{
    public function sync(Server $server): void
    {
        $node = Settings::forNode((int) $server->node_id);
        if (!$node) {
            throw new RuntimeException('Ehhez a node-hoz még nincs privát Caddy edge kapcsolat beállítva.');
        }
        $latest = (new Websites())->latest($server);
        if (!$latest || $latest->state !== 'applied') {
            throw new RuntimeException('Előbb sikeresen alkalmazd a konfigurációt, és frissítsd a runtime állapotát.');
        }
        $this->syncNode($node['api_url']);
    }

    /** Rebuild every node sharing the endpoint, preserving unrelated Caddy config. */
    public function syncNode(string $endpoint, ?int $excludeServerId = null): void
    {
        Cache::lock('webnest:edge:'.hash('sha256', $endpoint), 60)->block(5, function () use ($endpoint, $excludeServerId) {
            $nodeIds = collect(Settings::all()['nodes'])->where('api_url', $endpoint)->pluck('node_id')->map(fn ($id) => (int) $id)->all();
            $httpRoutes = [];
            $httpsRoutes = [];
            $hostnames = [];
            $states = [];
            $servers = Server::query()->whereIn('node_id', $nodeIds)->get();
            foreach ($servers as $server) {
                if ($server->id === $excludeServerId) {
                    continue;
                }
                $deployment = Deployment::query()->where('server_id', $server->id)->where('state', 'applied')->first();
                if (!$deployment) {
                    continue;
                }
                // Never publish a snapshot for an allocation that has since changed.
                if ((int) $server->allocation?->port !== (int) $deployment->snapshot['port']) {
                    throw new RuntimeException('Egy érintett szerver allocation portja megváltozott. Alkalmazd újra a konfigurációját.');
                }
                $ip = $server->allocation?->ip;
                if (!filter_var($ip, FILTER_VALIDATE_IP) || in_array($ip, ['0.0.0.0', '::'], true)) {
                    throw new RuntimeException('Valós, az edge felől elérhető allocation IP szükséges (nem 0.0.0.0).');
                }
                $dial = (str_contains($ip, ':') ? "[$ip]" : $ip).':'.(int) $server->allocation->port;
                $owned = Domain::query()->whereNotNull('verified_at')
                    ->whereHas('site', fn ($q) => $q->where('server_id', $server->id))
                    ->pluck('hostname')->all();
                foreach ($deployment->snapshot['sites'] as $site) {
                    if (!$site['settings']['enabled']) {
                        continue;
                    }
                    foreach ($site['domains'] as $domain) {
                        $host = $domain['hostname'];
                        // Check current ownership, not a stale snapshot's verified flag.
                        if (!in_array($host, $owned, true)) {
                            continue;
                        }
                        $route = ['match' => [['host' => [$host]]], 'handle' => [
                            ['handler' => 'reverse_proxy', 'upstreams' => [['dial' => $dial]]],
                        ], 'terminal' => true];
                        $httpsRoutes[] = $route;
                        $hostnames[] = $host;
                        $httpRoutes[] = $site['settings']['force_https']
                            ? ['match' => [['host' => [$host]]], 'handle' => [[
                                'handler' => 'static_response', 'status_code' => 308,
                                'headers' => ['Location' => ['https://{http.request.host}{http.request.uri}']],
                            ]], 'terminal' => true]
                            : $route;
                    }
                }
                $states[$server->id] = $deployment->id;
            }
            $client = Http::connectTimeout(3)->timeout(15)->withoutRedirecting()->acceptJson();
            // Preserve JSON empty objects: associative decoding turns {} into [],
            // breaking otherwise valid unrelated Caddy module configurations.
            $config = json_decode($client->get($endpoint.'/config/')->throw()->body(), false, 512, JSON_THROW_ON_ERROR);
            if (!is_object($config)) {
                throw new RuntimeException('A Caddy nem érvényes konfigurációt adott vissza.');
            }
            // /load validates and atomically swaps the complete config. On validation
            // error Caddy leaves the previous working config in place.
            $config = (new CaddyRenderer())->render($config, $httpRoutes, $httpsRoutes, $hostnames, Settings::all());
            $client->withBody(json_encode($config, JSON_THROW_ON_ERROR), 'application/json')->post($endpoint.'/load')->throw();
            Setting::query()->updateOrCreate(['key' => 'edge:'.hash('sha256', $endpoint)], ['value' => [
                'synced_at' => now()->toIso8601String(), 'deployments' => $states,
                'hostnames' => $hostnames,
            ]]);
        });
    }

    public function certificate(Server $server, int $domainId): array
    {
        $domain = (new Websites())->domain($server, $domainId);
        if (!$domain->verified_at) {
            throw new RuntimeException('Előbb igazold a domain tulajdonjogát DNS TXT rekorddal.');
        }
        $node = Settings::forNode((int) $server->node_id);
        if (!$node) {
            throw new RuntimeException('Nincs edge kapcsolat beállítva.');
        }
        $ip = $node['edge_ip'];
        $address = str_contains($ip, ':') ? "[$ip]" : $ip;
        $context = stream_context_create(['ssl' => [
            'capture_peer_cert' => true, 'peer_name' => $domain->hostname,
            'verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true,
        ]]);
        $socket = @stream_socket_client("tls://$address:443", $errorCode, $error, 5, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) {
            throw new RuntimeException('Még nincs ellenőrizhető, érvényes TLS tanúsítvány. Ellenőrizd a DNS-t, a 80/443 elérhetőségét és a Caddy ACME naplóját.');
        }
        try {
            $params = stream_context_get_params($socket);
            $cert = openssl_x509_parse($params['options']['ssl']['peer_certificate']);
            if (!$cert) {
                throw new RuntimeException('Nem olvasható a tanúsítvány.');
            }
            return [
                'hostname' => $domain->hostname,
                'issuer' => $cert['issuer']['O'] ?? $cert['issuer']['CN'] ?? 'Ismeretlen',
                'expires' => gmdate('Y-m-d H:i:s', $cert['validTo_time_t']).' UTC',
                'checked' => now()->toIso8601String(),
            ];
        } finally {
            fclose($socket);
        }
    }
}
