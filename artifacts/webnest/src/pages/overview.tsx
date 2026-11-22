import { Fragment, useState } from "react";
import { Link } from "wouter";
import { Plus, Globe, Link2, ShieldCheck, Lock, ArrowRight, Server, Cloud, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, SiteLink, StatusDot, TypeBadge } from "@/components/bits";
import { SiteFormDialog } from "@/components/site-form-dialog";
import { useStore, securityScore, fmtDate, daysLeft } from "@/lib/store";

export default function Overview() {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const weak = st.sites.filter((s) => securityScore(s) < 3);
  const noCert = st.sites.filter((s) => !st.sampleCerts.some((c) => c.siteId === s.id));
  const stats = [
    { label: "Webhely", value: st.sites.length, sub: `${st.sites.filter((s) => s.enabled).length} engedélyezve`, icon: Globe, href: "/webhelyek" },
    { label: "További domain", value: st.domains.length, sub: "aldomainekkel együtt", icon: Link2, href: "/domainek" },
    { label: "Minta tanúsítvány", value: st.sampleCerts.length, sub: `${noCert.length} webhelynél nincs`, icon: Lock, href: "/ssl" },
    { label: "Figyelmet kér", value: weak.length, sub: "biztonsági pont < 3/4", icon: ShieldCheck, href: "/biztonsag" },
  ];

  return (
    <>
      <PageHeader kicker="Áttekintés" title="Jó reggelt, mi a helyzet a fészekben?"
        desc="Minden webhely, domain és biztonsági beállítás egy helyen — nginx-fájlok kézi szerkesztése nélkül. Az alábbi állapotok mintaadatok, nem élő mérések."
        actions={<Button onClick={() => setOpen(true)} data-testid="button-new-site"><Plus className="h-4 w-4 mr-1" />Új webhely</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s, i) => (
          <Link key={s.label} href={s.href} style={{ animationDelay: `${i * 60}ms` }} data-testid={`card-stat-${i}`}
            className="rise group rounded-xl border bg-card p-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium">{s.label}</span><s.icon className="h-4 w-4 group-hover:text-primary transition-colors" /></div>
            <div className="text-4xl font-extrabold tracking-tight mt-2 font-mono">{s.value}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{s.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5">
        <Panel title="Webhelyek" right={<Link href="/webhelyek" className="text-xs text-primary inline-flex items-center gap-1">Mind <ArrowRight className="h-3 w-3" /></Link>} className="overflow-hidden">
          {st.sites.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs webhely. Kezdd egy újjal fent.</p> : (
            <ul className="divide-y -my-3">
              {st.sites.map((s) => {
                const score = securityScore(s);
                return (
                  <li key={s.id} className="py-3 flex items-center gap-3" data-testid={`row-overview-site-${s.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><SiteLink site={s} /><TypeBadge type={s.type} /></div>
                      <div className="font-mono text-xs text-muted-foreground truncate">{s.domain} · {st.domains.filter((d) => d.siteId === s.id).length} alias</div>
                    </div>
                    <div className="hidden sm:flex gap-0.5" title={`Biztonság ${score}/4`}>{[0, 1, 2, 3].map((n) => <span key={n} className={`h-4 w-1.5 rounded-sm ${n < score ? "bg-primary" : "bg-muted"}`} />)}</div>
                    <StatusDot on={s.enabled} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Teendők">
            <ul className="space-y-2 text-sm">
              {weak.map((s) => <li key={s.id} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" /><span><b>{s.name}</b>: hiányos biztonsági beállítás. <Link href="/biztonsag" className="text-primary underline underline-offset-2">Javítás</Link></span></li>)}
              {st.sampleCerts.filter((c) => daysLeft(c.expiresAt) < 21).map((c) => <li key={c.siteId} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--chart-2))] shrink-0" /><span>Minta tanúsítvány {daysLeft(c.expiresAt)} napon belül lejár ({st.sites.find((s) => s.id === c.siteId)?.domain}).</span></li>)}
              {weak.length === 0 && st.sampleCerts.every((c) => daysLeft(c.expiresAt) >= 21) && <li className="text-muted-foreground">Nincs nyitott teendő.</li>}
            </ul>
          </Panel>
          <Panel title="Legutóbbi helyi változások" right={<Link href="/naplo" className="text-xs text-primary">Napló</Link>}>
            <ul className="space-y-2.5">
              {st.activity.slice(0, 5).map((a) => <li key={a.id} className="text-xs"><div>{a.message}</div><div className="font-mono text-muted-foreground text-[10px]">{fmtDate(a.at)}</div></li>)}
              {st.activity.length === 0 && <li className="text-xs text-muted-foreground">A napló üres.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Hogyan jut el a kérés a webhelyig?" className="mt-5">
        <div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-sm">
          {[
            { icon: Cloud, t: "Látogató + DNS", d: "A domain A/AAAA rekordja az edge proxy IP-jére mutat." },
            { icon: Server, t: "Caddy edge", d: "80/443, Let's Encrypt és HTTPS átirányítás, TXT igazolás után." },
            { icon: Box, t: "Pelican konténer", d: "nginx + PHP-FPM 8.4 a kiosztott (allocation) porton." },
          ].map((x, i, arr) => (
            <Fragment key={x.t}>
              <div className="rounded-lg border bg-background p-4 nest-grid">
                <x.icon className="h-5 w-5 text-primary mb-2" /><div className="font-bold">{x.t}</div><div className="text-xs text-muted-foreground mt-1">{x.d}</div>
              </div>
              {i < arr.length - 1 && <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground mx-auto" />}
            </Fragment>
          ))}
        </div>
      </Panel>
      <SiteFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
