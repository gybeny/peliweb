<?php

namespace WebNest\Filament\Server\Pages;

use App\Facades\Activity;
use App\Models\Server;
use BackedEnum;
use Filament\Facades\Filament;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Validation\ValidationException;
use WebNest\Services\Edge;
use WebNest\Services\Settings;
use WebNest\Services\SiteValidator;
use WebNest\Services\Websites as WebsiteService;

class Websites extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'tabler-world';
    protected static ?string $navigationLabel = 'Webhelykezelő';
    protected static ?string $slug = 'webnest';
    protected static ?int $navigationSort = 20;
    protected string $view = 'webnest::websites';
    public string $tab = 'sites';
    public ?int $editingId = null;
    public bool $showEditor = false;
    public array $form = [];
    public string $domain = '';
    public string $domainSiteId = '';
    public array $certificates = [];
    public ?string $error = null;

    public static function canAccess(): bool
    {
        $server = Filament::getTenant();
        return $server instanceof Server
            && in_array((int) $server->egg_id, array_map('intval', Settings::all()['egg_ids']), true)
            && (bool) user()?->can('webnest.read', $server);
    }

    public function getTitle(): string { return 'WebNest · Webhelykezelő'; }

    public function mount(): void
    {
        $this->requirePermission('read');
        $this->form = SiteValidator::defaults();
    }

    protected function requirePermission(string $ability): Server
    {
        $server = Filament::getTenant();
        abort_unless($server instanceof Server && self::canAccess() && user()?->can('webnest.'.$ability, $server), 403);
        if ($ability !== 'read') {
            $server->validateCurrentState();
        }
        return $server;
    }

    private function perform(string $permission, callable $action, string $message): void
    {
        $server = $this->requirePermission($permission);
        $this->error = null;
        $this->resetValidation();
        try {
            $action($server);
            Activity::event('server:webnest.'.$permission)->property('action', $message)->log();
            Notification::make()->title($message)->success()->send();
        } catch (ValidationException $e) {
            foreach ($e->errors() as $key => $messages) {
                $this->addError($key, implode(' ', $messages));
            }
            $this->error = 'A megadott adatok ellenőrzése sikertelen.';
        } catch (\Throwable $e) {
            report($e);
            // Do not leak Caddy config, internal URLs or daemon credentials in HTTP
            // client exception messages. Domain-specific messages remain actionable.
            $this->error = $e instanceof \RuntimeException && !($e instanceof \Illuminate\Http\Client\RequestException)
                ? mb_substr($e->getMessage(), 0, 1000)
                : 'A művelet sikertelen. Részletek a Pelican naplójában.';
            Notification::make()->title('A művelet sikertelen')->body($this->error)->danger()->send();
        }
    }

    public function selectTab(string $tab): void
    {
        $this->requirePermission('read');
        abort_unless(in_array($tab, ['sites', 'domains', 'ssl', 'deployments', 'help'], true), 404);
        $this->tab = $tab;
    }

    public function edit(?int $id = null): void
    {
        $server = $this->requirePermission('write');
        $this->editingId = $id;
        $this->resetValidation();
        $this->form = SiteValidator::defaults();
        if ($id) {
            $site = app(WebsiteService::class)->site($server, $id);
            $this->form = array_merge($this->form, $site->settings, ['name' => $site->name]);
            $this->form['allowed_ips'] = implode("\n", $site->settings['allowed_ips'] ?? []);
            $this->form['headers_json'] = json_encode($site->settings['headers'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        }
        $this->showEditor = true;
    }

    public function closeEditor(): void
    {
        $this->requirePermission('read');
        $this->showEditor = false;
        $this->editingId = null;
    }

    public function save(): void
    {
        $this->perform('write', function (Server $server) {
            app(WebsiteService::class)->save($server, $this->editingId, $this->form);
            $this->showEditor = false;
            $this->editingId = null;
        }, 'Webhelytervezet elmentve. Az élesítéshez alkalmazás szükséges.');
    }

    public function deleteSite(int $id): void
    {
        $this->perform('write', fn (Server $s) => app(WebsiteService::class)->deleteSite($s, $id), 'Webhely törlésre jelölve. A fájlok megmaradtak; alkalmazd az új konfigurációt.');
    }

    public function addDomain(): void
    {
        $this->perform('write', function (Server $s) {
            app(WebsiteService::class)->addDomain($s, (int) $this->domainSiteId, $this->domain);
            $this->domain = '';
        }, 'Domain hozzáadva. DNS igazolás és új alkalmazás szükséges.');
    }

    public function deleteDomain(int $id): void
    {
        $this->perform('write', fn (Server $s) => app(WebsiteService::class)->deleteDomain($s, $id), 'Domain törlésre jelölve. Alkalmazd a konfigurációt és frissítsd az edge-et.');
    }

    public function verifyDomain(int $id): void
    {
        $this->perform('ssl', fn (Server $s) => app(WebsiteService::class)->verify($s, $id), 'A DNS tulajdonigazolás sikeres.');
    }

    public function deploy(): void
    {
        $this->perform('deploy', fn (Server $s) => app(WebsiteService::class)->deploy($s), 'Konfiguráció elküldve. A runtime eredményét az Állapot frissítése gombbal kérdezheted le.');
    }

    public function refreshStatus(): void
    {
        $this->perform('read', fn (Server $s) => app(WebsiteService::class)->refresh($s), 'Runtime állapot lekérdezve.');
    }

    public function publishEdge(): void
    {
        $this->perform('ssl', fn (Server $s) => app(Edge::class)->sync($s), 'Caddy konfiguráció elfogadva. A tanúsítvány kiadását külön ellenőrizd; az ACME feldolgozás időt vehet igénybe.');
    }

    public function inspectCertificate(int $id): void
    {
        $this->perform('ssl', function (Server $s) use ($id) {
            $this->certificates[$id] = app(Edge::class)->certificate($s, $id);
        }, 'A TLS kapcsolat és a tanúsítvány ellenőrzése sikeres.');
    }

    public function abandonPending(): void
    {
        $this->perform('deploy', fn (Server $s) => app(WebsiteService::class)->abandon($s), 'A függő kérés ismeretlen állapottal lezárva. Új alkalmazás szükséges.');
    }

    protected function getViewData(): array
    {
        $server = $this->requirePermission('read');
        $service = app(WebsiteService::class);
        return [
            'sites' => $service->sites($server),
            'latest' => $service->latest($server),
            'edge' => Settings::forNode((int) $server->node_id),
            'server' => $server,
            'deployments' => \WebNest\Models\Deployment::query()->where('server_id', $server->id)->latest()->limit(20)->get(),
        ];
    }
}
