import { Injectable, inject } from "@angular/core";
import { AuthService } from "./auth.service";
import { VendorAdminService } from "./vendor-admin.service";

/**
 * Single source of truth for the LOGGED-IN user's dashboard subscriptions.
 *
 * For vendor users this reads/writes `VUser.subscriptions` on the account record
 * (VendorAdminService), so the Subscribe button on a dashboard, the toggles on the
 * Dashboards list, and the admin "Report subscriptions" panel all stay in sync and
 * persist across sessions (VendorAdminService persists to localStorage).
 *
 * Admins have no vendor account, so their toggles fall back to a per-email localStorage
 * key — still persistent, just not part of a vendor account record.
 *
 * NOTE FOR DEV TEAM: this only records the user's *intent* to receive a dashboard by email.
 * The actual scheduled-email delivery (render + send + cadence + unsubscribe link) is NOT
 * wired up yet and needs to be built server-side against the real subscription store.
 */
@Injectable({ providedIn: "root" })
export class SubscriptionService {
  private auth = inject(AuthService);
  private va = inject(VendorAdminService);

  private email(): string { return (this.auth.session()?.email || "").toLowerCase(); }
  private fbKey(): string { return "pvi_subs_" + this.email(); }
  private fbList(): string[] { try { return JSON.parse(localStorage.getItem(this.fbKey()) || "[]"); } catch { return []; } }
  private fbSet(ids: string[]): void { try { localStorage.setItem(this.fbKey(), JSON.stringify(ids)); } catch { /* ignore */ } }

  /** Dashboard ids the current user is subscribed to. */
  list(): string[] {
    const u = this.va.getUser(this.email());
    return u ? u.subscriptions : this.fbList();
  }
  isSubscribed(id: string): boolean { return this.list().includes(id); }
  count(): number { return this.list().length; }

  toggle(id: string): void {
    const email = this.email();
    const u = this.va.getUser(email);
    if (u) {
      this.va.toggleSubscription(email, id);
    } else {
      const set = new Set(this.fbList());
      set.has(id) ? set.delete(id) : set.add(id);
      this.fbSet([...set]);
    }
  }
}
