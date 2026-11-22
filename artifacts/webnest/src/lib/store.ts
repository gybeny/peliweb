import { useSyncExternalStore } from "react";

export type SiteType = "php" | "static" | "proxy";
export interface Header { name: string; value: string }
export interface Site {
  id: string;
  name: string;
  domain: string;
  type: SiteType;
  root: string;
  enabled: boolean;
  phpVersion: string;
  forceHttps: boolean;
  headers: Header[];
  rateLimit: number;
  blockDotfiles: boolean;
  proxyTarget: string;
  websocket: boolean;
}
export interface Domain { id: string; siteId: string; hostname: string }
export interface SampleCert { siteId: string; issuer: string; expiresAt: string }
export interface Activity { id: string; at: string; message: string }
export interface State { sites: Site[]; domains: Domain[]; sampleCerts: SampleCert[]; activity: Activity[] }

const KEY = "webnest-demo-v2";
export const PHP_VERSION = "8.4";
export const RELEASE = "0.1.0 előzetes · tesztkörnyezetbe";
export const HEADER_NAMES = ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy", "Cache-Control"];
export const ROOT_RE = /^\/home\/container\/sites(\/[A-Za-z0-9_-]+)+$/;
export const RATE_MIN = 1;
export const RATE_MAX = 10000;
export function validProxyTarget(t: string) {
  const m = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/?$/.exec(t.trim());
  if (!m) return false;
  const p = Number(m[1]);
  return p >= 1024 && p <= 65535;
}
export const TYPE_LABEL: Record<SiteType, string> = { php: "PHP alkalmazás", static: "Statikus oldal", proxy: "Fordított proxy" };

export const uid = () => Math.random().toString(36).slice(2, 10);
const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

function seed(): State {
  const sites: Site[] = [
    { id: "s-balaton", name: "Balatoni Vitorlás Egylet", domain: "balaton-vitorlas.example", type: "php", root: "/home/container/sites/balaton/public", enabled: true, phpVersion: "8.4", forceHttps: true, headers: [{ name: "X-Frame-Options", value: "SAMEORIGIN" }, { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" }], rateLimit: 30, blockDotfiles: true, proxyTarget: "", websocket: false },
    { id: "s-kiado", name: "Kőrösi Kiadó katalógus", domain: "korosi-kiado.example.org", type: "static", root: "/home/container/sites/korosi-kiado/dist", enabled: true, phpVersion: "8.4", forceHttps: true, headers: [{ name: "Cache-Control", value: "public, max-age=3600" }], rateLimit: 30, blockDotfiles: true, proxyTarget: "", websocket: false },
    { id: "s-api", name: "Műhely API", domain: "api.muhely.example.net", type: "proxy", root: "/home/container/sites/muhely-api", enabled: false, phpVersion: "8.4", forceHttps: false, headers: [], rateLimit: 30, blockDotfiles: false, proxyTarget: "http://127.0.0.1:3000", websocket: true },
  ];
  return {
    sites,
    domains: [
      { id: "d1", siteId: "s-balaton", hostname: "www.balaton-vitorlas.example" },
      { id: "d2", siteId: "s-balaton", hostname: "regatta.balaton-vitorlas.example" },
      { id: "d3", siteId: "s-kiado", hostname: "www.korosi-kiado.example.org" },
    ],
    sampleCerts: [
      { siteId: "s-balaton", issuer: "Let's Encrypt R11 (minta)", expiresAt: daysFromNow(61) },
      { siteId: "s-kiado", issuer: "Let's Encrypt E6 (minta)", expiresAt: daysFromNow(9) },
    ],
    activity: [{ id: uid(), at: new Date().toISOString(), message: "Bemutató adatok betöltve: 3 minta webhely" }],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as State; s.sites = s.sites.map((x) => ({ ...x, phpVersion: PHP_VERSION })); return s; }
  } catch { /* corrupt storage falls back to seed */ }
  return seed();
}

let state: State = load();
const listeners = new Set<() => void>();
function set(next: State, message?: string) {
  state = message ? { ...next, activity: [{ id: uid(), at: new Date().toISOString(), message }, ...next.activity].slice(0, 200) } : next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useStore(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
export const getState = () => state;

export const actions = {
  createSite(s: Omit<Site, "id">) {
    const site = { ...s, id: "s-" + uid() };
    set({ ...state, sites: [...state.sites, site] }, `Webhely létrehozva: ${site.name} (${site.domain})`);
    return site;
  },
  updateSite(id: string, patch: Partial<Site>, message?: string) {
    const old = state.sites.find((s) => s.id === id);
    if (!old) return;
    set({ ...state, sites: state.sites.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, message ?? `Webhely módosítva: ${patch.name ?? old.name}`);
  },
  deleteSite(id: string) {
    const old = state.sites.find((s) => s.id === id);
    if (!old) return;
    set({ ...state, sites: state.sites.filter((s) => s.id !== id), domains: state.domains.filter((d) => d.siteId !== id), sampleCerts: state.sampleCerts.filter((c) => c.siteId !== id) }, `Webhely törölve: ${old.name} és kapcsolódó domainjei`);
  },
  createDomain(siteId: string, hostname: string) {
    set({ ...state, domains: [...state.domains, { id: "d-" + uid(), siteId, hostname }] }, `Domain hozzáadva: ${hostname}`);
  },
  updateDomain(id: string, siteId: string, hostname: string) {
    set({ ...state, domains: state.domains.map((d) => (d.id === id ? { ...d, siteId, hostname } : d)) }, `Domain módosítva: ${hostname}`);
  },
  deleteDomain(id: string) {
    const d = state.domains.find((x) => x.id === id);
    set({ ...state, domains: state.domains.filter((x) => x.id !== id) }, `Domain törölve: ${d?.hostname ?? id}`);
  },
  clearActivity() { set({ ...state, activity: [] }); },
  reset() { set(seed()); },
  importState(s: State) { set(s, "Bemutató állapot importálva"); },
};

export const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export function hostTaken(host: string, ignoreDomainId?: string, ignoreSiteId?: string) {
  const h = host.toLowerCase();
  return state.sites.some((s) => s.id !== ignoreSiteId && s.domain.toLowerCase() === h) || state.domains.some((d) => d.id !== ignoreDomainId && d.hostname.toLowerCase() === h);
}
export function securityScore(s: Site) {
  let n = 0;
  if (s.forceHttps) n++;
  if (s.blockDotfiles) n++;
  if (s.headers.length > 0) n++;
  if (s.headers.length > 1) n++;
  return n;
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleString("hu-HU", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
