import { Injectable, inject } from "@angular/core";
import { Role, Session } from "./models";
import { VENDORS } from "./data.service";
import { ActivityService } from "./activity.service";
import { VENDOR_CONTACTS } from "./contacts";

interface DemoUser extends Session {
  password: string;
}

const SESSION_KEY = "pvi_session";
const DEMO_PASSWORD = "demo";

@Injectable({ providedIn: "root" })
export class AuthService {
  private activity = inject(ActivityService);

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

  login(email: string, password: string): Session | null {
    const u = this.demoUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || password !== u.password) return null;
    const session: Session = { email: u.email, name: u.name, role: u.role, vendorId: u.vendorId };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
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
