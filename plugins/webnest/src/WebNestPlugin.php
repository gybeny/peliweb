<?php

namespace WebNest;

use App\Contracts\Plugins\HasPluginSettings;
use App\Models\Egg;
use App\Models\Node;
use Filament\Contracts\Plugin;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Panel;
use WebNest\Models\Setting;
use WebNest\Services\Settings;

class WebNestPlugin implements Plugin, HasPluginSettings
{
    public function getId(): string
    {
        return 'webnest';
    }

    public function register(Panel $panel): void
    {
        if ($panel->getId() === 'server') {
            $panel->pages([\WebNest\Filament\Server\Pages\Websites::class]);
        }
    }

    public function boot(Panel $panel): void {}

    public function getSettingsFormData(): array
    {
        return Settings::all();
    }

    public function getSettingsForm(): array
    {
        return [
            Toggle::make('acme_staging')->label('ACME tesztmód (staging)')
                ->helperText('Alapból bekapcsolva. Nem böngésző által megbízható tanúsítványt ad. Éles módot csak sikeres hálózati próba után válassz, majd publikálj újra.'),
            TextInput::make('acme_email')->label('ACME kapcsolattartói email (opcionális)')->email(),
            Select::make('egg_ids')->label('Engedélyezett WebNest eggek')
                ->options(fn () => Egg::query()->pluck('name', 'id')->all())
                ->multiple()->required()->helperText('Csak a mellékelt runtime-mal működő eggeket engedélyezd. Más PHP/nginx eggek nem automatikusan kompatibilisek.'),
            Repeater::make('nodes')->label('Caddy edge kapcsolatok (opcionális)')
                ->schema([
                    Select::make('node_id')->label('Pelican node')->options(fn () => Node::query()->pluck('name', 'id')->all())->required()->distinct(),
                    TextInput::make('api_url')->label('Privát Caddy admin API URL')->placeholder('http://10.0.0.2:2019')->required(),
                    TextInput::make('edge_ip')->label('Publikus edge IP a DNS-hez')->required(),
                    Textarea::make('trusted_proxy_ips')->label('Megbízható edge forrás IP / CIDR')
                        ->helperText('Azok a címek, amelyekről az edge a konténerhez kapcsolódik. Soronként egy IP/CIDR. Csak ezektől fogadunk el valódi kliens IP-t és HTTPS jelzést. Üresen egyik proxyt sem tekintjük megbízhatónak.'),
                ])->helperText('Az API-t kizárólag a panel érhesse el privát hálózaton/VPN-en! Dedikált Caddy-példány használata javasolt. Az edge gépnek el kell érnie a szerver allocation címét.'),
        ];
    }

    public function saveSettings(array $data): void
    {
        $settings = Settings::validate($data);
        Setting::query()->updateOrCreate(['key' => 'settings'], ['value' => $settings]);
        Notification::make()->title('WebNest beállítások elmentve')->success()->send();
    }
}
