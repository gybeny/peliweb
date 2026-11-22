# WebNest – Pelican Webhelykezelő

**0.1.0 előzetes kiadás · Pelican Panel 1.0.0-rc.4 · tesztkörnyezetbe**

Ez egy natív PHP/Laravel/Filament plugin, nem a panelhez távolról csatlakozó
React alkalmazás. A hozzá tartozó böngészős bemutató csak helyi mintadatokat
kezel; nem létesít kapcsolatot a szervereddel, és a natív Filament felület
megjelenése nem teljesen azonos a bemutatóval.

## Fontos az első telepítés előtt

- Az rc.4 tag tényleges forrásához készült: PHP 8.4+, Laravel 13, Filament 5,
  `App\Repositories\Daemon\DaemonFileRepository`, plugin API 1.
- Ebben a fejlesztőkörnyezetben nincs telepített Pelican/Wings, nyilvános DNS
  és ACME edge. A PHP/Python szintaktika és a renderelt nginx konfiguráció
  ellenőrizhető, de ez **nem helyettesíti a Pelican integrációs próbát**.
- Először külön tesztpanelen, üres tesztszerverrel próbáld ki. Meglévő
  webhelyet ne állíts át az első telepítés részeként.
- Nincs előre publikált WebNest konténerimage. A runtime forrását megkapod,
  de saját image-et kell buildelned és registrybe feltöltened.
- A plugin a Pelican meglévő bejelentkezését és szerverjogosultságait használja.
  Nem kell új felhasználókezelés vagy panel API-kulcs.

## Letölthető fájlok

| Fájl | Tartalom |
| --- | --- |
| `webnest-plugin.zip` | Közvetlenül importálható `webnest/` pluginmappa |
| `webnest-runtime.zip` | Dockerfile, Python supervisor, PHP-FPM konfiguráció, egg és Caddy példa |
| `egg-webnest.json` | Importálható PTDL_v2 egg; az image nevét előbb cseréld ki |
| `SHA256SUMS` | A csomagok ellenőrzőösszege |

## Felépítés

```text
Látogató
  → DNS A/AAAA: a Caddy edge címe
  → Caddy :80/:443 (ACME, HTTPS, WebSocket, domain szerinti routing)
  → Pelican node allocation IP:PORT
  → WebNest konténer nginx
      → statikus fájlok
      → PHP-FPM 127.0.0.1:9000
      → opcionális, saját konténeren belüli HTTP upstream
```

A panel a saját, már hitelesített Wings fájl API-ján adja át a konfigurációt.
A konténer nem kap panelkulcsot, host root jogot vagy Docker socketet.
A Caddy admin API kizárólag privát hálózaton/VPN-en legyen elérhető a panelről.
Az edge el kell érje minden érintett node allocation címét.

## 1. Runtime image elkészítése

Ezt **a saját Docker build gépeden**, nem a Pelican webes konzoljában futtasd.

```bash
unzip webnest-runtime.zip
cd runtime
# A registry.example.org helyére a SAJÁT registryd neve kerüljön.
docker build --pull -t registry.example.org/webnest/runtime:php84 .
docker push registry.example.org/webnest/runtime:php84
```

A Dockerfile a karbantartott hivatalos `php:8.4-fpm-alpine` alapot használja,
nginx-szel, Python 3-mal, mysqli/pdo_mysql/intl/zip/opcache modulokkal.
A PHP 8.4 minor ágon belüli hibajavításokat az image újraépítésével kapod meg.
Az image buildelését/tesztelését és a rendszeres újraépítést neked kell
elvégezned. Éles használatra ellenőrzött image digest rögzítése javasolt.

Az `egg-webnest.json` `docker_images` mezőjében cseréld ki a példaképet a
ténylegesen feltöltött image nevére. Privát registry esetén a Wings registry
hozzáférését is állítsd be a saját infrastruktúrádon. A példacím nem működő
letöltési hely.

## 2. Egg és szerver

