import { Lock } from "lucide-react";
import { Code, EmptyState, PageHeader, Panel, SiteLink } from "@/components/bits";
import { useStore, daysLeft, fmtDate } from "@/lib/store";

export default function Ssl() {
  const st = useStore();
  return (
    <>
      <PageHeader kicker="SSL" title="Tanúsítványok" desc="Az itt látható tanúsítványok mintaadatok. A WebNest bemutató nem kér és nem telepít tanúsítványt — éles környezetben az edge proxy végzi a Let's Encrypt igénylést." />
      <div className="mb-5 rounded-lg border border-[hsl(var(--chart-2)/.4)] bg-accent/60 px-4 py-3 text-sm text-accent-foreground" data-testid="text-ssl-sample-notice">
        <b>Mintaadat.</b> A lejárati dátumok kitaláltak, nem valós tanúsítványokból származnak.
      </div>
      {st.sites.length === 0 ? <EmptyState icon={<Lock className="h-5 w-5" />} title="Nincs webhely">Hozz létre webhelyet a tanúsítvány-áttekintéshez.</EmptyState> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {st.sites.map((s) => {
            const c = st.sampleCerts.find((x) => x.siteId === s.id);
            const left = c ? daysLeft(c.expiresAt) : 0;
            const tone = !c ? "border-dashed" : left < 21 ? "border-[hsl(var(--chart-2))]" : "";
            return (
              <div key={s.id} className={`rounded-xl border bg-card p-4 ${tone}`} data-testid={`card-cert-${s.id}`}>
                <div className="flex items-center gap-2"><Lock className={`h-4 w-4 ${c ? "text-primary" : "text-muted-foreground"}`} /><SiteLink site={s} /></div>
                <div className="font-mono text-xs text-muted-foreground mt-1">{s.domain}</div>
                {c ? <>
                  <div className="mt-3 text-3xl font-extrabold font-mono">{left}<span className="text-sm font-medium text-muted-foreground"> nap</span></div>
                  <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden"><div className={`h-full origin-left ${left < 21 ? "bg-[hsl(var(--chart-2))]" : "bg-primary"}`} style={{ transform: `scaleX(${Math.min(1, Math.max(0, left / 90))})` }} /></div>
                  <div className="text-[11px] text-muted-foreground mt-2">{c.issuer} · lejár {fmtDate(c.expiresAt)}</div>
                </> : <p className="text-xs text-muted-foreground mt-3">Nincs minta tanúsítvány. Élesben az edge proxy automatikusan kéri ki, ha a DNS már az edge-re mutat.</p>}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Valós beállítás lépései">
          <ol className="space-y-2 text-sm list-decimal pl-4 marker:text-primary marker:font-mono">
            <li>Állítsd a domain A/AAAA rekordját az edge proxy IP-jére.</li>
            <li>Igazold a tulajdonjogot: <span className="font-mono">TXT _webnest-challenge.&lt;hosztnév&gt;</span> rekord a bővítmény által adott tokennel.</li>
            <li>A runtime alkalmazza a konfigurációt, a bővítmény frissíti a nyugtázást.</li>
            <li>Ezután a Caddy edge publikálja a hosztot: figyeli a 80/443 portot, kéri a Let's Encrypt tanúsítványt és a HTTP→HTTPS átirányítást is ő végzi.</li>
            <li>A tanúsítvány valós állapotát a bővítmény az élő Caddy-tól kérdezi le. A konténer nginx-e csak HTTP-t kap az allocation porton.</li>
          </ol>
        </Panel>
        <Panel title="Példa edge konfiguráció (Caddy)">
          <Code>{`balaton-vitorlas.example, www.balaton-vitorlas.example {
  reverse_proxy 10.0.0.12:25565
}`}</Code>
        </Panel>
      </div>
    </>
  );
}
