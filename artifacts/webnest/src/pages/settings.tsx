import { useRef, useState } from "react";
import { Download, FileJson, BookOpen, RotateCcw, Upload, Package, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Code, Confirm, PageHeader, Panel } from "@/components/bits";
import { useToast } from "@/hooks/use-toast";
import { actions, getState, RELEASE, type State } from "@/lib/store";
import { EggConfigurator } from "@/components/egg-configurator";

const base = import.meta.env.BASE_URL;

export default function Settings() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  const exportState = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "webnest-bemutato.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try {
      const s = JSON.parse(await f.text()) as State;
      if (!Array.isArray(s.sites) || !Array.isArray(s.domains) || !Array.isArray(s.sampleCerts) || !Array.isArray(s.activity)) throw new Error();
      actions.importState(s); setErr(""); toast({ title: "Importálva", description: `${s.sites.length} webhely betöltve.` });
    } catch { setErr("A fájl nem érvényes WebNest bemutató export."); }
  };

  const links = [
    { href: `${base}downloads/webnest-plugin.zip`, icon: Download, t: "Natív Pelican bővítmény", d: "webnest-plugin.zip · Pelican 1.0.0-rc.4" },
    { href: `${base}downloads/webnest-runtime.zip`, icon: Package, t: "Runtime csomag (kötelező)", d: "webnest-runtime.zip · Dockerfile, manager, Caddy példa" },
    { href: `${base}downloads/egg-webnest.json`, icon: FileJson, t: "WebNest egg sablon", d: "PLCN_v3 · runtime image beállítása kötelező" },
    { href: `${base}downloads/TELEPITES.md`, icon: BookOpen, t: "Telepítési útmutató", d: "TELEPITES.md" },
    { href: `${base}downloads/SHA256SUMS`, icon: Hash, t: "Ellenőrzőösszegek", d: "SHA256SUMS" },
  ];

  return (
    <>
      <PageHeader kicker="Beállítások" title="Telepítés és bemutató" desc="Töltsd le a natív bővítményt a valódi használathoz, vagy kezeld ennek az előnézetnek a helyi állapotát." />
      <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" data-testid="text-release-status">
        <div className="font-mono font-bold text-primary">{RELEASE}</div>
        <p className="text-muted-foreground mt-1">A natív forráskód még nem futott valódi Pelican példányban — az integráció nem ellenőrzött. Csak tesztkörnyezetben használd.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {links.map((l) => (
          <a key={l.t} href={l.href} download className="group rounded-xl border bg-card p-4 flex gap-3 hover:border-primary/50 hover:-translate-y-0.5 transition-all" data-testid={`link-download-${l.d.split(" ")[0]}`}>
            <l.icon className="h-5 w-5 text-primary mt-0.5" /><div><div className="font-bold text-sm group-hover:text-primary">{l.t}</div><div className="font-mono text-[11px] text-muted-foreground">{l.d}</div></div>
          </a>
        ))}
      </div>
      <div className="mb-5"><EggConfigurator /></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Telepítés a Pelican Panelre">
          <ol className="space-y-2 text-sm list-decimal pl-4 marker:text-primary marker:font-mono mb-4">
            <li>Építsd meg és töltsd fel a saját runtime image-et a <span className="font-mono">webnest-runtime.zip</span> Dockerfile-jából — kész image nincs publikálva.</li>
            <li>A fenti űrlapon add meg az elkészített runtime image nevét, és töltsd le a beállított egget. A sablon példacíme önmagában nem működik.</li>
            <li>Importáld az <span className="font-mono">egg-webnest-configured.json</span> fájlt (Admin › Eggs). Meglévő eggnél az adatokat frissítsd; szervert ne törölj.</li>
            <li>Importáld/telepítsd a bővítmény zipet (lásd parancs).</li>
            <li>A bővítmény admin beállításaiban válaszd ki az engedélyezett egg ID-kat.</li>
            <li>Opcionális: node-onként privát Caddy API hozzárendelés. A Caddy edge kezeli a 80/443-at, a Let's Encryptet és a HTTPS átirányítást; a konténer nginx + PHP-FPM 8.4 az allocation porton fut.</li>
            <li>Domainenként: TXT <span className="font-mono">_webnest-challenge.&lt;hosztnév&gt;</span> → runtime alkalmazás → nyugtázás frissítése → Caddy publikálás → élő tanúsítvány ellenőrzése.</li>
          </ol>
          <Code>{`cd /var/www/pelican
unzip webnest-plugin.zip -d plugins
php artisan p:plugin:install webnest`}</Code>
          <p className="text-[11px] text-muted-foreground mt-2">Kézi kicsomagolás után a <span className="font-mono">php artisan p:plugin:install webnest</span> parancs a helyes. Részletek: TELEPITES.md.</p>
          <p className="text-[11px] text-muted-foreground mt-1">A natív bővítmény felülete Filament alapú; ez a bemutató nem pixelpontos mása.</p>
        </Panel>
        <Panel title="Bemutató állapot">
          <p className="text-sm text-muted-foreground mb-4">Az adatok a böngésző localStorage-ében vannak. Exportálhatod, visszatöltheted vagy visszaállíthatod a három minta webhelyre.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportState} data-testid="button-export"><Download className="h-4 w-4 mr-1" />Exportálás JSON-be</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-import"><Upload className="h-4 w-4 mr-1" />Importálás</Button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
            <Confirm title="Bemutató visszaállítása?" desc="Minden helyi módosítás és a napló elvész, a három minta webhely visszatöltődik." label="Visszaállítás"
              onConfirm={() => { actions.reset(); toast({ title: "Bemutató visszaállítva" }); }}
              trigger={<Button variant="outline" className="text-destructive" data-testid="button-reset"><RotateCcw className="h-4 w-4 mr-1" />Visszaállítás</Button>} />
          </div>
          {err && <p className="text-xs text-destructive mt-3">{err}</p>}
        </Panel>
      </div>
    </>
  );
}
