import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { VENDORS } from "./data.service";
import { DASHBOARDS } from "./models";
import { VENDOR_CONTACTS as CONTACTS, LEGRAND_BRANDS, LEGRAND_CONTACTS, Contact } from "./contacts";
import { AuthService } from "./auth.service";
import { DATA_MODE, API_BASE_URL } from "./app-config";

export type SubStatus = "active" | "expired" | "scheduled" | "none" | "suspended";
export const USER_PERMISSIONS = ["Brands", "Buying Group", "Parent Category", "Subcategory", "State", "Proposal Status", "Supplier", "Aggregation", "Date Range", "Export CSV", "Pull reports"];

export interface Company {
  name: string; brands: string[]; perms: Record<string, boolean>;
  parents: string[];        // company DEFAULT parent-category restriction; [] == all
  subs: string[];           // company DEFAULT sub-category restriction; [] == all
  states: string[];         // company DEFAULT state restriction; [] == all
  start: string; end: string;
}
export interface VUser {
  email: string; firstName: string; lastName: string; name: string; companyName: string;
  brands: string[]; perms: Record<string, boolean>; suspended: boolean;
  parents: string[];        // parent-category restriction; [] == all categories
  subs: string[];           // sub-category restriction; [] == all
  buyingGroups: string[];   // buying-group restriction; [] == all
  states: string[];         // state restriction; [] == all
  subscriptions: string[];  // dashboard ids this user is subscribed to
  createdBy?: string;       // who created this user (email/name)
  createdAt?: number;       // epoch ms when created
  freeSignup?: boolean;     // self-serve free account (no subscription) — shown the teaser Home, not the dashboards
}

interface AdminState { companies: Company[]; users: VUser[]; logos: Record<string, string>; logins?: Record<string, { count: number; last: number }>; }
const LS = "pvi_vendor_admin_v7";
const iso = (o: number) => new Date(Date.now() + o * 86_400_000).toISOString().slice(0, 10);
const allPerms = () => Object.fromEntries(USER_PERMISSIONS.map((p) => [p, true])) as Record<string, boolean>;
const title = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const DEFAULT_SUBS = DASHBOARDS.slice(0, 2).map((d) => d.id);

