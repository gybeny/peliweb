<?php

namespace WebNest\Services;

/** Pure Caddy JSON transformation, independently checkable without Pelican. */
class CaddyRenderer
{
    public function render(object $config, array $httpRoutes, array $httpsRoutes, array $hostnames, array $settings): object
    {
        $config->apps ??= new \stdClass();
        $config->apps->http ??= new \stdClass();
        $config->apps->http->servers ??= new \stdClass();
        $config->apps->http->servers->webnest_http = [
            'listen' => [':80'], 'routes' => $httpRoutes,
            'automatic_https' => ['disable' => true],
        ];
        $config->apps->http->servers->webnest_https = [
            'listen' => [':443'], 'routes' => $httpsRoutes,
            'automatic_https' => ['disable_redirects' => true],
            'tls_connection_policies' => [(object) []],
        ];
        $config->apps->tls ??= new \stdClass();
        $config->apps->tls->automation ??= new \stdClass();
        $policies = array_values(array_filter(
            $config->apps->tls->automation->policies ?? [],
            fn ($policy) => ($policy->{'@id'} ?? null) !== 'webnest_acme'
        ));
        if ($hostnames) {
            $issuer = [
                'module' => 'acme',
                'ca' => ($settings['acme_staging'] ?? true)
                    ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
                    : 'https://acme-v02.api.letsencrypt.org/directory',
            ];
            if (!empty($settings['acme_email'])) {
                $issuer['email'] = $settings['acme_email'];
            }
            array_unshift($policies, [
                '@id' => 'webnest_acme',
                'subjects' => array_values(array_unique($hostnames)),
                'issuers' => [$issuer],
            ]);
        }
        $config->apps->tls->automation->policies = $policies;
        return $config;
    }
}
