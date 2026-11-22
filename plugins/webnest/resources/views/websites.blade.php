<x-filament-panels::page>
    <style>
        .wn{--wn-line:#8795a833;--wn-muted:#8292a6;--wn-accent:#14b8a6;display:grid;gap:20px}
        .wn *{box-sizing:border-box}.wn-bar,.wn-actions,.wn-tabs{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .wn-bar{justify-content:space-between}.wn-panel{border:1px solid var(--wn-line);border-radius:12px;padding:20px}
        .wn h2{font-size:18px;font-weight:650;margin-bottom:8px}.wn h3{font-size:15px;font-weight:600;margin-bottom:8px}
        .wn p,.wn small{line-height:1.65}.wn-muted{color:var(--wn-muted);font-size:13px}
        .wn button{cursor:pointer;border:1px solid var(--wn-line);padding:8px 12px;border-radius:7px;font-size:13px}
        .wn button:hover{border-color:var(--wn-accent)}.wn button:disabled{opacity:.45;cursor:wait}.wn button:focus-visible,.wn input:focus-visible,.wn select:focus-visible,.wn textarea:focus-visible{outline:2px solid var(--wn-accent);outline-offset:3px}
        .wn .wn-primary{background:#0f766e;color:white;border-color:#0f766e}.wn .wn-danger{color:#ef4444}.wn-tab-active{border-color:var(--wn-accent)!important;color:var(--wn-accent)}
        .wn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.wn-field{display:grid;gap:6px;font-size:13px}.wn-field input,.wn-field select,.wn-field textarea{width:100%;border:1px solid var(--wn-line);border-radius:7px;padding:9px;background:transparent;color:inherit}
        .wn-field select option{color:#17202d;background:white}.wn-field textarea{min-height:100px;font-family:monospace}
        .wn label.wn-check{display:flex;gap:9px;align-items:center;font-size:13px;padding:8px 0}
        .wn-table-wrap{overflow:auto}.wn table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.wn td,.wn th{padding:14px 10px;border-bottom:1px solid var(--wn-line);vertical-align:top}.wn th{color:var(--wn-muted);font-size:12px;font-weight:500}
        .wn-code{font-family:monospace;font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}.wn-tag{display:inline-block;font-size:11px;padding:3px 8px;border:1px solid var(--wn-line);border-radius:6px}.wn-good{color:#0d9488}.wn-warn{color:#d97706}
        .wn-error{border:1px solid #ef444455;background:#ef444411;border-radius:8px;padding:12px;font-size:13px;color:#ef4444}.wn-note{border-left:3px solid var(--wn-accent);padding:12px 15px;background:#14b8a60a;font-size:13px;line-height:1.6}
        .wn-space{margin-top:16px}.wn .wn-editor{border:2px solid var(--wn-accent)}.wn ol{padding-left:22px;list-style:decimal;line-height:1.9}
        .wn [wire\:loading]{font-size:12px;color:var(--wn-muted)}
    </style>
    <div class="wn">
        <div class="wn-bar">
            <div>
                <h2>Webhelyeid, egy helyen.</h2>
                <p class="wn-muted">nginx + PHP 8.4 · {{ $server->name }} · WebNest 0.1.0 előzetes</p>
            </div>
            <div class="wn-actions">
                <button wire:click="refreshStatus" wire:loading.attr="disabled">Állapot frissítése</button>
                @if(user()?->can('webnest.deploy', $server))
                    <button class="wn-primary" wire:click="deploy" wire:confirm="A mentett tervezet felülírja a WebNest által kezelt nginx konfigurációt. Csak sikeres konfigurációteszt után lép életbe. Folytatod?" wire:loading.attr="disabled">Konfiguráció alkalmazása</button>
                @endif
            </div>
        </div>
        <div class="wn-note">
            A mentés <strong>tervezetet</strong> készít. Élesítés: <strong>Alkalmazás → Állapot frissítése → Caddy publikálás</strong>.
            Az SSL és a HTTPS-átirányítás a külön edge gépen működik, nem közvetlenül az allocation portján.
        </div>
        @if($error)<div class="wn-error" role="alert">{{ $error }}</div>@endif
        @if($errors->any())
            <div class="wn-error" role="alert">@foreach($errors->all() as $message)<p>{{ $message }}</p>@endforeach</div>
        @endif
        <div wire:loading role="status">A művelet folyamatban…</div>
        <div class="wn-grid">
            <div class="wn-panel"><div class="wn-muted">Webhelyek</div><h2>{{ $sites->count() }}</h2><small>{{ $sites->where('settings.enabled', true)->count() }} engedélyezett a tervezetben</small></div>
            <div class="wn-panel"><div class="wn-muted">Domainek</div><h2>{{ $sites->sum(fn($s) => $s->domains->count()) }}</h2><small>DNS TXT igazolás szükséges a publikáláshoz</small></div>
            <div class="wn-panel"><div class="wn-muted">Utolsó alkalmazás</div><h2>{{ match($latest?->state) { 'applied' => 'Visszaigazolva', 'pending' => 'Várakozik', 'failed' => 'Sikertelen', 'unknown' => 'Ismeretlen', default => 'Még nincs' } }}</h2><small>{{ $latest?->updated_at?->format('Y-m-d H:i:s') ?? 'Az első webhely létrehozása után alkalmazd a konfigurációt.' }}</small></div>
        </div>
        <nav class="wn-tabs" aria-label="WebNest szekciók">
            @foreach(['sites' => 'Webhelyek', 'domains' => 'Domainek', 'ssl' => 'SSL és edge', 'deployments' => 'Alkalmazások', 'help' => 'Útmutató'] as $key => $label)
                <button wire:click="selectTab('{{ $key }}')" class="{{ $tab === $key ? 'wn-tab-active' : '' }}" aria-current="{{ $tab === $key ? 'page' : 'false' }}">{{ $label }}</button>
            @endforeach
        </nav>
        @if($tab === 'sites')
            <div class="wn-panel">
                <div class="wn-bar"><h2>Webhelyek</h2>@if(user()?->can('webnest.write', $server))<button wire:click="edit" class="wn-primary">Új webhely</button>@endif</div>
                <div class="wn-table-wrap">
                    <table>
                        <thead><tr><th>Webhely</th><th>Környezet</th><th>Dokumentumgyökér / cél</th><th>Tervezet</th><th>Műveletek</th></tr></thead>
                        <tbody>
                        @forelse($sites as $site)
                            <tr wire:key="site-{{ $site->id }}">
                                <td><strong>{{ $site->name }}</strong><p class="wn-muted">{{ $site->domains->pluck('hostname')->implode(', ') ?: 'Nincs hozzárendelt domain' }}</p></td>
                                <td><span class="wn-tag">{{ strtoupper($site->settings['kind']) }}</span></td>
                                <td class="wn-code">{{ $site->settings['kind'] === 'proxy' ? $site->settings['proxy_target'] : '/home/container/'.$site->settings['root'] }}</td>
                                <td class="{{ $site->settings['enabled'] ? 'wn-good' : 'wn-warn' }}">{{ $site->settings['enabled'] ? 'Engedélyezett' : 'Letiltott' }}</td>
                                <td>@if(user()?->can('webnest.write', $server))<div class="wn-actions"><button wire:click="edit({{ $site->id }})">Szerkesztés</button><button class="wn-danger" wire:click="deleteSite({{ $site->id }})" wire:confirm="Törlöd a webhely tervezetét és domain-hozzárendeléseit? A feltöltött fájlok megmaradnak. A forgalom leállításához új alkalmazás és edge frissítés kell.">Törlés</button></div>@endif</td>
                            </tr>
                        @empty
                            <tr><td colspan="5"><p>Még nincs webhely. Hozd létre az első PHP vagy statikus oldaladat.</p><p class="wn-muted">A fájlokat a Pelican Fájlok menüjében vagy SFTP-n töltheted fel.</p></td></tr>
                        @endforelse
                        </tbody>
                    </table>
                </div>
            </div>
        @elseif($tab === 'domains')
            <div class="wn-note">Minden domaint és aldomaint külön adj hozzá. A plugin nem ír DNS-rekordot a szolgáltatódnál. Wildcard SSL nem támogatott; a pontos aldomain automatikus HTTPS-t kaphat.</div>
            @if(user()?->can('webnest.write', $server))
                <form wire:submit="addDomain" class="wn-panel wn-grid">
                    <label class="wn-field">Webhely<select wire:model="domainSiteId" required><option value="">Válassz webhelyet</option>@foreach($sites as $site)<option value="{{ $site->id }}">{{ $site->name }}</option>@endforeach</select></label>
                    <label class="wn-field">Domain / aldomain<input wire:model="domain" required placeholder="blog.sajatdomain.hu"></label>
                    <div style="align-self:end"><button type="submit" class="wn-primary" wire:loading.attr="disabled">Domain hozzáadása</button></div>
                </form>
            @endif
            @forelse($sites as $site)
                @foreach($site->domains as $domainRecord)
                    <div class="wn-panel" wire:key="domain-{{ $domainRecord->id }}">
                        <div class="wn-bar"><h3>{{ $domainRecord->hostname }} <span class="wn-tag">{{ $site->name }}</span></h3><span class="{{ $domainRecord->verified_at ? 'wn-good' : 'wn-warn' }}">{{ $domainRecord->verified_at ? 'DNS tulajdonjog igazolva' : 'Igazolás szükséges' }}</span></div>
                        <p class="wn-muted">TXT rekord neve:</p><p class="wn-code">_webnest-challenge.{{ $domainRecord->hostname }}</p>
                        <p class="wn-muted">TXT rekord értéke:</p><p class="wn-code">{{ $domainRecord->challenge }}</p>
                        <p class="wn-muted wn-space">A/AAAA rekord célja: {{ $edge['edge_ip'] ?? 'Az adminisztrátortól kapott edge IP-cím. Még nincs beállítva.' }}. A hibás AAAA rekordot is javítsd vagy töröld.</p>
                        <div class="wn-actions wn-space">
                            @if(user()?->can('webnest.ssl', $server))<button wire:click="verifyDomain({{ $domainRecord->id }})" wire:loading.attr="disabled">DNS igazolás ellenőrzése</button>@endif
                            @if(user()?->can('webnest.write', $server))<button class="wn-danger" wire:click="deleteDomain({{ $domainRecord->id }})" wire:confirm="Eltávolítod ezt a domain-hozzárendelést? Ezután alkalmazd az új konfigurációt, és frissítsd az edge-et. A név biztonsági okból foglalt marad.">Domain eltávolítása</button>@endif
                        </div>
                    </div>
                @endforeach
            @empty
                <div class="wn-panel">Előbb hozz létre egy webhelyet.</div>
            @endforelse
        @elseif($tab === 'ssl')
            <div class="wn-panel">
                <h2>Automatikus HTTPS Caddy edge-del</h2>
                <p>A Caddy intézi a nyilvános tanúsítványok igénylését és megújítását. A publikálás elfogadása még nem jelenti a tanúsítvány kiadását. Az adminisztrátor pluginbeállításában alapból ACME staging tesztmód aktív; ez nem megbízható éles tanúsítvány.</p>
                <p class="wn-muted wn-space">Feltételek: igazolt TXT, helyes A/AAAA rekord, nyitott 80/443, sikeresen alkalmazott runtime konfiguráció és az edge felől elérhető allocation.</p>
                @if(!$edge)<p class="wn-warn wn-space">Az adminisztrátor még nem állított be Caddy kapcsolatot ehhez a node-hoz.</p>@endif
                @if(user()?->can('webnest.ssl', $server))
                    <button class="wn-primary wn-space" wire:click="publishEdge" wire:confirm="Az edge összes WebNest útvonala frissül az utolsó visszaigazolt konfigurációkból. Az igazolt domainekhez a Caddy tanúsítványt igényelhet. Folytatod?" wire:loading.attr="disabled">Caddy publikálás / eltávolítások szinkronizálása</button>
                @endif
            </div>
            @foreach($sites as $site)
                @foreach($site->domains as $domainRecord)
                    <div class="wn-panel" wire:key="ssl-{{ $domainRecord->id }}">
                        <div class="wn-bar"><h3>{{ $domainRecord->hostname }}</h3>@if(user()?->can('webnest.ssl', $server))<button wire:click="inspectCertificate({{ $domainRecord->id }})" wire:loading.attr="disabled">Élő tanúsítvány ellenőrzése</button>@endif</div>
                        @if(isset($certificates[$domainRecord->id]))
                            <p class="wn-good">Ellenőrzött TLS kapcsolat</p>
                            <p>Kibocsátó: {{ $certificates[$domainRecord->id]['issuer'] }}</p>
                            <p>Lejárat: {{ $certificates[$domainRecord->id]['expires'] }}</p>
                            <p class="wn-muted">Ellenőrizve: {{ $certificates[$domainRecord->id]['checked'] }}</p>
                        @else
                            <p class="wn-muted">Még nincs élő ellenőrzés. Nem feltételezünk sikeres tanúsítványkiadást.</p>
                        @endif
                    </div>
                @endforeach
            @endforeach
        @elseif($tab === 'deployments')
            <div class="wn-note">A „Visszaigazolva” állapotot kizárólag az adott kérésazonosítóhoz kapott runtime válasz állítja be. Sikertelen nginx-teszt esetén az előző konfiguráció fut tovább.</div>
            <div class="wn-panel wn-table-wrap">
                <table><thead><tr><th>Idő</th><th>Kérésazonosító</th><th>Állapot</th><th>Runtime üzenet</th></tr></thead><tbody>
                @forelse($deployments as $deployment)
                    <tr><td>{{ $deployment->created_at->format('Y-m-d H:i:s') }}</td><td class="wn-code">{{ $deployment->id }}</td><td>{{ $deployment->state }}</td><td class="wn-code">{{ $deployment->message }}</td></tr>
                @empty
                    <tr><td colspan="4">Még nem történt alkalmazás.</td></tr>
                @endforelse
                </tbody></table>
                <p class="wn-muted wn-space">A műveletek a Pelican Tevékenység menüjében is megjelennek. nginx/PHP kimenet: Konzol.</p>
                @if($latest?->state === 'pending' && user()?->can('webnest.deploy', $server))
                    <button class="wn-danger wn-space" wire:click="abandonPending" wire:confirm="Előbb állítsd le a konténert! A lezárás nem jelent visszaállítást. Ezután indítsd el és küldj új konfigurációt. Legalább 5 perce függő kérés zárható le.">Elakadt kérés lezárása</button>
                @endif
            </div>
        @else
            <div class="wn-panel">
                <h2>Első webhely élesítése</h2>
                <ol>
                    <li>Az adminisztrátor telepítse a WebNest runtime image-et és egget, majd engedélyezze az egget a plugin beállításaiban.</li>
                    <li>Indítsd el a szervert. Az allocation portja legalább 1024 legyen.</li>
                    <li>Hozz létre webhelyet, majd töltsd fel a fájlokat a megadott dokumentumgyökérbe a Pelican fájlkezelőjével vagy SFTP-n.</li>
                    <li>Add hozzá a domaineket, állítsd be a DNS TXT és A/AAAA rekordokat, majd ellenőrizd az igazolást.</li>
                    <li>Alkalmazd a konfigurációt, majd frissítsd az állapotot, amíg „Visszaigazolva” nem lesz.</li>
                    <li>Az SSL oldalon publikáld az edge konfigurációt, majd ellenőrizd az élő tanúsítványt.</li>
                </ol>
                <p class="wn-muted wn-space">A biztonsági headerek, a PHP-limitek, az IP-szűrés és a reverse proxy webhelyenként a Szerkesztés alatt állítható.</p>
                <p class="wn-muted">Az IP-szűrés és rate limit csak az adminisztrátor által megadott megbízható proxyk mögött lát valódi kliens IP-t. Enélkül az edge IP-jét szabályozza. A HTTPS-jelzés is csak megbízható proxytól fogadható el.</p>
                <p class="wn-muted">Nincs automatikus DNS-szolgáltatói integráció, wildcard SSL, WAF vagy DDoS-védelem. A fájlok és az adatbázis mentéséről a Pelican meglévő eszközeivel gondoskodj.</p>
            </div>
        @endif
        @if($showEditor)
            <form wire:submit="save" class="wn-panel wn-editor">
                <div class="wn-bar"><h2>{{ $editingId ? 'Webhely szerkesztése' : 'Új webhely' }}</h2><button type="button" wire:click="closeEditor">Bezárás</button></div>
                <div class="wn-grid">
                    <label class="wn-field">Webhely neve<input wire:model="form.name" required maxlength="100"></label>
                    @if(!$editingId)<label class="wn-field">Elsődleges domain<input wire:model="form.domain" required placeholder="sajatdomain.hu"></label>@endif
                    <label class="wn-field">Környezet<select wire:model.live="form.kind"><option value="php">PHP 8.4 + nginx</option><option value="static">Statikus nginx</option><option value="proxy">Reverse proxy</option></select></label>
                    <label class="wn-field">Dokumentumgyökér (relatív)<input wire:model="form.root" required placeholder="sites/sajatoldal/public"><small class="wn-muted">Csak sites/ alatti könyvtár. A runtime létrehozza, de nem tölt fel weboldalt.</small></label>
                </div>
                <div class="wn-actions wn-space">
                    <label class="wn-check"><input type="checkbox" wire:model="form.enabled">Webhely engedélyezése</label>
                    <label class="wn-check"><input type="checkbox" wire:model="form.force_https">HTTPS-kényszerítés az edge-en</label>
                    <label class="wn-check"><input type="checkbox" wire:model="form.block_dotfiles">Rejtett fájlok tiltása</label>
                </div>
                <h3 class="wn-space">PHP és korlátok</h3>
                <div class="wn-grid">
                    <label class="wn-field">Feltöltési limit (MB)<input type="number" min="1" max="1024" wire:model.number="form.upload_mb" required></label>
                    <label class="wn-field">PHP memória (MB)<input type="number" min="32" max="2048" wire:model.number="form.memory_mb" required></label>
                    <label class="wn-field">Rate limit (kérés/másodperc)<input type="number" min="1" max="10000" wire:model.number="form.rate_limit" required></label>
                </div>
                <h3 class="wn-space">Reverse proxy</h3>
                <label class="wn-field">Konténeren belüli upstream<input wire:model="form.proxy_target" placeholder="http://127.0.0.1:3000"><small class="wn-muted">Csak proxy típusnál érvényes. Az upstream alkalmazást neked kell elindítanod; a WebNest nem telepíti.</small></label>
                <label class="wn-check"><input type="checkbox" wire:model="form.websocket">WebSocket továbbítás</label>
                <h3 class="wn-space">Biztonság és headerek</h3>
                <div class="wn-grid">
                    <label class="wn-field">Engedélyezett IP / CIDR (üres = mindenki)<textarea wire:model="form.allowed_ips" placeholder="Egy IP vagy CIDR soronként"></textarea><small class="wn-muted">Valódi kliens IP-hez adminisztrátori megbízhatóproxy-beállítás szükséges. Enélkül az edge címe látszik.</small></label>
                    <label class="wn-field">Válasz headerek (JSON)<textarea wire:model="form.headers_json" rows="8" required spellcheck="false"></textarea><small class="wn-muted">Engedélyezett: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Content-Security-Policy, Cache-Control.</small></label>
                </div>
                <p class="wn-muted wn-space">A .env és .git fájlok, valamint a könyvtárlistázás mindig tiltva maradnak. Tetszőleges nginx direktíva megadása biztonsági okból nem engedélyezett.</p>
                <button type="submit" class="wn-primary wn-space" wire:loading.attr="disabled">Tervezet mentése</button>
            </form>
        @endif
    </div>
</x-filament-panels::page>
