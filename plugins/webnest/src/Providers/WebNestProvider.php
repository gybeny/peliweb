<?php

namespace WebNest\Providers;

use App\Models\Subuser;
use App\Models\Server;
use Illuminate\Support\ServiceProvider;
use WebNest\Models\Deployment;
use WebNest\Services\Edge;
use WebNest\Services\Settings;

class WebNestProvider extends ServiceProvider
{
    public function register(): void
    {
        // rc.4 signature: translation prefix comes BEFORE the icon.
        Subuser::registerCustomPermissions('webnest', ['read', 'write', 'deploy', 'ssl'], 'webnest::permissions', 'tabler-world', false);
    }

    public function boot(): void
    {
        Server::deleting(function (Server $server) {
            $node = Settings::forNode((int) $server->node_id);
            if ($node && Deployment::query()->where('server_id', $server->id)->where('state', 'applied')->exists()) {
                // Remove edge routes BEFORE the allocation can be assigned to a
                // different customer. A failed sync aborts deletion intentionally.
                app(Edge::class)->syncNode($node['api_url'], $server->id);
            }
        });
    }
}
