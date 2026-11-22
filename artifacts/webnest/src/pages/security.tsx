import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, SiteLink } from "@/components/bits";
import { HeadersEditor } from "@/components/headers-editor";
import { actions, useStore, securityScore, RATE_MIN, RATE_MAX } from "@/lib/store";

export default function Security() {
  const st = useStore();
  return (
    <>
      <PageHeader kicker="Biztonság" title="Biztonsági beállítások" desc="Webhelyenkénti védelem: HTTPS átirányítás (a Caddy edge-en), rejtett fájlok tiltása, kérés-korlát és fejlécek. Minden kapcsoló csak a bemutató állapotot módosítja." />
      {st.sites.length === 0 ? <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Nincs webhely">Webhely nélkül nincs mit védeni.</EmptyState> : (
        <div className="space-y-4">
          {st.sites.map((s) => {
            const score = securityScore(s);
            return (
              <Panel key={s.id} title={<span className="flex items-center gap-3"><SiteLink site={s} /><span className="font-mono text-xs text-muted-foreground">{s.domain}</span></span>}
                right={<span className={`font-mono text-xs rounded px-2 py-0.5 ${score >= 3 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`} data-testid={`text-score-${s.id}`}>{score}/4</span>}>
                <div className="grid lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    {([["forceHttps", "HTTPS átirányítás", "A Caddy edge irányítja át a HTTP kéréseket, nem a konténer nginx-e"], ["blockDotfiles", "Rejtett fájlok tiltása", ".env, .git és hasonlók elérése tiltva"]] as const).map(([k, l, d]) => (
                      <label key={k} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                        <div className="flex-1"><div className="text-sm font-semibold">{l}</div><div className="text-[11px] text-muted-foreground">{d}</div></div>
                        <Switch checked={s[k]} onCheckedChange={(v) => actions.updateSite(s.id, { [k]: v }, `${s.name}: ${l} ${v ? "bekapcsolva" : "kikapcsolva"}`)} data-testid={`switch-${k}-${s.id}`} />
                      </label>
                    ))}
                    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      <div className="flex-1"><div className="text-sm font-semibold">Kérés-korlát</div><div className="text-[11px] text-muted-foreground">kérés/másodperc IP-nként, {RATE_MIN}–{RATE_MAX}</div></div>
                      <Input type="number" min={RATE_MIN} max={RATE_MAX} defaultValue={s.rateLimit} key={s.rateLimit} className="w-20 h-8 font-mono" data-testid={`input-rate-${s.id}`}
                        onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n) && n >= RATE_MIN && n <= RATE_MAX && n !== s.rateLimit) actions.updateSite(s.id, { rateLimit: n }, `${s.name}: kérés-korlát ${n} r/s`); else e.target.value = String(s.rateLimit); }} />
                    </div>
                  </div>
                  <div><div className="text-xs font-semibold mb-2">HTTP fejlécek</div><HeadersEditor site={s} /></div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
