import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { AuthService } from "./core/auth.service";
import { DataService } from "./core/data.service";
import { VendorAdminService } from "./core/vendor-admin.service";
import { DownloadService } from "./core/download.service";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <div class="shell">
      <aside class="nav-rail">
        <div class="brand">
          <img *ngIf="!logoFailed" src="https://portal.io/assets/images/logo-index.png" (error)="logoFailed = true" alt="Portal" style="max-width:108px;max-height:30px;object-fit:contain" />
          <span *ngIf="logoFailed" style="font-weight:800;font-size:18px;color:#fff">Portal<span style="color:var(--accent)">.</span></span>
        </div>
        <a class="navlink" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><mat-icon>home</mat-icon> Home</a>
        <a class="navlink" routerLink="/dashboards" routerLinkActive="active"><mat-icon>grid_view</mat-icon> Dashboards</a>
        <a class="navlink" routerLink="/profile" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><mat-icon>person</mat-icon> Profile</a>
        <ng-container *ngIf="isAdmin">
          <div class="section-label">Portal Admin</div>
          <a class="navlink" routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><mat-icon>insights</mat-icon> Admin</a>
          <a class="navlink" routerLink="/admin/vendors" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><mat-icon>storefront</mat-icon> Vendors</a>
        </ng-container>
        <div class="foot">MVP prototype · sample data</div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div></div>
          <div class="right">
            <span *ngIf="subText" class="subnav" [class.exp]="subExpired">{{ subText }}</span>
            <img *ngIf="brandLogo" class="topbar-logo" [src]="brandLogo" alt="brand logo" />
            <span class="scope-pill" [class.admin]="isAdmin">{{ scope }}</span>
            <div class="avatar" (click)="goProfile()" style="cursor:pointer" [title]="session.name + ' (' + session.email + ') — view profile'">{{ initials }}</div>
            <button class="pbtn" (click)="logout()">Sign out</button>
          </div>
        </header>
        <div class="content" style="position:relative">
          <div *ngIf="locked" class="lock-overlay">
            <div class="lock-card">
              <mat-icon>lock</mat-icon>
              <h3>{{ lockMessage }}</h3>
              <p class="muted">Contact your Portal account manager to restore access to Market Insights.</p>
            </div>
          </div>
          <div [class.grayed]="locked"><router-outlet></router-outlet></div>
        </div>
      </div>
    </div>

    <div *ngIf="dl.pending" class="dl-modal">
      <div class="dl-card">
        <h3>Confirm download</h3>
        <p class="muted" style="font-size:12.5px;word-break:break-all">{{ dl.pending.filename }}</p>
        <div class="dl-warn"><b>Confidential.</b> You may not share this information with anyone outside your organization without written permission from Portal. This download is recorded against your account with the date, time, and your IP address.</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button class="pbtn" (click)="dl.cancel()">Cancel</button>
          <button class="pbtn primary" (click)="dl.confirm()">I agree — download</button>
        </div>
      </div>
    </div>

    <div class="print-footer">{{ footerText }}</div>
  `,
})
export class AppShellComponent {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private va = inject(VendorAdminService);
  private router = inject(Router);
  dl = inject(DownloadService);
  session = this.auth.session()!;
  logoFailed = false;
  footerText = "Confidential. Prepared for " + this.session.name + " on " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  get isAdmin(): boolean { return this.session.role === "admin"; }
  get scope(): string { return this.isAdmin ? "Portal Admin" : this.data.getVendor(this.session.vendorId || "")?.name || "Your brand"; }
  get initials(): string {
    const parts = this.session.name.replace(/[^a-zA-Z ]/g, " ").trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((w) => w[0]).join("") || "U").toUpperCase();
  }
  get brandLogo(): string | undefined { return this.isAdmin ? undefined : (this.session.logo || this.va.getLogo(this.session.vendorId || "") || undefined); }
  /** Subscription status — AUTHORITATIVE from the session window (the live DB, via /api/session), falling back
   *  to the client store only in synthetic mode (no session window). Replaces the old client-only check, which
   *  read a stale local cache as "expired" for vendors. */
  get subStatus(): "active" | "expired" | "scheduled" | "suspended" | "none" {
    if (this.isAdmin) return "active";
    const s = this.session;
    if (s.suspended) return "suspended";
    if (s.subStart || s.subEnd) {
      const now = Date.now();
      if (s.subStart && now < new Date(s.subStart + "T00:00:00").getTime()) return "scheduled";
      if (s.subEnd && now > new Date(s.subEnd + "T23:59:59").getTime()) return "expired";
      return "active";
    }
    return this.va.statusOf(s.email); // synthetic / no window in session
  }
  /** Only the data dashboards (Market Insights + Premium Placement) gate on subscription; Home and Profile are
   *  always reachable so a vendor can land and navigate regardless of subscription state. */
  private get onGatedRoute(): boolean { const u = this.router.url.split("?")[0]; return u.startsWith("/dashboards") || u.startsWith("/premium"); }
  get locked(): boolean { return !this.isAdmin && this.subStatus !== "active" && this.onGatedRoute; }
  get lockMessage(): string {
    const st = this.subStatus;
    return st === "scheduled" ? "Your subscription hasn't started yet" : st === "suspended" ? "Your account has been suspended" : "Your subscription has expired";
  }
  get subExpired(): boolean { return !this.isAdmin && this.subStatus !== "active"; }
  get subText(): string {
    if (this.isAdmin) return "";
    const status = this.subStatus;
    if (status === "expired") return "Subscription expired";
    if (status === "suspended") return "Account suspended";
    if (status === "scheduled") return "Subscription not started";
    const end = this.session.subEnd || (this.va.subFor(this.session.email) || { end: "" }).end;
    if (!end) return "";
    const days = Math.round((new Date(end + "T23:59:59").getTime() - Date.now()) / 86400000);
    return days + " days left";
  }
  goProfile(): void { this.router.navigate(["/profile"]); }
  logout(): void { this.auth.logout(); this.router.navigate(["/login"]); }
}
