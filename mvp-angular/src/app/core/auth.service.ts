import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { Role, Session } from "./models";
import { VENDORS } from "./data.service";
import { ActivityService } from "./activity.service";
import { VENDOR_CONTACTS } from "./contacts";
import { DATA_MODE, API_BASE_URL } from "./app-config";

interface DemoUser extends Session {
  password: string;
}

const SESSION_KEY = "pvi_session";
const TOKEN_KEY = "pvi_token";
const DEMO_PASSWORD = "demo";

@Injectable({ providedIn: "root" })
export class AuthService {
  private activity = inject(ActivityService);
  private http = inject(HttpClient);

  private admins: DemoUser[] = [
    { email: "lee@portal.io", name: "Lee (Portal)", role: "admin", password: DEMO_PASSWORD },
    { email: "admin@portal.io", name: "Portal Admin", role: "admin", password: DEMO_PASSWORD },
  ];

  readonly demoUsers: DemoUser[] = [
    ...this.admins,
    ...VENDORS.map((v) => {
      const c = VENDOR_CONTACTS[v.id] && VENDOR_CONTACTS[v.id][0];
      return {
        email: c ? c.email : v.contactEmail,
        name: c ? `${c.first} ${c.last}` : `${v.name} Team`,
        role: "vendor" as Role,
        vendorId: v.id,
        password: DEMO_PASSWORD,
      };
    }),
  ];

  session(): Session | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  /** In live (api) mode the SERVER validates credentials and issues a signed token (real
   *  enforcement). In synthetic/demo mode it falls back to the in-browser check. */
  async login(email: string, password: string): Promise<Session | null> {
    const e = email.trim().toLowerCase();
    const u = this.demoUsers.find((x) => x.email.toLowerCase() === e);
    if (DATA_MODE === "api") {
      try {
        const r = await firstValueFrom(this.http.post<{ token: string; allowedParents?: string[]; allowedSubs?: string[]; allowedStates?: string[]; allowedBrands?: string[]; perms?: Record<string, boolean>; logo?: string; subStart?: string; subEnd?: string; suspended?: boolean }>(API_BASE_URL + "/api/session", { email: e, password }));
        if (!r || !r.token) return null;
        return this.establish(u, e, r.token, { allowedParents: r.allowedParents || [], allowedSubs: r.allowedSubs || [], allowedStates: r.allowedStates || [], allowedBrands: r.allowedBrands || [], perms: r.perms || {}, logo: r.logo || "", subStart: r.subStart || "", subEnd: r.subEnd || "", suspended: !!r.suspended });
      } catch {
        return null;
      }
    }
    if (!u || password !== u.password) return null;
    return this.establish(u, e, "");
  }

  token(): string { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }

  /** Subscription status from the session window (authoritative — set by /api/session at login). Admins are
   *  always active. Returns "none" when the session carries no window (synthetic/demo mode), so callers can
   *  apply a local fallback. Single source of truth for the Market Insights + Premium Placement gates. */
  subStatus(): "active" | "expired" | "scheduled" | "suspended" | "none" {
    const s = this.session();
    if (!s) return "none";
    if (s.role === "admin") return "active";
    if (s.suspended) return "suspended";
    if (s.subStart || s.subEnd) {
      const now = Date.now();
      if (s.subStart && now < new Date(s.subStart + "T00:00:00").getTime()) return "scheduled";
      if (s.subEnd && now > new Date(s.subEnd + "T23:59:59").getTime()) return "expired";
      return "active";
    }
    return "none";
  }

  private establish(u: DemoUser | undefined, email: string, token: string, scope?: Partial<Session>): Session {
    const base: Session = u ? { email: u.email, name: u.name, role: u.role, vendorId: u.vendorId } : { email, name: email, role: "vendor" };
    const session: Session = { ...base, ...(scope || {}) };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
    } catch { /* ignore */ }
    this.activity.log({
      vendorId: session.vendorId || "portal",
      vendorName: session.role === "admin" ? "Portal" : session.name,
      userEmail: session.email,
      type: "login",
    });
    return session;
  }


  updateSession(patch: Partial<Session>): Session | null {
    const s = this.session();
    if (!s) return null;
    const next: Session = { ...s, ...patch };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }

  logout(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  // Maps to the "Vendor Management" permission in admin.portal.io. The new app
  // reads this from Portal identity; for the mock, any Portal admin has it.
  canManageVendors(): boolean {
    const s = this.session();
    return !!s && s.role === "admin";
  }
}
