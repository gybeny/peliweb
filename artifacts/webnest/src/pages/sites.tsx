import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Search, Pencil, Trash2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Confirm, EmptyState, PageHeader, SiteLink, StatusDot, TypeBadge } from "@/components/bits";
import { SiteFormDialog } from "@/components/site-form-dialog";
import { actions, useStore, type Site, type SiteType, TYPE_LABEL } from "@/lib/store";

export default function Sites() {
  const st = useStore();
  const [, nav] = useLocation();
  const [q, setQ] = useState("");
  const [type, setType] = useState<SiteType | "all">("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Site | undefined>();
  const list = useMemo(() => st.sites.filter((s) => (type === "all" || s.type === type) && (s.name + s.domain).toLowerCase().includes(q.toLowerCase())), [st.sites, q, type]);

  return (
    <>
      <PageHeader kicker="Webhelyek" title="Webhelyek" desc="Hozz létre, szerkessz vagy törölj webhelyeket. A mentés csak ebben a bemutatóban történik."
        actions={<Button onClick={() => { setEdit(undefined); setOpen(true); }} data-testid="button-new-site"><Plus className="h-4 w-4 mr-1" />Új webhely</Button>} />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keresés név vagy domain alapján" className="pl-9" data-testid="input-search-sites" /></div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["all", ...Object.keys(TYPE_LABEL)] as (SiteType | "all")[]).map((t) => (
            <button key={t} onClick={() => setType(t)} data-testid={`filter-type-${t}`} className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${type === t ? "bg-card shadow-sm text-primary" : "text-muted-foreground"}`}>{t === "all" ? "Mind" : TYPE_LABEL[t]}</button>
          ))}
        </div>
      </div>
      {st.sites.length === 0 ? (
        <EmptyState icon={<Globe className="h-5 w-5" />} title="Még nincs webhely" action={<Button onClick={() => setOpen(true)}>Első webhely létrehozása</Button>}>A webhely egy domaint köt egy dokumentumgyökérhez vagy proxy célhoz.</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Search className="h-5 w-5" />} title="Nincs találat" action={<Button variant="outline" onClick={() => { setQ(""); setType("all"); }}>Szűrők törlése</Button>}>Próbálj másik kifejezést vagy típust.</EmptyState>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-4 px-5 py-2.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
            <span>Név</span><span>Domain</span><span>Típus</span><span>Állapot</span><span className="w-20" />
          </div>
          {list.map((s) => (
            <div key={s.id} className="grid md:grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-2 md:gap-4 items-center px-5 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-site-${s.id}`}>
              <div><SiteLink site={s} /><div className="text-[11px] text-muted-foreground font-mono">{s.type === "proxy" ? s.proxyTarget : s.root}</div></div>
              <span className="font-mono text-xs truncate">{s.domain}</span>
              <span><TypeBadge type={s.type} /></span>
              <StatusDot on={s.enabled} />
              <div className="flex gap-1 w-20 justify-end">
                <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }} data-testid={`button-edit-site-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                <Confirm title="Webhely törlése?" desc={<>A(z) <b>{s.name}</b> és {st.domains.filter((d) => d.siteId === s.id).length} kapcsolódó domain törlődik a bemutatóból.</>} onConfirm={() => actions.deleteSite(s.id)}
                  trigger={<Button size="icon" variant="ghost" className="text-destructive" data-testid={`button-delete-site-${s.id}`}><Trash2 className="h-4 w-4" /></Button>} />
              </div>
            </div>
          ))}
        </div>
      )}
      <SiteFormDialog open={open} onOpenChange={setOpen} site={edit} onSaved={(s) => { if (!edit) nav(`/webhelyek/${s.id}`); }} />
    </>
  );
}
