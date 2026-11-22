import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Trash2, Plus, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Code, Confirm, EmptyState, PageHeader, Panel, StatusDot, TypeBadge } from "@/components/bits";
import { SiteFormDialog } from "@/components/site-form-dialog";
import { DomainFormDialog } from "@/components/domain-form-dialog";
import { HeadersEditor } from "@/components/headers-editor";
import { actions, useStore, securityScore, type Site } from "@/lib/store";

export function nginxPreview(s: Site, aliases: string[]) {
  const lines = [
    `# WebNest előnézet — NEM alkalmazott konfiguráció`,
    `server {`,
    `  listen {{SERVER_PORT}};`,
    s.forceHttps ? `  # HTTPS átirányítás: a Caddy edge végzi, nem ez az nginx` : `  # HTTPS átirányítás kikapcsolva (Caddy edge)`,
    `  server_name ${[s.domain, ...aliases].join(" ")};`,
  ];
  if (s.type === "proxy") {
    lines.push(`  location / {`, `    proxy_pass ${s.proxyTarget};`, `    proxy_set_header Host $host;`);
    if (s.websocket) lines.push(`    proxy_set_header Upgrade $http_upgrade;`, `    proxy_set_header Connection "upgrade";`);
    lines.push(`  }`);
  } else {
    lines.push(`  root ${s.root};`, `  index ${s.type === "php" ? "index.php " : ""}index.html;`);
    if (s.type === "php") lines.push(`  location ~ \\.php$ { fastcgi_pass unix:/run/php/php${s.phpVersion}-fpm.sock; }`);
  }
  if (s.blockDotfiles) lines.push(`  location ~ /\\.(?!well-known) { deny all; }`);
  lines.push(`  limit_req zone=wn_${s.id.replace(/\W/g, "")} burst=${s.rateLimit * 2};  # ${s.rateLimit} r/s`);
  s.headers.forEach((h) => lines.push(`  add_header ${h.name} "${h.value}" always;`));
  if (!s.enabled) lines.unshift("# A webhely ki van kapcsolva — a natív bővítmény nem töltené be.");
  lines.push(`}`);
  return lines.join("\n");
}

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const st = useStore();
  const [, nav] = useLocation();
  const [edit, setEdit] = useState(false);
  const [dom, setDom] = useState(false);
  const site = st.sites.find((s) => s.id === id);
  if (!site) return <EmptyState icon={<Globe className="h-5 w-5" />} title="A webhely nem található" action={<Link href="/webhelyek" className="text-primary underline">Vissza a webhelyekhez</Link>}>Lehet, hogy törölted, vagy visszaállítottad a bemutatót.</EmptyState>;
  const aliases = st.domains.filter((d) => d.siteId === site.id);
  const cert = st.sampleCerts.find((c) => c.siteId === site.id);

  return (
    <>
      <Link href="/webhelyek" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-3" data-testid="link-back"><ArrowLeft className="h-3 w-3" />Webhelyek</Link>
      <PageHeader kicker={site.domain} title={site.name} desc={<span className="flex gap-3 items-center flex-wrap"><TypeBadge type={site.type} /><StatusDot on={site.enabled} /><span className="font-mono text-xs">Biztonság {securityScore(site)}/4</span></span>}
        actions={<>
          <label className="flex items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium">Engedélyezve<Switch checked={site.enabled} onCheckedChange={(v) => actions.updateSite(site.id, { enabled: v }, `${site.name}: ${v ? "engedélyezve" : "kikapcsolva"}`)} data-testid="switch-site-enabled" /></label>
          <Button variant="outline" onClick={() => setEdit(true)} data-testid="button-edit-site"><Pencil className="h-4 w-4 mr-1" />Szerkesztés</Button>
          <Confirm title="Webhely törlése?" desc={`${site.name} és ${aliases.length} domain törlődik a bemutatóból.`} onConfirm={() => { actions.deleteSite(site.id); nav("/webhelyek"); }}
            trigger={<Button variant="outline" className="text-destructive" data-testid="button-delete-site"><Trash2 className="h-4 w-4" /></Button>} />
        </>} />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <Panel title="Beállítások">
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              {[["Típus", site.type], [site.type === "proxy" ? "Proxy cél" : "Gyökér", site.type === "proxy" ? site.proxyTarget : site.root], ["PHP", site.type === "php" ? "8.4" : "—"], ["Natív útvonal", site.root.replace(/^\/home\/container\//, "")], ["HTTPS (Caddy edge)", site.forceHttps ? "átirányít" : "ki"], ["Kérés-korlát", `${site.rateLimit} r/s`], ["Rejtett fájlok", site.blockDotfiles ? "tiltva" : "elérhető"], ["WebSocket", site.websocket ? "be" : "ki"], ["Tanúsítvány", cert ? "minta adat" : "nincs minta"]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="font-mono text-xs break-all">{v}</dd></div>
              ))}
            </dl>
          </Panel>
          <Panel title={`Domainek (${aliases.length + 1})`} right={<Button size="sm" variant="ghost" onClick={() => setDom(true)} data-testid="button-add-alias"><Plus className="h-3.5 w-3.5 mr-1" />Alias</Button>}>
            <ul className="space-y-1.5 font-mono text-xs">
              <li className="flex justify-between"><span>{site.domain}</span><span className="text-muted-foreground">elsődleges</span></li>
              {aliases.map((d) => <li key={d.id} className="flex justify-between items-center"><span>{d.hostname}</span>
                <Confirm title="Domain törlése?" desc={d.hostname} onConfirm={() => actions.deleteDomain(d.id)} trigger={<button className="text-destructive hover:underline" data-testid={`button-delete-alias-${d.id}`}>törlés</button>} /></li>)}
            </ul>
          </Panel>
          <Panel title="HTTP fejlécek"><HeadersEditor site={site} /></Panel>
        </div>
        <Panel title="Generált nginx előnézet" right={<span className="font-mono text-[10px] text-muted-foreground">csak olvasható</span>}>
          <Code>{nginxPreview(site, aliases.map((a) => a.hostname))}</Code>
          <p className="text-[11px] text-muted-foreground mt-3">A natív bővítmény a Pelican konténerben hasonló konfigurációt írna. Ez a bemutató semmit nem telepít.</p>
        </Panel>
      </div>
      <SiteFormDialog open={edit} onOpenChange={setEdit} site={site} />
      <DomainFormDialog open={dom} onOpenChange={setDom} defaultSiteId={site.id} />
    </>
  );
}
