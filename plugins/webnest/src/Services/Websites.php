<?php

namespace WebNest\Services;

use App\Models\Server;
use App\Repositories\Daemon\DaemonFileRepository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use WebNest\Models\Deployment;
use WebNest\Models\Domain;
use WebNest\Models\Site;

class Websites
{
    public function sites(Server $server)
    {
        return Site::query()->where('server_id', $server->id)->with('domains')->orderBy('id')->get();
    }

    public function site(Server $server, int $id): Site
    {
        return Site::query()->where('server_id', $server->id)->findOrFail($id);
    }

    public function domain(Server $server, int $id): Domain
    {
        return Domain::query()->whereHas('site', fn ($q) => $q->where('server_id', $server->id))->findOrFail($id);
    }

    public function save(Server $server, ?int $id, array $form): Site
    {
        $data = SiteValidator::site($form);
        $hostname = !$id ? SiteValidator::hostname($form['domain'] ?? '') : null;
        return Cache::lock("webnest:server:$server->id", 30)->block(5, fn () => DB::transaction(function () use ($server, $id, $data, $hostname) {
            $site = $id ? $this->site($server, $id) : new Site(['server_id' => $server->id]);
            $site->name = $data['name'];
            unset($data['name']);
            $site->settings = $data;
            $site->save();
            if ($hostname) {
                $this->createDomain($site, $hostname);
            }
            return $site;
        }));
    }

    private function createDomain(Site $site, string $hostname): Domain
    {
        if (Domain::withTrashed()->where('hostname', $hostname)->exists()) {
            throw ValidationException::withMessages(['domain' => 'Ez a domain már foglalt vagy korábban lefoglalt. Visszaállításához adminisztrátor szükséges.']);
        }
        return $site->domains()->create(['hostname' => $hostname, 'challenge' => bin2hex(random_bytes(24))]);
    }

    public function addDomain(Server $server, int $siteId, string $value): void
    {
        $hostname = SiteValidator::hostname($value);
        Cache::lock("webnest:server:$server->id", 30)->block(5, fn () => $this->createDomain($this->site($server, $siteId), $hostname));
    }

    public function deleteSite(Server $server, int $id): void
    {
        Cache::lock("webnest:server:$server->id", 30)->block(5, function () use ($server, $id) {
            $site = $this->site($server, $id);
            DB::transaction(function () use ($site) {
                $site->domains()->delete();
                $site->delete();
            });
        });
    }

    public function deleteDomain(Server $server, int $id): void
    {
        Cache::lock("webnest:server:$server->id", 30)->block(5, fn () => $this->domain($server, $id)->delete());
    }

    public function verify(Server $server, int $id): void
    {
        $domain = $this->domain($server, $id);
        $records = dns_get_record('_webnest-challenge.'.$domain->hostname, DNS_TXT);
        foreach ($records ?: [] as $record) {
            if (hash_equals($domain->challenge, $record['txt'] ?? implode('', $record['entries'] ?? []))) {
                $domain->update(['verified_at' => now()]);
                return;
            }
        }
        throw ValidationException::withMessages(['domain' => 'A DNS TXT rekord még nem található vagy nem egyezik. Várd meg a DNS frissülését, majd próbáld újra.']);
    }

    public function latest(Server $server): ?Deployment
    {
        return Deployment::query()->where('server_id', $server->id)->latest('created_at')->latest('id')->first();
    }

    public function deploy(Server $server): Deployment
    {
        return Cache::lock("webnest:server:$server->id", 45)->block(5, function () use ($server) {
            if ($this->latest($server)?->state === 'pending') {
                throw new RuntimeException('Már van függőben lévő alkalmazás. Először kérdezd le az állapotát.');
            }
            $files = app(DaemonFileRepository::class)->setServer($server);
            $marker = json_decode($files->getContent('/webnest/capabilities.json', 4096), true, 16, JSON_THROW_ON_ERROR);
            if (($marker['protocol'] ?? null) !== 1) {
                throw new RuntimeException('Nem támogatott vagy nem futó WebNest runtime. A mellékelt egget használd.');
            }
            $sites = $this->sites($server)->map(fn (Site $site) => [
                'id' => $site->id,
                'name' => $site->name,
                'settings' => $site->settings,
                'domains' => $site->domains->map(fn (Domain $d) => ['hostname' => $d->hostname, 'verified' => $d->verified_at !== null])->all(),
            ])->all();
            $port = (int) $server->allocation?->port;
            $node = Settings::forNode((int) $server->node_id);
            $trusted = SiteValidator::networks($node['trusted_proxy_ips'] ?? '', 'trusted_proxy_ips');
            $config = (new NginxRenderer())->render($sites, $port, $trusted);
            $deployment = Deployment::query()->create([
                'id' => (string) Str::uuid(), 'server_id' => $server->id,
                'state' => 'pending', 'snapshot' => ['sites' => $sites, 'port' => $port],
                'message' => 'A runtime visszaigazolására vár.',
            ]);
            try {
                // Wings rename is atomic on the server volume; runtime never reads a
                // half-written JSON document.
                $tmp = 'request-'.$deployment->id.'.json';
                $files->putContent('/webnest/'.$tmp, json_encode([
                    'protocol' => 1, 'revision' => $deployment->id,
                    'nginx' => $config,
                    'roots' => array_values(array_unique(array_column(array_column($sites, 'settings'), 'root'))),
                ], JSON_THROW_ON_ERROR))->throw();
                $files->renameFiles('/webnest', [['from' => $tmp, 'to' => 'request.json']])->throw();
            } catch (\Throwable $e) {
                $deployment->update(['state' => 'failed', 'message' => 'A konfiguráció nem jutott el a Wingshez.']);
                throw $e;
            }
            return $deployment;
        });
    }

    public function refresh(Server $server): ?Deployment
    {
        return Cache::lock("webnest:server:$server->id", 30)->block(5, function () use ($server) {
            $deployment = $this->latest($server);
            if (!$deployment || $deployment->state !== 'pending') {
                return $deployment;
            }
            $files = app(DaemonFileRepository::class)->setServer($server);
            $result = json_decode($files->getContent('/webnest/status.json', 16384), true, 32, JSON_THROW_ON_ERROR);
            if (($result['revision'] ?? null) !== $deployment->id) {
                return $deployment; // Never accept a stale runtime acknowledgement.
            }
            if (!in_array($result['state'] ?? '', ['applied', 'failed'], true)) {
                return $deployment;
            }
            DB::transaction(function () use ($deployment, $result, $server) {
                if ($result['state'] === 'applied') {
                    Deployment::query()->where('server_id', $server->id)->where('state', 'applied')->update(['state' => 'superseded']);
                }
                $deployment->update([
                    'state' => $result['state'],
                    'message' => mb_substr((string) ($result['message'] ?? ''), 0, 8000),
                ]);
            });
            return $deployment;
        });
    }

    public function abandon(Server $server): void
    {
        Cache::lock("webnest:server:$server->id", 30)->block(5, function () use ($server) {
            $latest = $this->latest($server);
            if (!$latest || $latest->state !== 'pending' || $latest->created_at->gt(now()->subMinutes(5))) {
                throw new RuntimeException('Csak legalább 5 perce függőben lévő kérés zárható le. Előbb állítsd le a konténert!');
            }
            // No false claim that the runtime rolled back: the uncertain state must
            // be reconciled with a NEW apply before publishing edge configuration.
            $latest->update(['state' => 'unknown', 'message' => 'Kézzel lezárt, ismeretlen runtime állapot. Új alkalmazás szükséges.']);
        });
    }
}