1. Pelican Admin → Eggs → Import: a módosított `egg-webnest.json`.
2. Hozz létre egy üres szervert ezzel az eggel.
3. A fő allocation **1024–65535** közötti port legyen.
4. Legalább 512 MB memória, 1 GB lemez és kezdetben 100% CPU ésszerű tesztalap.
   A PHP nyolc ondemand workerének terhelése ennél többet is igényelhet.
5. Indítsd el. A konzolon a `WebNest ready` üzenet jelzi a supervisor indulását,
   nem egy webhely külső elérhetőségét.

Az egg telepítése csak üres könyvtárat és kezdő HTML-t készít. A plugin nem
telepít WordPresst, nem frissít alkalmazást és nem módosít adatbázist.
Más nginx/PHP egg csak külön adapterrel válik kompatibilissé.

## 3. Plugin telepítése

**Ajánlott:** Admin → Plugins → Import → `webnest-plugin.zip` → Install.
Várd meg a háttérfeladat befejezését. A Pelican queue workerének futnia kell.

Kézi telepítéskor a ZIP-ből a `webnest` mappát a panel `plugins` mappájába
csomagold ki. Példa a szokásos telepítési helyre:

```bash
cd /var/www/pelican
unzip /eleresi/ut/webnest-plugin.zip -d plugins
php artisan p:plugin:install webnest
php artisan optimize:clear
```

A plugin adatbázistáblái a telepítés során jönnek létre. Ne futtass külön
SQL-t. A mappa neve és a plugin ID is `webnest`.

Admin → Plugins → WebNest → Settings:

- Válaszd ki az importált WebNest egget az engedélyezett eggek között.
- SSL nélkül is használhatod az nginx/PHP kezelést.
- SSL-hez add hozzá a node → privát Caddy API URL → publikus edge IP párost.
- Add meg a **megbízható edge forrás IP/CIDR** mezőt: az edge-nek azt a címét,
  amelyet a konténer ténylegesen TCP partnerként lát. Ne engedélyezz tág,
  más ügyfelek által elérhető tartományt. Csak ebből a körből fogadjuk el
  az eredeti kliens IP-t és a HTTPS-jelzést.

A tulajdonos a szerveroldali Webhelykezelő menüt kapja meg. Alfelhasználóknak
külön adható `webnest.read`, `webnest.write`, `webnest.deploy`, `webnest.ssl`.
A plugin minden műveletnél újra ellenőrzi a szervert és a jogosultságot.

## 4. Caddy edge és automatikus SSL

1. Külön, általad kezelt edge gépen telepíts aktuális Caddy 2-t.
2. A mellékelt `edge/Caddyfile.example` privát IP-jét cseréld ki.
3. Az admin API portját (**2019**) tűzfallal kizárólag a panel privát IP-jének
   engedd. Ne tedd ki internetre és ne add meg ügyfélnek. Privát hálózat/VPN
   nélkül ezt a kapcsolatot ne használd.
4. Nyisd ki a publikus TCP 80/443-at, szükség esetén UDP 443-at.
5. Az edge gépről ellenőrizd a node allocation címének elérhetőségét.
6. Induláskor töltsd be az alap Caddyfile-t. Az első pluginpublikálás után az
   autosave már a generált útvonalakat tartalmazza. A Caddy szolgáltatás
   újraindításakor **`caddy run --resume`** szükséges; egy üres statikus
   Caddyfile minden indításkor eltüntetné a plugin útvonalait.

A plugin a Caddy `/config/` és `/load` API-ját használja. Két szervert kezel:
`webnest_http` és `webnest_https`. A többi Caddy beállítást megőrzi, de a
névütközések és más rendszerek egyidejű konfigurációírása elkerülésére
**dedikált példány javasolt**. A teljes érintett edge konfiguráció
szinkronizálódik, közös endpoint esetén az összes kapcsolódó node-dal.

