<?php

// Standalone renderer checks; no Laravel/Pelican install needed.
require __DIR__.'/../../plugins/webnest/src/Services/NginxRenderer.php';

use WebNest\Services\NginxRenderer;

$settings = [
    'kind' => 'php', 'enabled' => true, 'root' => 'sites/test/public',
    'rate_limit' => 30, 'upload_mb' => 32, 'memory_mb' => 256,
    'block_dotfiles' => true, 'allowed_ips' => ['192.0.2.0/24', '2001:db8::/32'],
    'headers' => [['name' => 'Content-Security-Policy', 'value' => 'default-src \'self\'; report-uri "safe"']],
    'proxy_target' => 'http://127.0.0.1:3000', 'websocket' => true,
];
$sites = [];
foreach (['php', 'static', 'proxy'] as $i => $kind) {
    $sites[] = [
        'id' => $i + 1,
        'settings' => array_merge($settings, ['kind' => $kind]),
        'domains' => [['hostname' => $kind.'.example.org']],
    ];
}
$renderer = new NginxRenderer();
$config = $renderer->render($sites, 8080, ['10.0.0.2/32', '2001:db8::2/128']);
$checks = [
    'PHP FastCGI' => str_contains($config, 'fastcgi_pass 127.0.0.1:9000;'),
    'WebSocket' => str_contains($config, 'proxy_set_header Connection $connection_upgrade;'),
    'Unknown Host blocked' => str_contains($config, 'server_name _; return 404;'),
    'Header quotes escaped' => str_contains($config, '\\"safe\\"'),
    'Trusted edge scheme' => str_contains($config, 'fastcgi_param HTTPS $webnest_https if_not_empty;'),
    'Real IP restricted' => str_contains($config, 'set_real_ip_from 10.0.0.2/32;'),
    'PHP denied on static' => str_contains($config, 'location ~ \.php$ { return 404; }'),
    'IP fallback deny' => str_contains($config, 'deny all;'),
];
try {
    $renderer->render([], 80);
    $checks['Privileged port rejected'] = false;
} catch (InvalidArgumentException) {
    $checks['Privileged port rejected'] = true;
}
$bad = $sites[2];
$bad['settings']['proxy_target'] = 'http://127.0.0.1:8080';
try {
    $renderer->render([$bad], 8080);
    $checks['Self-proxy rejected'] = false;
} catch (InvalidArgumentException) {
    $checks['Self-proxy rejected'] = true;
}
$bad = $sites[0];
$bad['settings']['headers'][0]['value'] = '$not_a_variable';
try {
    $renderer->render([$bad], 8080);
    $checks['Header variable injection rejected'] = false;
} catch (InvalidArgumentException) {
    $checks['Header variable injection rejected'] = true;
}
foreach ($checks as $name => $ok) {
    echo ($ok ? 'PASS ' : 'FAIL ').$name.PHP_EOL;
}
if (in_array(false, $checks, true)) {
    exit(1);
}
if (isset($argv[1])) {
    file_put_contents($argv[1], $config);
}
