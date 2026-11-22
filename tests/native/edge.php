<?php

require __DIR__.'/../../plugins/webnest/src/Services/CaddyRenderer.php';

use WebNest\Services\CaddyRenderer;

$base = json_decode('{"admin":{"listen":"127.0.0.1:2019"},"logging":{"logs":{"default":{}}}}');
$route = ['match' => [['host' => ['test.example.org']]], 'handle' => [[
    'handler' => 'reverse_proxy', 'upstreams' => [['dial' => '192.0.2.1:8080']],
]], 'terminal' => true];
$renderer = new CaddyRenderer();
$config = $renderer->render($base, [$route], [$route], ['test.example.org'], ['acme_staging' => true]);
$encoded = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
$checks = [
    'Unrelated empty JSON object preserved' => str_contains($encoded, '"default": {}'),
    'Explicit staging issuer' => str_contains($encoded, 'acme-staging-v02'),
    'TLS connection policy is object' => is_object($config->apps->http->servers->webnest_https['tls_connection_policies'][0]),
];
$roundtrip = json_decode($encoded);
$again = $renderer->render($roundtrip, [$route], [$route], ['test.example.org'], ['acme_staging' => false]);
$checks['Managed policy replaced not duplicated'] = count($again->apps->tls->automation->policies) === 1;
$checks['Explicit production opt-in'] = !str_contains(json_encode($again), 'acme-staging-v02');
$removed = $renderer->render(json_decode($encoded), [], [], [], []);
$checks['No wildcard policy after final site removal'] = count($removed->apps->tls->automation->policies) === 0;
foreach ($checks as $name => $ok) {
    echo ($ok ? 'PASS ' : 'FAIL ').$name.PHP_EOL;
}
if (in_array(false, $checks, true)) {
    exit(1);
}
if (isset($argv[1])) {
    file_put_contents($argv[1], $encoded);
}
