import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/site-form-dialog";
import { actions, hostTaken, HOST_RE, useStore, type Domain } from "@/lib/store";

export function DomainFormDialog({ open, onOpenChange, domain, defaultSiteId }: { open: boolean; onOpenChange: (o: boolean) => void; domain?: Domain; defaultSiteId?: string }) {
  const { sites } = useStore();
  const { toast } = useToast();
  const [host, setHost] = useState("");
  const [siteId, setSiteId] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setHost(domain?.hostname ?? ""); setSiteId(domain?.siteId ?? defaultSiteId ?? sites[0]?.id ?? ""); setErr({}); }
  }, [open, domain, defaultSiteId, sites]);

  const submit = () => {
    const h = host.trim().toLowerCase();
    const e: Record<string, string> = {};
    if (!HOST_RE.test(h)) e.host = "Érvénytelen hosztnév (pl. www.pelda.example).";
    else if (hostTaken(h, domain?.id)) e.host = "Ez a hosztnév már hozzá van rendelve.";
    if (!sites.some((s) => s.id === siteId)) e.site = "Válassz webhelyet.";
    setErr(e);
    if (Object.keys(e).length) return;
    if (domain) actions.updateDomain(domain.id, siteId, h); else actions.createDomain(siteId, h);
    toast({ title: domain ? "Domain mentve (helyben)" : "Domain hozzáadva (helyben)", description: "A DNS-t a szolgáltatódnál kell beállítanod." });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{domain ? "Domain szerkesztése" : "Domain vagy aldomain hozzáadása"}</DialogTitle>
          <DialogDescription>A rekord csak a bemutatóban jön létre, DNS nem változik.</DialogDescription>
        </DialogHeader>
        {sites.length === 0 ? <p className="text-sm text-muted-foreground">Előbb hozz létre egy webhelyet.</p> : (
          <div className="grid gap-4">
            <Field label="Hosztnév" error={err.host}><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="shop.pelda.example" className="font-mono" data-testid="input-domain-host" /></Field>
            <Field label="Webhely" error={err.site}>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger data-testid="select-domain-site"><SelectValue placeholder="Webhely" /></SelectTrigger>
                <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button onClick={submit} disabled={sites.length === 0} data-testid="button-save-domain">Mentés</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
