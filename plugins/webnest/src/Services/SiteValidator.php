<?php

namespace WebNest\Services;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SiteValidator
{
    public const HEADERS = [
        'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy',
        'Permissions-Policy', 'Content-Security-Policy', 'Cache-Control',
    ];

    public static function defaults(): array
    {
        return [
            'name' => '', 'domain' => '', 'kind' => 'php', 'root' => 'sites/default/public',
            'enabled' => true, 'force_https' => true, 'block_dotfiles' => true,
            'rate_limit' => 30, 'upload_mb' => 32, 'memory_mb' => 256,
            'proxy_target' => 'http://127.0.0.1:3000', 'websocket' => true,
            'allowed_ips' => '', 'headers_json' => json_encode([
                ['name' => 'X-Content-Type-Options', 'value' => 'nosniff'],
                ['name' => 'X-Frame-Options', 'value' => 'SAMEORIGIN'],
                ['name' => 'Referrer-Policy', 'value' => 'strict-origin-when-cross-origin'],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        ];
    }

    public static function hostname(string $value): string
    {
        $host = strtolower(rtrim(trim($value), '.'));
        if (strlen($host) > 253 || !str_contains($host, '.') || filter_var($host, FILTER_VALIDATE_IP)
            || !preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/D', $host)) {
            throw ValidationException::withMessages(['domain' => 'Teljes domainnevet adj meg, protokoll és útvonal nélkül. IDN esetén punycode alakot használj. Wildcard nem támogatott.']);
        }
        return $host;
    }

    public static function site(array $input): array
    {
        $data = Validator::make($input, [
            'name' => ['required', 'string', 'max:100'],
            'kind' => ['required', Rule::in(['php', 'static', 'proxy'])],
            'root' => ['required', 'string', 'max:200', 'regex:~^sites/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$~D'],
            'enabled' => ['required', 'boolean'],
            'force_https' => ['required', 'boolean'],
            'block_dotfiles' => ['required', 'boolean'],
            'rate_limit' => ['required', 'integer', 'min:1', 'max:10000'],
            'upload_mb' => ['required', 'integer', 'min:1', 'max:1024'],
            'memory_mb' => ['required', 'integer', 'min:32', 'max:2048'],
            'proxy_target' => ['nullable', 'string', 'max:100'],
            'websocket' => ['required', 'boolean'],
            'allowed_ips' => ['nullable', 'string', 'max:2000'],
            'headers_json' => ['required', 'json', 'max:12000'],
        ])->validate();
        if ($data['kind'] === 'proxy' && !preg_match('~^http://127\.0\.0\.1:([1-9][0-9]{0,4})$~D', $data['proxy_target'] ?? '', $m)) {
            throw ValidationException::withMessages(['proxy_target' => 'Csak konténeren belüli HTTP cél engedélyezett: http://127.0.0.1:PORT']);
        }
        if ($data['kind'] === 'proxy' && ((int) $m[1] < 1024 || (int) $m[1] > 65535)) {
            throw ValidationException::withMessages(['proxy_target' => 'A proxy portja 1024–65535 közötti legyen.']);
        }
        $headers = json_decode($data['headers_json'], true);
        if (!is_array($headers) || !array_is_list($headers) || count($headers) > 20) {
            throw ValidationException::withMessages(['headers_json' => 'Legfeljebb 20 {name, value} objektumot tartalmazó JSON listát adj meg.']);
        }
        foreach ($headers as $header) {
            if (!is_array($header) || !in_array($header['name'] ?? null, self::HEADERS, true) || !is_string($header['value'] ?? null)
                || strlen($header['value']) > 2000 || preg_match('/[^\x20-\x7e]|\$/', $header['value'])) {
                throw ValidationException::withMessages(['headers_json' => 'Tiltott fejléc, nem nyomtatható karakter vagy $ változójel. Engedélyezett: '.implode(', ', self::HEADERS)]);
            }
        }
        $data['headers'] = $headers;
        $data['allowed_ips'] = self::networks($data['allowed_ips'] ?? '', 'allowed_ips');
        unset($data['headers_json']);
        return $data;
    }

    public static function networks(string $value, string $field): array
    {
        $ips = preg_split('/[\s,]+/', trim($value), -1, PREG_SPLIT_NO_EMPTY);
        foreach ($ips as $ip) {
            $parts = explode('/', $ip);
            if (count($parts) > 2 || !filter_var($parts[0], FILTER_VALIDATE_IP) || (isset($parts[1]) && (!ctype_digit($parts[1]) || (int) $parts[1] > (str_contains($parts[0], ':') ? 128 : 32)))) {
                throw ValidationException::withMessages([$field => 'Érvényes IP-címeket vagy CIDR tartományokat adj meg, soronként egyet.']);
            }
        }
        return array_values(array_unique($ips));
    }
}
