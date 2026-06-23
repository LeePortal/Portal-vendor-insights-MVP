import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { VendorAdminService, USER_PERMISSIONS, Company, VUser } from "../core/vendor-admin.service";
import { DataService } from "../core/data.service";
import { AnalyticsService } from "../core/analytics.service";
import { ActivityService } from "../core/activity.service";
import { MultiSelectComponent } from "../components/multiselect.component";

@Component({
  selector: "app-vendor-landing",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MultiSelectComponent],
  template: `
    <a routerLink="/admin/vendors" class="muted" style="font-size:12px">&larr; Back to Vendors</a>
    <div *ngIf="!company" class="pcard" style="margin-top:12px"><div class="bd muted">Company not found.</div></div>

    <ng-container *ngIf="company as c">
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:10px">
        <div>
          <h1>{{ c.name }}</h1>
          <p>{{ users.length }} user(s) · <span class="sub-badge" [ngClass]="status">{{ status }}</span></p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="pbtn" (click)="openEdit()">Edit company</button>
          <button class="pbtn danger" (click)="askDelete = true">Delete</button>
        </div>
      </div>

      <div class="grid c2" style="align-items:start">
        <div class="pcard">
          <div class="hd"><div class="t">Subscription &amp; branding</div><div class="s">Access window, logo, and default brands</div></div>
          <div class="bd">
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">
              <div class="field-lite" style="margin:0"><label>Start</label><input class="minput" type="date" [value]="c.start" (change)="onStart($event)" /></div>
              <div class="field-lite" style="margin:0"><label>End</label><input class="minput" type="date" [value]="c.end" (change)="onEnd($event)" /></div>
              <div class="field-lite" style="margin:0"><label>Status</label><div><span class="sub-badge" [ngClass]="status">{{ status }}</span></div></div>
            </div>

            <div style="border-top:1px solid var(--border);margin:14px 0"></div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Company logo <span class="muted">— shown on this company's dashboards &amp; reports</span></div>
            <div style="display:flex;gap:14px;align-items:center">
              <div class="logo-preview"><img *ngIf="logoUrl() as l" [src]="l" [alt]="c.name" /><span *ngIf="!logoUrl()">{{ c.name.charAt(0) }}</span></div>
              <label class="pbtn" style="cursor:pointer;font-size:12px">{{ logoUrl() ? "Replace logo" : "Upload logo" }}<input type="file" accept="image/*" (change)="onLogo($event)" hidden /></label>
            </div>

            <div style="border-top:1px solid var(--border);margin:14px 0"></div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Default brands <span class="muted">— auto-applied to new users; use “Edit company” to change</span></div>
            <div class="chips"><span class="chip on" *ngFor="let b of c.brands">{{ b }}</span><span *ngIf="!c.brands.length" class="muted" style="font-size:12px">None set.</span></div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:10px">Default category access: <b>{{ c.parents.length ? c.parents.join(', ') : 'All categories' }}</b><span *ngIf="c.subs.length"> · subs: {{ c.subs.join(', ') }}</span><span *ngIf="c.states.length"> · states: {{ c.states.join(', ') }}</span></div>
          </div>
        </div>

        <div class="pcard">
          <div class="hd"><div class="t">Users</div><div class="s">Click a name to manage that user</div></div>
          <div class="bd" style="max-height:460px;overflow:auto">
            <table class="ptbl">
              <thead><tr><th>User</th><th>Created by</th><th>Created</th><th>Last login</th><th class="num">Logins</th></tr></thead>
              <tbody>
                <tr *ngFor="let u of users" [routerLink]="['/admin/vendors/user', u.email]" style="cursor:pointer">
                  <td style="font-weight:600">{{ u.name }}<span *ngIf="u.suspended" class="sub-badge expired" style="margin-left:6px">Suspended</span><div class="muted" style="font-size:11px;font-weight:400">{{ u.email }}</div></td>
                  <td class="muted" style="font-size:12px">{{ u.createdBy || "—" }}</td>
                  <td class="muted" style="font-size:12px">{{ u.createdAt ? (u.createdAt | date:'mediumDate') : "—" }}</td>
                  <td class="muted" style="font-size:12px">{{ logins[u.email] && logins[u.email].last ? (logins[u.email].last | date:'mediumDate') : "Never" }}</td>
                  <td class="num">{{ logins[u.email] ? logins[u.email].count : 0 }}</td>
                </tr>
                <tr *ngIf="!users.length"><td colspan="5" class="muted">No users yet.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div *ngIf="showEdit" class="dl-modal">
        <div class="vm-card">
          <h3>Edit company</h3>
          <div style="font-size:12px;font-weight:700;margin:6px 0 4px">Default brands</div>
          <input class="minput" style="width:100%;margin-bottom:6px" placeholder="Type to search brands…" [(ngModel)]="cQuery" />
          <div class="suggest" *ngIf="cSuggest.length"><div class="sg" *ngFor="let b of cSuggest" (click)="addBrand(b); cQuery=''">{{ b }}</div></div>
          <div class="chips" style="margin:6px 0 12px"><span class="chip on" *ngFor="let b of cForm.brands" (click)="removeBrand(b)">{{ b }} ✕</span></div>
          <div style="font-size:12px;font-weight:700;margin:6px 0 4px">Default data access <span class="muted" style="font-weight:400">— inherited by new users; empty = all</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
            <app-multiselect label="Parent categories" allLabel="All categories" [options]="parentOptions" [selected]="cForm.parents" (selectedChange)="cForm.parents=$event"></app-multiselect>
            <app-multiselect label="Sub-categories" allLabel="All sub-categories" [options]="subOptions(cForm.parents)" [selected]="cForm.subs" (selectedChange)="cForm.subs=$event"></app-multiselect>
            <app-multiselect label="States" allLabel="All states" [options]="stateOptions" [labels]="stateLabels" [selected]="cForm.states" (selectedChange)="cForm.states=$event"></app-multiselect>
          </div>
          <div style="font-size:12px;font-weight:700;margin-bottom:2px">Default permissions</div>
          <div style="margin-bottom:14px"><div class="perm-row" *ngFor="let p of permKeys"><span>{{ p }}</span><label class="switch"><input type="checkbox" [checked]="cForm.perms[p]" (change)="cForm.perms[p]=!cForm.perms[p]" /><span class="track"></span></label></div></div>
          <div style="display:flex;justify-content:flex-end;gap:8px"><button class="pbtn" (click)="showEdit=false">Cancel</button><button class="pbtn primary" (click)="saveEdit()">Save changes</button></div>
        </div>
      </div>

      <div *ngIf="askDelete" class="dl-modal">
        <div class="vm-card" style="max-width:420px">
          <h3>Delete company?</h3>
          <p style="font-size:13px;color:var(--text-muted)">This permanently removes <b>{{ c.name }}</b> and its {{ users.length }} user(s). This can't be undone.</p>
          <div style="display:flex;justify-content:flex-end;gap:8px"><button class="pbtn" (click)="askDelete=false">Cancel</button><button class="pbtn danger-solid" (click)="confirmDelete()">Delete company</button></div>
        </div>
      </div>
    </ng-container>
  `,
})
export class VendorLandingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private vs = inject(VendorAdminService);
  private data = inject(DataService);
  private an = inject(AnalyticsService);
  private activity = inject(ActivityService);

  permKeys = USER_PERMISSIONS;
  get catalog(): string[] { return this.an.brandList; }
  get parentOptions(): string[] { return this.an.parentCats; }
  get stateOptions(): string[] { return this.an.states; }
  get stateLabels(): Record<string, string> { return this.an.stateLabels; }
  company: Company | undefined;
  users: VUser[] = [];
  logins: Record<string, { count: number; last: number }> = {};

  showEdit = false;
  askDelete = false;
  cForm: { brands: string[]; perms: Record<string, boolean>; parents: string[]; subs: string[]; states: string[] } = { brands: [], perms: {}, parents: [], subs: [], states: [] };
  cQuery = "";

  async ngOnInit(): Promise<void> {
    this.an.ready();
    await this.vs.refresh();
    const name = this.route.snapshot.paramMap.get("name") || "";
    this.company = this.vs.getCompany(name);
    if (this.company) {
      this.users = this.vs.usersForCompany(this.company.name);
      for (const u of this.users) this.logins[u.email] = this.activity.loginInfo(u.email);
    }
  }

  get status(): string { return this.company ? this.vs.companyStatus(this.company.name) : "none"; }
  get cSuggest(): string[] { const q = this.cQuery.toLowerCase().trim(); return q ? this.catalog.filter((b) => b.toLowerCase().startsWith(q) && !this.cForm.brands.includes(b)).slice(0, 6) : []; }
  subOptions(parents: string[]): string[] { return parents.length ? this.an.subsForParents(parents) : []; }

  onStart(ev: Event): void { if (this.company) this.vs.setCompanySub(this.company.name, (ev.target as HTMLInputElement).value, this.company.end); }
  onEnd(ev: Event): void { if (this.company) this.vs.setCompanySub(this.company.name, this.company.start, (ev.target as HTMLInputElement).value); }

  private logoKey(): string { return this.data.listVendors().find((v) => v.name === this.company!.name)?.id || this.company!.name; }
  logoUrl(): string | undefined { return this.company ? this.vs.getLogo(this.logoKey()) : undefined; }
  onLogo(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file || !this.company) return;
    const reader = new FileReader();
    reader.onload = () => this.vs.setLogo(this.logoKey(), reader.result as string);
    reader.readAsDataURL(file);
  }

  openEdit(): void { if (this.company) { this.cForm = { brands: [...this.company.brands], perms: { ...this.company.perms }, parents: [...(this.company.parents || [])], subs: [...(this.company.subs || [])], states: [...(this.company.states || [])] }; this.cQuery = ""; this.showEdit = true; } }
  addBrand(b: string): void { if (!this.cForm.brands.includes(b)) this.cForm.brands.push(b); }
  removeBrand(b: string): void { const i = this.cForm.brands.indexOf(b); if (i >= 0) this.cForm.brands.splice(i, 1); }
  saveEdit(): void { if (this.company) { this.vs.updateCompany(this.company.name, { brands: this.cForm.brands, perms: this.cForm.perms, parents: this.cForm.parents, subs: this.cForm.subs, states: this.cForm.states }); this.company = this.vs.getCompany(this.company.name); this.showEdit = false; } }
  confirmDelete(): void { if (this.company) { const n = this.company.name; this.vs.deleteCompany(n); this.router.navigate(["/admin/vendors"]); } }
}
