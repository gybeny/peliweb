<?php

namespace WebNest\Services;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use WebNest\Models\Setting;

class Settings
{
    public static function all(): array
    {
        return array_merge(['egg_ids' => [], 'nodes' => [], 'acme_staging' => true, 'acme_email' => ''], Setting::query()->find('settings')?->value ?? []);
    }

    public static function forNode(int $id): ?array
    {
        foreach (self::all()['nodes'] as $node) {
            if ((int) $node['node_id'] === $id) {
                return $node;
            }
        }
        return null;
    }

    public static function validate(array $input): array
    {
        $data = Validator::make($input, [
            'egg_ids' => ['required', 'array', 'min:1'],
            'acme_staging' => ['required', 'boolean'],
            'acme_email' => ['nullable', 'email', 'max:254'],
            'egg_ids.*' => ['required', 'integer', 'exists:eggs,id', 'distinct'],
            'nodes' => ['present', 'array', 'max:100'],
            'nodes.*.node_id' => ['required', 'integer', 'exists:nodes,id', 'distinct'],
            'nodes.*.api_url' => ['required', 'url:http,https', 'max:250'],
            'nodes.*.edge_ip' => ['required', 'ip'],
            'nodes.*.trusted_proxy_ips' => ['nullable', 'string', 'max:2000'],
        ])->validate();
        foreach ($data['nodes'] as $i => $node) {
            $parts = parse_url($node['api_url']);
            $host = trim($parts['host'] ?? '', '[]');
            // An IP literal is required: no rebinding through an admin URL hostname.
            $private = filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
                && (str_starts_with($host, '10.') || str_starts_with($host, '127.')
                    || str_starts_with($host, '192.168.')
                    || (preg_match('/^172\.(\d+)\./', $host, $m) && (int) $m[1] >= 16 && (int) $m[1] <= 31));
            if (!$private || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !in_array($parts['path'] ?? '', ['', '/'], true)) {
                throw ValidationException::withMessages(["nodes.$i.api_url" => 'Privát IPv4 címet adj meg útvonal, felhasználónév és jelszó nélkül.']);
            }
            $data['nodes'][$i]['api_url'] = rtrim($node['api_url'], '/');
            SiteValidator::networks($node['trusted_proxy_ips'] ?? '', "nodes.$i.trusted_proxy_ips");
        }
        foreach (self::all()['nodes'] as $old) {
            $replacement = collect($data['nodes'])->first(fn ($n) => (int) $n['node_id'] === (int) $old['node_id']);
            if (($replacement['api_url'] ?? null) !== $old['api_url']) {
                $edgeState = Setting::query()->find('edge:'.hash('sha256', $old['api_url']))?->value ?? [];
                if (!empty($edgeState['hostnames'])) {
                    throw ValidationException::withMessages(['nodes' => 'Aktív edge útvonalak mellett nem cserélhető/törölhető a Caddy kapcsolat. Előbb tiltsd le az érintett webhelyeket, alkalmazd és szinkronizáld az edge-et.']);
                }
            }
        }
        return $data;
    }
}
