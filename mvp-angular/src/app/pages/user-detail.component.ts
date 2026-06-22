import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { VendorAdminService, VUser } from "../core/vendor-admin.service";
import { DataService } from "../core/data.service";
import { AnalyticsService } from "../core/analytics.service";
import { ActivityService } from "../core/activity.service";
import { DownloadService } from "../core/download.service";
import { MultiSelectComponent } from "../components/multiselect.component";
import { DASHBOARDS } from "../core/models";
import { fmtDateTime, fmtNumber, relativeTime } from "../core/format";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

@Component({
  selector: "app-user-detail",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MultiSelectComponent],
  template: `
    <a routerLink="/admin/vendors" class="muted" style="font-size:12px">&larr; Back to Vendors</a>
    <div *ngIf="storeError" class="pcard" style="margin-top:10px;border:1px solid var(--negative)"><div class="bd" style="color:var(--negative);font-size:12px"><b>Vendor store not connected.</b> Changes are only cached in this browser and will NOT be applied to vendor logins. {{ storeError }}</div></div>
    <div *ngIf="!user" class="pcard" style="margin-top:12px"><div class="bd muted">User not found.</div></div>

    <ng-container *ngIf="user as u">
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:10px">
        <div>
          <h1>{{ u.name }}</h1>
          <p>{{ u.email }} · {{ u.companyName }}
            <span class="sub-badge" [ngClass]="u.suspended ? 'expired' : 'active'" style="margin-left:6px">{{ u.suspended ? "Suspended" : "Active" }}</span>
          </p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="pbtn" (click)="resetPw()">Reset password</button>
          <button class="pbtn" [class.primary]="u.suspended" (click)="toggleSuspend()">{{ u.suspended ? "Reactivate" : "Suspend" }}</button>
        </div>
      </div>

      <div class="grid c4" style="margin-bottom:16px">
        <div class="pcard kpi"><div class="label">Logins (12 mo)</div><div class="value">{{ n(stats.logins) }}</div></div>
        <div class="pcard kpi"><div class="label">Dashboard views</div><div class="value">{{ n(stats.views) }}</div></div>
        <div class="pcard kpi"><div class="label">Reports pulled</div><div class="value">{{ n(stats.reportsPulled) }}</div></div>
        <div class="pcard kpi"><div class="label">CSV extracts</div><div class="value">{{ n(stats.csvExports) }}</div></div>
      </div>

      <div class="grid c2" style="align-items:start">
        <div class="pcard"><div class="hd"><div class="t">Access &amp; visibility</div><div class="s">Re-map this user's brands and category access</div></div>
          <div class="bd">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Identity</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <input class="minput" style="flex:1;min-width:120px" placeholder="First name" [(ngModel)]="edit.firstName" />
              <input class="minput" style="flex:1;min-width:120px" placeholder="Last name" [(ngModel)]="edit.lastName" />
            </div>
            <input class="minput" style="width:100%;margin-bottom:4px" placeholder="Email address" type="email" [(ngModel)]="edit.email" />
            <div *ngIf="err" style="color:var(--negative);font-size:11px;margin-bottom:8px">{{ err }}</div>
            <div style="border-top:1px solid var(--border);margin:12px 0"></div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Visible brands</div>
            <input class="minput" style="width:100%;margin-bottom:6px" placeholder="Type a brand to add…" [(ngModel)]="brandQuery" />
            <div class="suggest" *ngIf="brandSuggest.length"><div class="sg" *ngFor="let b of brandSuggest" (click)="addBrand(b); brandQuery=''">{{ b }}</div></div>
            <div class="chips" style="margin-bottom:14px"><span class="chip on" *ngFor="let b of edit.brands" (click)="removeBrand(b)">{{ b }} ✕</span><span *ngIf="!edit.brands.length" class="muted" style="font-size:12px">No brands assigned.</span></div>

            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Restrict access <span class="muted">— empty = inherit the company default; set values to override for this user</span></div>
            <div class="muted" style="font-size:11px;margin-bottom:6px">Company default: <b>{{ coDefault }}</b></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
              <app-multiselect label="Parent categories" allLabel="All categories" [options]="parentOptions" [selected]="edit.parents" (selectedChange)="edit.parents=$event"></app-multiselect>
              <app-multiselect label="Sub-categories" allLabel="All sub-categories" [options]="subOptions" [selected]="edit.subs" (selectedChange)="edit.subs=$event"></app-multiselect>
              <app-multiselect label="Buying groups" allLabel="All groups" [search]="false" [options]="buyingGroupOptions" [selected]="edit.buyingGroups" (selectedChange)="edit.buyingGroups=$event"></app-multiselect>
              <app-multiselect label="States" allLabel="All states" [options]="stateOptions" [labels]="stateLabels" [selected]="edit.states" (selectedChange)="edit.states=$event"></app-multiselect>
            </div>

            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Permissions</div>
            <div class="chips" style="margin-bottom:14px"><span class="chip" [class.on]="edit.perms[p]" *ngFor="let p of perms" (click)="edit.perms[p]=!edit.perms[p]" style="cursor:pointer">{{ p }}</span></div>

            <div style="border-top:1px solid var(--border);margin:18px 0 12px"></div>
            <button class="pbtn primary" style="width:100%;padding:12px;font-size:14px;font-weight:700;letter-spacing:.2px" (click)="save()">Save access changes</button>
            <div *ngIf="saved" style="color:var(--positive);font-size:12px;margin-top:8px;text-align:center;font-weight:600">&#10003; Access saved &mdash; applies on this user's next login</div>
          </div>
        </div>

        <div class="pcard"><div class="hd"><div class="t">Report subscriptions <span class="muted" style="font-weight:400">· {{ u.subscriptions.length }} active</span></div><div class="s">Dashboards emailed to this user on a schedule. Email sending is flagged for the dev team.</div></div>
          <div class="bd">
            <div class="perm-row" *ngFor="let d of dashboards">
              <span>{{ d.name }}<div class="muted" style="font-size:11px">{{ d.description }}</div></span>
              <label class="switch"><input type="checkbox" [checked]="u.subscriptions.includes(d.id)" (change)="toggleSub(d.id)" /><span class="track"></span></label>
            </div>
          </div>
        </div>
      </div>

      <div class="pcard" style="margin-top:16px"><div class="hd"><div class="t">Download log</div><div class="s">Every export, with time and IP (captured server-side)</div></div>
        <div class="bd">
          <table class="ptbl" *ngIf="downloads.length"><thead><tr><th>When</th><th>File</th><th>IP</th></tr></thead>
            <tbody><tr *ngFor="let d of downloads"><td class="muted">{{ dt(d.ts) }}</td><td style="font-size:11px;word-break:break-all">{{ d.filename }}</td><td class="muted">{{ d.ip }}</td></tr></tbody>
          </table>
          <div *ngIf="!downloads.length" class="muted">No downloads recorded for this user yet.</div>
        </div>
      </div>
    </ng-container>
  `,
})
export class UserDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private va = inject(VendorAdminService);
  private data = inject(DataService);
  private an = inject(AnalyticsService);
  private activity = inject(ActivityService);
  private dl = inject(DownloadService);

  email = this.route.snapshot.paramMap.get("email") || "";
  user: VUser | undefined = this.va.getUser(this.email);
  perms = this.user ? Object.keys(this.user.perms) : [];
  dashboards = DASHBOARDS;
  get parentOptions(): string[] { return this.an.parentCats; }
  buyingGroupOptions = this.an.buyingGroups;
  get stateOptions(): string[] { return this.an.states; }
  get stateLabels(): Record<string, string> { return this.an.stateLabels; }
  catalog = this.an.brandList;
  stats = this.activity.userBreakdown([this.email], 365)[0];
  brandQuery = "";
  saved = false;
  err = "";
  edit = this.snapshot();

  private snapshot() {
    const u = this.user;
    return {
      firstName: u ? u.firstName : "",
      lastName: u ? u.lastName : "",
      email: u ? u.email : "",
      brands: u && u.brands ? [...u.brands] : [],
      parents: u && u.parents ? [...u.parents] : [],
      subs: u && u.subs ? [...u.subs] : [],
      buyingGroups: u && u.buyingGroups ? [...u.buyingGroups] : [],
      states: u && u.states ? [...u.states] : [],
      perms: u ? { ...u.perms } : {} as Record<string, boolean>,
    };
  }

  async ngOnInit(): Promise<void> {
    this.an.ready();
    await this.va.refresh();
    this.user = this.va.getUser(this.email);
    this.perms = this.user ? Object.keys(this.user.perms) : this.perms;
    this.edit = this.snapshot();
  }
  get storeError(): string { return this.va.storeError; }
  get coDefault(): string { const c = this.user ? this.va.getCompany(this.user.companyName) : undefined; return c && c.parents.length ? c.parents.join(", ") : "All categories"; }

  get downloads() { return this.dl.downloadsFor(this.email); }
  get subOptions(): string[] { return this.edit.parents.length ? this.an.subsForParents(this.edit.parents) : []; }
  get brandSuggest(): string[] { const q = this.brandQuery.toLowerCase().trim(); return q ? this.catalog.filter((b) => b.toLowerCase().includes(q) && !this.edit.brands.includes(b)).slice(0, 6) : []; }

  n = fmtNumber;
  dt = fmtDateTime;
  rel = relativeTime;
  addBrand(b: string): void { if (!this.edit.brands.includes(b)) this.edit.brands.push(b); }
  removeBrand(b: string): void { const i = this.edit.brands.indexOf(b); if (i >= 0) this.edit.brands.splice(i, 1); }
  save(): void {
    const email = this.edit.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { this.err = "Enter a valid email address."; return; }
    if (email !== this.email.toLowerCase() && this.va.getUser(email)) { this.err = "That email is already in use."; return; }
    this.err = "";
    this.va.updateUser(this.email, { firstName: this.edit.firstName, lastName: this.edit.lastName, email, brands: this.edit.brands, parents: this.edit.parents, subs: this.edit.subs, buyingGroups: this.edit.buyingGroups, states: this.edit.states, perms: this.edit.perms });
    if (email !== this.email.toLowerCase()) { this.router.navigate(["/admin/vendors/user", email]); return; }
    this.user = this.va.getUser(this.email);
    this.saved = true;
    setTimeout(() => (this.saved = false), 2000);
  }
  toggleSub(id: string): void { this.va.toggleSubscription(this.email, id); this.user = this.va.getUser(this.email); }
  resetPw(): void { alert("Password reset email sent to " + this.email + " (demo). The real account-setup/confirmation email flow is flagged for the dev team."); }
  toggleSuspend(): void { if (this.user) { this.va.setSuspended(this.user.email, !this.user.suspended); this.user = this.va.getUser(this.email); } }
}