A plugin beállításaiban alapból **Let's Encrypt staging** aktív. Ez szándékosan nem
böngésző által megbízható tanúsítványt ad; az élő tanúsítványellenőrzés ilyenkor
hibát jelez. A hálózati próba után az admin pluginbeállításában kapcsold ki
az ACME tesztmódot, adj meg kapcsolattartói emailt, és publikálj újra.
A plugin explicit, a kezelt domainekre korlátozott automatizálási policyt ír;
nem hagyatkozik az üres induló Caddyfile globális CA-beállításaira.
Már tárolt staging tanúsítvány esetén kövesd a Caddy staging→production
átállási eljárását, majd újra ellenőrizd az élő tanúsítványt.
Ha az induló Caddyfile-t töltöd újra, a pluginból ismét publikálj.
Az ACME rate limitekre figyelj. A megújítást Caddy végzi, külön panel cron nélkül.

## 5. Webhely, domain, igazolás

1. Webhelykezelő → Új webhely. PHP, statikus vagy reverse proxy választható.
2. Dokumentumgyökér például `sites/cegesoldal/public`.
3. Töltsd fel a tartalmat a Pelican Fájlok menüjén vagy SFTP-n:
   `/home/container/sites/cegesoldal/public`.
4. A Domainek alatt add hozzá az aldomaineket is, egyenként.
5. A DNS-szolgáltatódnál:
   - A rekord → a publikus edge IPv4;
   - AAAA → csak akkor, ha az edge IPv6-ja is helyes és elérhető;
   - `_webnest-challenge.<teljes-domain>` TXT → a panelen mutatott érték.
6. DNS igazolás ellenőrzése. A TXT a domain feletti kontrollt bizonyítja,
   nem a webhely külső működését.
7. **Konfiguráció alkalmazása → Állapot frissítése**. Csak a megfelelő
   revízióazonosító visszaigazolása állítja `applied` állapotba a kérést.
8. **SSL és edge → Caddy publikálás**.
9. **Élő tanúsítvány ellenőrzése**. Ez a beállított edge IP-re kapcsolódik,
   a domain SNI nevével, hitelesítve a láncot és a hostnevet.

Az A/AAAA rekordot és a TXT-t nem a plugin hozza létre. Wildcard domain és
DNS-01 nem része ennek a kiadásnak.

## Biztonság és korlátok

- Nincs tetszőleges nginx direktíva vagy shell parancs ügyfélűrlapon.
- A dokumentumgyökér csak `sites/` alatt, biztonságos útvonalszegmensekkel
  adható meg. Symlink dokumentumgyökér nem támogatott.
- Könyvtárlistázás mindig tiltott; `.env` és `.git` hozzáférés tiltott.
- Headerek engedélylistáról választhatók; CR/LF és a `$` változójel nem
  engedélyezett, az idézőjelek és backslash karakterek escape-elve vannak.
- Reverse proxy csak **`http://127.0.0.1:1024..65535`** célra állítható.
  Nem mutathat a saját nginx portjára. Az upstream alkalmazást te indítod;
  ez a runtime alapból csak PHP-FPM-et és nginx-et futtat.
- Rate limit és az opcionális IP/CIDR hozzáférési lista a valódi kliens IP-re
  vonatkozik, **ha az admin beállította a megbízható edge forrás IP-ket**.
  Enélkül a TCP partner, azaz az edge címe látszik. A plugin nem bízik meg
  tetszőleges látogató X-Forwarded-For/X-Forwarded-Proto fejlécében.
- A PHP `HTTPS` és `REQUEST_SCHEME` értékét, illetve a proxy upstreamnek
  átadott protokollt csak megbízható edge-ről érkező információ alapján állítja.
- A konténer HTTP allocationját tűzfallal korlátozd az edge-re. Ha közvetlenül
  is elérhető, az edge HTTPS-kényszerítése megkerülhető.
- Az edge→node szakasz HTTP; csak megbízható hálózaton/VPN-en használd.
  Ez a kiadás nem állít be upstream mTLS-t.
