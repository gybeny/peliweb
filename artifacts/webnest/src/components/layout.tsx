import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, Globe, Link2, ShieldCheck, Lock, ArrowRightLeft, ScrollText, Settings, FlaskConical, Menu, X } from "lucide-react";
import { useStore, RELEASE } from "@/lib/store";

const NAV = [
  { href: "/", label: "Áttekintés", icon: LayoutGrid },
  { href: "/webhelyek", label: "Webhelyek", icon: Globe, count: "sites" as const },
  { href: "/domainek", label: "Domainek", icon: Link2, count: "domains" as const },
  { href: "/ssl", label: "SSL tanúsítványok", icon: Lock },
  { href: "/biztonsag", label: "Biztonság", icon: ShieldCheck },
  { href: "/proxy", label: "Fordított proxy", icon: ArrowRightLeft },
  { href: "/naplo", label: "Változásnapló", icon: ScrollText, count: "activity" as const },
  { href: "/beallitasok", label: "Beállítások", icon: Settings },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <rect width="32" height="32" rx="8" fill="hsl(var(--sidebar-primary))" />
      <path d="M6 18c3 5 17 5 20 0M8 14c3 4 13 4 16 0M10 10.5c2.5 3 9.5 3 12 0" stroke="hsl(var(--sidebar))" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const st = useStore();
  const [open, setOpen] = useState(false);
  const counts = { sites: st.sites.length, domains: st.domains.length, activity: st.activity.length };
  const active = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={() => setOpen(false)} data-testid={`link-nav-${n.href.slice(1) || "home"}`}
          className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active(n.href) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}>
          <n.icon className={`h-4 w-4 transition-transform group-hover:scale-110 ${active(n.href) ? "text-sidebar-primary" : ""}`} />
          <span className="flex-1">{n.label}</span>
          {n.count && <span className="font-mono text-[11px] opacity-60">{counts[n.count]}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-[100dvh] flex bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col p-4 transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-2 pb-6 pt-1">
          <Logo />
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight text-lg">WebNest</div>
            <div className="text-[11px] font-mono text-sidebar-foreground/50">Pelican 1.0.0-rc.4 bővítmény</div>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)} data-testid="button-close-nav"><X className="h-5 w-5" /></button>
        </div>
        {nav}
        <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
          <div className="flex items-center gap-2 font-semibold text-sidebar-primary mb-1"><FlaskConical className="h-3.5 w-3.5" />Bemutató mód</div>
          Minden változás csak ebben a böngészőben, a localStorage-ben él. Szerver, DNS és tanúsítvány nem módosul.
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-foreground/30 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 md:pl-64 min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/85 backdrop-blur px-4 md:px-8 h-12">
          <button className="md:hidden" onClick={() => setOpen(true)} data-testid="button-open-nav"><Menu className="h-5 w-5" /></button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/30 bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground" data-testid="status-demo-mode">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--chart-2))] animate-pulse" />Bemutató mód
          </span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary whitespace-nowrap" data-testid="status-release">{RELEASE}</span>
          <span className="hidden lg:inline text-xs text-muted-foreground truncate">Helyi interaktív előnézet — nem kapcsolódik élő infrastruktúrához</span>
        </header>
        <main key={loc} className="rise px-4 md:px-8 py-6 md:py-8 max-w-[1280px]">{children}</main>
      </div>
    </div>
  );
}
