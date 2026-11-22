import { type ReactNode } from "react";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { type Site, TYPE_LABEL } from "@/lib/store";

export function PageHeader({ kicker, title, desc, actions }: { kicker: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end gap-4 mb-7">
      <div className="flex-1">
        <div className="font-mono text-[11px] uppercase tracking-[.18em] text-primary mb-1.5">{kicker}</div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{desc}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="nest-grid rounded-xl border border-dashed p-10 text-center flex flex-col items-center gap-3" data-testid="empty-state">
      <div className="h-12 w-12 rounded-full bg-card border flex items-center justify-center text-primary">{icon}</div>
      <div className="font-bold text-lg">{title}</div>
      {children && <p className="text-sm text-muted-foreground max-w-md">{children}</p>}
      {action}
    </div>
  );
}

const TYPE_TONE = { php: "bg-primary/10 text-primary", static: "bg-[hsl(var(--chart-3)/.12)] text-[hsl(var(--chart-3))]", proxy: "bg-accent text-accent-foreground" };
export function TypeBadge({ type }: { type: Site["type"] }) {
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_TONE[type]}`}>{TYPE_LABEL[type]}</span>;
}
export function StatusDot({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-[hsl(var(--chart-3))]" : "bg-muted-foreground/40"}`} />
      {on ? "Engedélyezve" : "Kikapcsolva"}
      <span className="font-mono text-[10px] text-muted-foreground">(minta)</span>
    </span>
  );
}
export function SiteLink({ site }: { site: Site }) {
  return <Link href={`/webhelyek/${site.id}`} className="font-semibold hover:text-primary hover:underline underline-offset-4">{site.name}</Link>;
}

export function Confirm({ trigger, title, desc, onConfirm, label = "Törlés" }: { trigger: ReactNode; title: string; desc: ReactNode; onConfirm: () => void; label?: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-confirm">Mégse</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm">{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <pre className="rounded-lg bg-sidebar text-sidebar-foreground font-mono text-xs p-4 overflow-x-auto leading-relaxed">{children}</pre>;
}

export function Panel({ title, children, className = "", right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border bg-card ${className}`}>
      {title && <div className="flex items-center gap-2 px-5 py-3 border-b"><h2 className="font-bold text-sm flex-1">{title}</h2>{right}</div>}
      <div className="p-5">{children}</div>
    </section>
  );
}