- A konténerben futó PHP alkalmazás ugyanannak a szerverfelhasználónak a
  fájljaihoz fér hozzá. A plugin **nem izolálja egymástól az egy szerveren
  belüli webhelyeket**; egymásban nem bízó ügyfeleknek külön Pelican szerver kell.
- Nincs WAF, botvédelem vagy DDoS-védelem.
- Nincs közvetlen fájlkezelő-duplikáció; a meglévő Pelican fájlkezelőt használd.

## Módosítás, törlés és helyreállítás

A mentés és törlés először csak tervezetet módosít. Életbe léptetéshez új
alkalmazás, runtime visszaigazolás és Caddy szinkronizálás kell. A webhely
törlése **nem törli a feltöltött fájlokat**.

A domainek soft delete után is globálisan foglaltak maradnak, így egy régi
edge útvonal nem irányítható át észrevétlenül egy másik ügyfélhez.
Visszaállításukat adminisztrátor végezheti a saját adatok ellenőrzése után;
ebben a kiadásban nincs automatikus újrafoglalás.

nginx-teszthiba esetén az új konfiguráció nem lép életbe. Újratöltési hiba
esetén a supervisor megpróbálja visszaállítani az előző konfigurációt, és a
visszaállítás hibáját is jelenti. Nem állítja sikeresnek a hibás műveletet.
A runtime az utolsó elfogadott konfigurációt újraindításkor is betölti.

Elakadt kérés: nézd meg a Konzolt, frissítsd az állapotot. Ha legalább 5 perce
nem érkezik válasz, előbb állítsd le a konténert, majd az Alkalmazások oldalon
zárd le a kérést. Indítás után új alkalmazás és visszaigazolás kötelező;
a kézi lezárás nem bizonyít visszaállítást.

Allocation portváltás után új alkalmazás szükséges. Caddy API endpoint
cseréje előtt az érintett webhelyeket tiltsd le, alkalmazd, és szinkronizáld
a régi edge-et. Aktív ismert útvonalaknál a plugin tiltja a kapcsolat törlését.

Szervertörléskor a plugin előbb eltávolítja az edge útvonalakat. Ha a Caddy
nem érhető el, a szervertörlés szándékosan megszakad, nehogy a felszabadított
allocation egy másik ügyfélhez vigye a régi domainek forgalmát. Ilyenkor
állítsd helyre a Caddy kapcsolatot, szinkronizálj, majd próbáld újra.

## Eltávolítás

1. Tiltsd le az érintett webhelyeket.
2. Alkalmazás → visszaigazolás → Caddy szinkronizálás minden érintett szervernél.
3. Ellenőrizd, hogy nincs WebNest útvonal a Caddyben.
4. Ezután távolítsd el a plugint.

A plugin eltávolítása **nem törli a webhelyadatokat, domainfoglalásokat vagy
fájlokat**. Újratelepítéskor a táblákat megőrzi. Végleges adateltávolítás
külön, tudatos adminisztrátori művelet. A runtime-ot és Caddy szolgáltatást
a plugin nem állítja le távolról.

## Telepítés utáni ellenőrzőlista

- Tulajdonos: menü megjelenik a támogatott eggen, más eggen nem.
- Alfelhasználó: olvasási joggal nem ment/deployol/publikál.
- Két szerver: egyik azonosítóival sem érhető el a másik webhelye/domainje.
- PHP és statikus próbaoldal, aldomain és Host-fallback helyes.
- Hibás konfiguráció után a korábbi oldal működik.
- Hibás DNS TXT esetén nincs Caddy publikálás az adott domainre.
- Staging, majd éles ACME kiadás és valódi cert lejárat ellenőrzése.
- Caddy és konténer újraindítása után is megmaradnak az útvonalak.
- Webhely/domain/szerver törlése után nincs régi edge útvonal.
- A 2019 és allocation portok internet felől nem érhetők el közvetlenül.

Hivatkozások:
- https://pelican.dev/docs/panel/advanced/plugins/
- https://github.com/pelican-dev/panel/tree/v1.0.0-rc.4
- https://caddyserver.com/docs/api
- https://hub.docker.com/_/php