@Injectable({ providedIn: "root" })
export class VendorAdminService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private state: AdminState = this.load();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  storeError = "";

  constructor() { if (DATA_MODE === "api") void this.refresh(); }

  /** Pull the authoritative dataset from the server (admins only). Admin pages await this on load.
   *  Falls back silently to the local cache/seed when offline or not configured. */
  async refresh(): Promise<void> {
    if (DATA_MODE !== "api") return;
    const t = this.auth.token();
    if (!t || this.auth.session()?.role !== "admin") return;
    try {
      const data = await firstValueFrom(this.http.get<AdminState>(API_BASE_URL + "/api/admin-vendors", { headers: { Authorization: "Bearer " + t } }));
      if (data && Array.isArray(data.companies) && Array.isArray(data.users)) {
        this.state = { companies: data.companies, users: data.users, logos: data.logos || {}, logins: data.logins || {} };
        try { localStorage.setItem(LS, JSON.stringify(this.state)); } catch { /* ignore */ }
        this.storeError = "";
      }
    } catch (e: any) {
      this.storeError = "Couldn't load the vendor store: " + ((e && e.message) || e);
    }
  }

  /** Push the whole dataset to the server (admins only, debounced). Called by persist(). */
  private sync(): void {
    if (DATA_MODE !== "api") return;
    const t = this.auth.token();
    if (!t || this.auth.session()?.role !== "admin") return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.http.put(API_BASE_URL + "/api/admin-vendors", this.state, { headers: { Authorization: "Bearer " + t } })
        .subscribe({ error: (e) => { this.storeError = "Couldn't save to the vendor store: " + ((e && e.message) || e); } });
    }, 350);
  }

  private load(): AdminState {
    try { const r = localStorage.getItem(LS); if (r) return JSON.parse(r) as AdminState; } catch { /* ignore */ }
    const s = this.seed();
    this.persist(s);
    return s;
  }
  private seed(): AdminState {
    const companies: Company[] = VENDORS.map((v) =>
      v.id === "klipsch" ? { name: v.name, brands: [v.name], perms: allPerms(), parents: [], subs: [], states: [], start: iso(-400), end: iso(-30) }
      : v.id === "luma" ? { name: v.name, brands: [v.name], perms: allPerms(), parents: [], subs: [], states: [], start: iso(30), end: iso(400) }
      : { name: v.name, brands: [v.name], perms: allPerms(), parents: [], subs: [], states: [], start: iso(-180), end: iso(180) },
    );
    companies.push({ name: "Legrand", brands: [...LEGRAND_BRANDS], perms: allPerms(), parents: [], subs: [], states: [], start: iso(-150), end: iso(210) });

    const users: VUser[] = [];
    for (const v of VENDORS) {
      const seeds = CONTACTS[v.id] || [{ first: title(v.name), last: "Team", email: v.contactEmail }];
      seeds.forEach((c, i) => users.push(this.mk(c, v.name, [v.name], i)));
    }
    LEGRAND_CONTACTS.forEach((c, i) => users.push(this.mk(c, "Legrand", [...LEGRAND_BRANDS], i)));
    return { companies, users, logos: {} };
  }
  private mk(c: Contact, company: string, brands: string[], i: number): VUser {
    return {
      email: c.email.toLowerCase(), firstName: c.first, lastName: c.last, name: (c.first + " " + c.last).trim(),
      companyName: company, brands: [...brands], perms: allPerms(), suspended: false,
      parents: [], subs: [], buyingGroups: [], states: [],
      subscriptions: i === 0 ? [...DEFAULT_SUBS] : DEFAULT_SUBS.slice(0, 1),
      createdAt: Date.now() - (120 + i * 30) * 86_400_000,
      createdBy: "Portal (seed)",
    };
  }
  private persist(s = this.state): void { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* ignore */ } this.sync(); }

  /* companies */
  listCompanies(): Company[] { return this.state.companies; }
  getCompany(name: string): Company | undefined { return this.state.companies.find((c) => c.name === name); }
  addCompany(c: { name: string; brands: string[]; perms: Record<string, boolean>; parents?: string[]; subs?: string[]; states?: string[] }): void {
    if (!c.name.trim() || this.getCompany(c.name.trim())) return;
    this.state.companies.push({ name: c.name.trim(), brands: c.brands, perms: c.perms, parents: c.parents || [], subs: c.subs || [], states: c.states || [], start: iso(0), end: iso(365) });
    this.persist();
  }
  updateCompany(name: string, patch: { brands?: string[]; perms?: Record<string, boolean>; parents?: string[]; subs?: string[]; states?: string[] }): void {
    const c = this.getCompany(name); if (!c) return;
    if (patch.brands) c.brands = patch.brands;
    if (patch.perms) c.perms = patch.perms;
    if (patch.parents) c.parents = patch.parents;
    if (patch.subs) c.subs = patch.subs;
    if (patch.states) c.states = patch.states;
    this.persist();
  }
  deleteCompany(name: string): void {
    this.state.companies = this.state.companies.filter((c) => c.name !== name);
    this.state.users = this.state.users.filter((u) => u.companyName !== name);
    this.persist();
  }
  setCompanySub(name: string, start: string, end: string): void { const c = this.getCompany(name); if (c) { c.start = start; c.end = end; this.persist(); } }
  companyStatus(name: string): SubStatus {
    const c = this.getCompany(name);
    if (!c) return "none";
    const now = new Date();
    if (now < new Date(c.start + "T00:00:00")) return "scheduled";
    if (now > new Date(c.end + "T23:59:59")) return "expired";
    return "active";
  }
  companySub(name: string): { start: string; end: string } | undefined { const c = this.getCompany(name); return c ? { start: c.start, end: c.end } : undefined; }

  /* users */
  listUsers(): VUser[] { return this.state.users; }
  usersForCompany(name: string): VUser[] { return this.state.users.filter((u) => u.companyName === name); }
  usersForBrandName(brand: string): VUser[] { return this.state.users.filter((u) => u.brands.includes(brand)); }
  getUser(email: string): VUser | undefined { return this.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()); }
  addUser(u: { firstName: string; lastName: string; email: string; companyName: string; brands: string[]; perms: Record<string, boolean>; parents?: string[]; subs?: string[]; buyingGroups?: string[]; states?: string[]; subscriptions?: string[]; createdBy?: string }): void {
    const email = u.email.trim().toLowerCase();
    if (!email || this.getUser(email)) return;
    this.state.users.push({
      email, firstName: u.firstName, lastName: u.lastName, name: (u.firstName + " " + u.lastName).trim() || email,
      companyName: u.companyName, brands: u.brands, perms: u.perms, suspended: false,
      parents: u.parents || [], subs: u.subs || [], buyingGroups: u.buyingGroups || [], states: u.states || [],
      subscriptions: u.subscriptions || [...DEFAULT_SUBS],
      createdAt: Date.now(),
      createdBy: u.createdBy || "—",
    });
    this.persist();
  }
  updateUser(email: string, patch: Partial<VUser>): void {
    const u = this.getUser(email); if (!u) return;
    Object.assign(u, patch);
    u.name = (u.firstName + " " + u.lastName).trim() || u.email;
    this.persist();
  }
  deleteUser(email: string): void { this.state.users = this.state.users.filter((u) => u.email.toLowerCase() !== email.toLowerCase()); this.persist(); }
  setSuspended(email: string, val: boolean): void { const u = this.getUser(email); if (u) { u.suspended = val; this.persist(); } }
  setFreeSignup(email: string, val: boolean): void { const u = this.getUser(email); if (u) { u.freeSignup = val; this.persist(); } }
  toggleSubscription(email: string, id: string): void {
    const u = this.getUser(email); if (!u) return;
    const i = u.subscriptions.indexOf(id);
    i >= 0 ? u.subscriptions.splice(i, 1) : u.subscriptions.push(id);
    this.persist();
  }

  /* access used by the shell */
  statusOf(email: string): SubStatus {
    const u = this.getUser(email);
    if (!u) return "none";
    if (u.suspended) return "suspended";
    return this.companyStatus(u.companyName);
  }
  subFor(email: string): { start: string; end: string } | undefined { const u = this.getUser(email); return u ? this.companySub(u.companyName) : undefined; }

  /* logos (keyed by brand id for the shell, or company name on the company page) */
  setLogo(key: string, dataUrl: string): void { this.state.logos[key] = dataUrl; this.persist(); }
  getLogo(key: string): string | undefined { return this.state.logos[key]; }
  /** Real server-recorded login info for a user (count + last ts), or null if they haven't logged in since launch. */
  loginFor(email: string): { count: number; last: number } | null { const l = this.state.logins?.[email.toLowerCase()]; return l && l.count ? l : null; }
  clearLogo(key: string): void { delete this.state.logos[key]; this.persist(); }
}
