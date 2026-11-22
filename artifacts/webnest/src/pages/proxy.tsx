import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, SiteLink, TypeBadge } from "@/components/bits";
import { actions, useStore, validProxyTarget, type Site } from "@/lib/store";

function ProxyRow({ s }: { s: Site }) {
  const [target, setTarget] = useState(s.proxyTarget);
  const [err, setErr] = useState("");
  const isProxy = s.type === "proxy";
  const save = () => {
    if (!validProxyTarget(target)) return setErr("Csak http://127.0.0.1:PORT, port 1024–65535.");
    setErr("");
    actions.updateSite(s.id, { proxyTarget: target.trim() }, `${s.name}: proxy cél ${target.trim()}`);
  };
  return (
    <Panel title={<span className="flex items-center gap-3"><SiteLink site={s} /><TypeBadge type={s.type} /></span>}>
      {!isProxy ? (
        <div className="flex items-center gap-3 flex-wrap text-sm"><span className="text-muted-foreground flex-1">Ez a webhely közvetlenül a konténer nginx-éből szolgál ki fájlokat.</span>
          <Button size="sm" variant="outline" onClick={() => actions.updateSite(s.id, { type: "proxy", proxyTarget: s.proxyTarget || "http://127.0.0.1:3000" }, `${s.name}: típus átállítva fordított proxyra`)} data-testid={`button-make-proxy-${s.id}`}>Átállítás proxyra</Button></div>
      ) : (
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <div className="flex gap-2"><Input value={target} onChange={(e) => setTarget(e.target.value)} className="font-mono" data-testid={`input-proxy-${s.id}`} /><Button onClick={save} disabled={target === s.proxyTarget} data-testid={`button-save-proxy-${s.id}`}>Mentés</Button></div>
            {err && <p className="text-xs text-destructive mt-1">{err}</p>}
            <div className="font-mono text-[11px] text-muted-foreground mt-2">{s.domain} → edge :443 → konténer nginx → {s.proxyTarget}</div>
          </div>
          <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold">WebSocket továbbítás<Switch checked={s.websocket} onCheckedChange={(v) => actions.updateSite(s.id, { websocket: v }, `${s.name}: WebSocket ${v ? "be" : "ki"}`)} data-testid={`switch-ws-${s.id}`} /></label>
        </div>
      )}
    </Panel>
  );
}

export default function Proxy() {
  const st = useStore();
  const sorted = [...st.sites].sort((a, b) => Number(b.type === "proxy") - Number(a.type === "proxy"));
  return (
    <>
      <PageHeader kicker="Proxy" title="Fordított proxy" desc="Node, Python vagy más alkalmazás továbbítása a konténeren belüli portra. A változások nem kerülnek alkalmazásra — csak a bemutatóban élnek." />
      <div className="mb-5 rounded-lg border bg-card px-4 py-3 text-sm" data-testid="text-proxy-limit"><b>Natív korlát:</b> a cél kizárólag <span className="font-mono">http://127.0.0.1:PORT</span> lehet, 1024–65535 közötti porttal. Nyilvános hoszt vagy HTTPS upstream nem engedélyezett.</div>
      {sorted.length === 0 ? <EmptyState icon={<ArrowRightLeft className="h-5 w-5" />} title="Nincs webhely">Hozz létre egy proxy típusú webhelyet.</EmptyState> :
        <div className="space-y-4">{sorted.map((s) => <ProxyRow key={s.id + s.proxyTarget} s={s} />)}</div>}
    </>
  );
}
