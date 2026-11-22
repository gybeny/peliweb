<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('webnest_settings')) Schema::create('webnest_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value');
            $table->timestamps();
        });
        if (!Schema::hasTable('webnest_sites')) Schema::create('webnest_sites', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->string('name', 100);
            $table->json('settings');
            $table->softDeletes();
            $table->timestamps();
        });
        if (!Schema::hasTable('webnest_domains')) Schema::create('webnest_domains', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('webnest_sites')->cascadeOnDelete();
            $table->string('hostname', 253)->unique();
            $table->string('challenge', 64);
            $table->timestamp('verified_at')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        if (!Schema::hasTable('webnest_deployments')) Schema::create('webnest_deployments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedInteger('server_id');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->string('state', 20)->default('pending');
            $table->json('snapshot');
            $table->text('message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        // Pelican runs down() on uninstall. Retain user configuration and domain
        // reservations intentionally; permanent removal is a separate admin action.
        // This also prevents an uninstalled plugin from orphaning active Caddy
        // routes while releasing the hostname to a different customer.
    }
};
