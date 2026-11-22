import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, HEADER_NAMES, type Site } from "@/lib/store";

const PRESETS = [
  { name: "X-Frame-Options", value: "SAMEORIGIN" },
  { name: "X-Content-Type-Options", value: "nosniff" },
  { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { name: "Permissions-Policy", value: "camera=(), microphone=()" },
];

export function HeadersEditor({ site }: { site: Site }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const add = (n: string, v: string) => {
    if (!HEADER_NAMES.includes(n)) return setErr("Válassz az engedélyezett fejlécek közül.");
    if (!v.trim() || /["\n]/.test(v)) return setErr("Adj meg értéket idézőjel nélkül.");
    if (site.headers.some((h) => h.name.toLowerCase() === n.toLowerCase())) return setErr("Ez a fejléc már szerepel.");
    setErr("");
    actions.updateSite(site.id, { headers: [...site.headers, { name: n, value: v.trim() }] }, `${site.name}: fejléc hozzáadva (${n})`);
    setName(""); setValue("");
  };
  const remove = (n: string) => actions.updateSite(site.id, { headers: site.headers.filter((h) => h.name !== n) }, `${site.name}: fejléc eltávolítva (${n})`);
  return (
    <div className="space-y-3">
      {site.headers.length === 0 ? <p className="text-xs text-muted-foreground">Nincs egyedi fejléc.</p> : (
        <ul className="space-y-1">{site.headers.map((h) => (
          <li key={h.name} className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
            <span className="font-semibold">{h.name}</span><span className="text-muted-foreground truncate flex-1">{h.value}</span>
            <button onClick={() => remove(h.name)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-header-${h.name}`}><X className="h-3.5 w-3.5" /></button>
          </li>))}</ul>
      )}
      <div className="flex gap-2">
        <select value={name} onChange={(e) => setName(e.target.value)} className="h-8 rounded-md border bg-card px-2 font-mono text-xs min-w-0 flex-1" data-testid="select-header-name">
          <option value="">Fejléc…</option>
          {HEADER_NAMES.filter((h) => !site.headers.some((x) => x.name === h)).map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Érték" className="font-mono text-xs h-8" data-testid="input-header-value" />
        <Button size="sm" onClick={() => add(name.trim(), value)} data-testid="button-add-header"><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <p className="text-[10px] text-muted-foreground">A natív bővítmény csak ezt a 6 fejlécet engedi.</p>
      <div className="flex flex-wrap gap-1">
        {PRESETS.filter((p) => !site.headers.some((h) => h.name === p.name)).map((p) => (
          <button key={p.name} onClick={() => add(p.name, p.value)} className="rounded-full border px-2 py-0.5 text-[10px] font-mono hover:border-primary hover:text-primary transition-colors">+ {p.name}</button>
        ))}
      </div>
    </div>
  );
}
