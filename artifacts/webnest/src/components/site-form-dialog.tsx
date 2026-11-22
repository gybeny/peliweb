import { type ReactNode, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { actions, hostTaken, HOST_RE, PHP_VERSION, ROOT_RE, RATE_MIN, RATE_MAX, validProxyTarget, type Site, type SiteType, TYPE_LABEL } from "@/lib/store";

type Draft = Omit<Site, "id">;
const blank: Draft = { name: "", domain: "", type: "php", root: "/home/container/sites/uj-webhely/public", enabled: true, phpVersion: PHP_VERSION, forceHttps: true, headers: [], rateLimit: 30, blockDotfiles: true, proxyTarget: "", websocket: false };

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function validateSite(d: Draft, ignoreId?: string) {
  const e: Record<string, string> = {};
  if (d.name.trim().length < 2) e.name = "Adj meg legalább 2 karakteres nevet.";
  if (!HOST_RE.test(d.domain.trim())) e.domain = "Érvénytelen domain (pl. pelda.example).";
  else if (hostTaken(d.domain.trim(), undefined, ignoreId)) e.domain = "Ez a domain már használatban van.";
  if (!ROOT_RE.test(d.root.trim())) e.root = "Formátum: /home/container/sites/<szegmens>/... (csak a-z, 0-9, _ és -).";
  if (d.type === "proxy" && !validProxyTarget(d.proxyTarget)) e.proxyTarget = "Csak http://127.0.0.1:PORT, ahol a port 1024–65535.";
  if (!Number.isInteger(d.rateLimit) || d.rateLimit < RATE_MIN || d.rateLimit > RATE_MAX) e.rateLimit = `${RATE_MIN} és ${RATE_MAX} közötti egész szám.`;
  return e;
}

export function SiteFormDialog({ open, onOpenChange, site, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; site?: Site; onSaved?: (s: Site) => void }) {
  const [d, setD] = useState<Draft>(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  const { toast } = useToast();
  useEffect(() => {
    if (open) { setD(site ? { ...site } : blank); setErr({}); }
  }, [open, site]);
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const clean = { ...d, phpVersion: PHP_VERSION, root: d.root.trim(), name: d.name.trim(), domain: d.domain.trim().toLowerCase(), proxyTarget: d.proxyTarget.trim() };
    const e = validateSite(clean, site?.id);
    setErr(e);
    if (Object.keys(e).length) return;
    if (site) { actions.updateSite(site.id, clean); onSaved?.({ ...clean, id: site.id }); toast({ title: "Mentve a bemutatóban", description: "Szerverkonfiguráció nem változott." }); }
    else { const s = actions.createSite(clean); onSaved?.(s); toast({ title: "Webhely létrehozva (helyben)", description: s.domain }); }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{site ? "Webhely szerkesztése" : "Új webhely"}</DialogTitle>
          <DialogDescription>Bemutató mód: csak a böngésző helyi tárhelyén módosul.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Név" error={err.name}><Input value={d.name} onChange={(e) => up("name", e.target.value)} placeholder="Pl. Szegedi Pékség" data-testid="input-site-name" /></Field>
          <Field label="Elsődleges domain" error={err.domain} hint="Használj fenntartott példadomaint teszteléshez (.example)"><Input value={d.domain} onChange={(e) => up("domain", e.target.value)} placeholder="pekseg.example" className="font-mono" data-testid="input-site-domain" /></Field>
          <Field label="Típus">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(Object.keys(TYPE_LABEL) as SiteType[]).map((t) => (
                <button key={t} type="button" onClick={() => up("type", t)} data-testid={`button-type-${t}`}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-all ${d.type === t ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
          </Field>
          {d.type === "proxy" ? (
            <Field label="Proxy cél" error={err.proxyTarget} hint="Csak helyi, titkosítatlan upstream: http://127.0.0.1:1024–65535. Nyilvános vagy HTTPS cél nem engedélyezett."><Input value={d.proxyTarget} onChange={(e) => up("proxyTarget", e.target.value)} placeholder="http://127.0.0.1:3000" className="font-mono" data-testid="input-proxy-target" /></Field>
          ) : null}
          <Field label="Webhely könyvtár" error={err.root} hint="A natív bővítmény relatív sites/... útvonalként tárolja."><Input value={d.root} onChange={(e) => up("root", e.target.value)} className="font-mono" data-testid="input-site-root" /></Field>
          {d.type === "php" && (
            <Field label="PHP verzió">
              <div className="rounded-md border bg-muted/50 px-3 py-1.5 font-mono text-xs" data-testid="text-php-version">PHP {PHP_VERSION} <span className="text-muted-foreground">· a runtime csak ezt támogatja</span></div>
            </Field>
          )}
          <Field label={`Kérés-korlát (kérés/mp, ${RATE_MIN}–${RATE_MAX})`} error={err.rateLimit}><Input type="number" value={d.rateLimit} onChange={(e) => up("rateLimit", Number(e.target.value))} data-testid="input-rate-limit" /></Field>
          <div className="grid grid-cols-2 gap-3">
            {([["enabled", "Engedélyezve"], ["forceHttps", "HTTPS (Caddy edge)"], ["blockDotfiles", "Rejtett fájlok tiltása"], ["websocket", "WebSocket"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium">{l}<Switch checked={d[k]} onCheckedChange={(v) => up(k, v)} data-testid={`switch-${k}`} /></label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-site">Mégse</Button>
          <Button onClick={submit} data-testid="button-save-site">{site ? "Mentés" : "Létrehozás"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
