import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Confirm, EmptyState, PageHeader, Panel, SiteLink } from "@/components/bits";
import { DomainFormDialog } from "@/components/domain-form-dialog";
import { actions, useStore, type Domain } from "@/lib/store";

export default function Domains() {
  const st = useStore();
  const [q, setQ] = useState("");
  const [siteF, setSiteF] = useState("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Domain | undefined>();
  const rows = useMemo(() => [
    ...st.sites.map((s) => ({ id: "p-" + s.id, hostname: s.domain, siteId: s.id, primary: true })),
    ...st.domains.map((d) => ({ ...d, primary: false })),
  ].filter((r) => (siteF === "all" || r.siteId === siteF) && r.hostname.includes(q.toLowerCase())), [st, q, siteF]);

  return (
    <>
      <PageHeader kicker="Domainek" title="Domainek és aldomainek" desc="Rendelj további hosztneveket a webhelyekhez. A DNS-t a domainszolgáltatódnál kell beállítanod — a WebNest nem módosít DNS-t."
        actions={<Button onClick={() => { setEdit(undefined); setOpen(true); }} disabled={!st.sites.length} data-testid="button-new-domain"><Plus className="h-4 w-4 mr-1" />Domain hozzáadása</Button>} />
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5">
        <div>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hosztnév keresése" className="pl-9" data-testid="input-search-domains" /></div>
            <select value={siteF} onChange={(e) => setSiteF(e.target.value)} className="rounded-md border bg-card px-2 text-sm" data-testid="select-filter-site">
              <option value="all">Minden webhely</option>{st.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {rows.length === 0 ? <EmptyState icon={<Link2 className="h-5 w-5" />} title={st.sites.length ? "Nincs találat" : "Nincs még webhely"}>{st.sites.length ? "Módosítsd a keresést vagy a szűrőt." : "Domaint csak webhelyhez lehet rendelni."}</EmptyState> : (
            <div className="rounded-xl border bg-card divide-y">
              {rows.map((r) => {
                const site = st.sites.find((s) => s.id === r.siteId);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`row-domain-${r.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm truncate">{r.hostname}</div>
                      <div className="text-xs text-muted-foreground">{site && <SiteLink site={site} />} · {r.primary ? "elsődleges" : r.hostname.split(".").length > 2 ? "aldomain / alias" : "alias"}</div>
                    </div>
                    {!r.primary && <>
                      <Button size="icon" variant="ghost" onClick={() => { setEdit(st.domains.find((d) => d.id === r.id)); setOpen(true); }} data-testid={`button-edit-domain-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Confirm title="Domain törlése?" desc={<>A(z) <b>{r.hostname}</b> leválik a webhelyről (csak a bemutatóban).</>} onConfirm={() => actions.deleteDomain(r.id)}
                        trigger={<Button size="icon" variant="ghost" className="text-destructive" data-testid={`button-delete-domain-${r.id}`}><Trash2 className="h-4 w-4" /></Button>} />
                    </>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Panel title="Külső DNS beállítása">
          <ol className="space-y-3 text-sm list-decimal pl-4 marker:font-mono marker:text-primary">
            <li>Lépj be a domainszolgáltatód (pl. Rackhost, Tárhely.eu, Cloudflare) DNS-kezelőjébe.</li>
            <li>Hozz létre <b>A</b> rekordot (és ha van, <b>AAAA</b>-t) az edge proxy nyilvános IP-címére.</li>
            <li>Aldomainhez használhatsz <b>CNAME</b> rekordot az elsődleges domainre.</li>
            <li>Tulajdonjog-igazolás (kötelező): <b>TXT</b> rekord a <span className="font-mono">_webnest-challenge.&lt;hosztnév&gt;</span> néven, a natív bővítmény által adott tokennel. Enélkül a Caddy nem publikálja a hosztot.</li>
            <li>Propagáció után: runtime alkalmazás → nyugtázás frissítése → Caddy publikálás → élő tanúsítvány ellenőrzése.</li>
          </ol>
          <div className="mt-4 rounded-lg bg-sidebar text-sidebar-foreground font-mono text-[11px] p-3 space-y-1">
            <div>@      A      203.0.113.10</div>
            <div>www    CNAME  pelda.example.</div>
            <div>_webnest-challenge  TXT  "&lt;token a bővítményből&gt;"</div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">A 203.0.113.10 dokumentációs példacím — cseréld a saját edge IP-dre.</p>
        </Panel>
      </div>
      <DomainFormDialog open={open} onOpenChange={setOpen} domain={edit} />
    </>
  );
}
