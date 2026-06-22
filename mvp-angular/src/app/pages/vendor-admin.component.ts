import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { DataService } from "../core/data.service";
import { AnalyticsService } from "../core/analytics.service";
import { MultiSelectComponent } from "../components/multiselect.component";
import { VendorAdminService, USER_PERMISSIONS, Company } from "../core/vendor-admin.service";
import { AuthService } from "../core/auth.service";

const ORDER: Record<string, number> = { active: 0, scheduled: 1, expired: 2, none: 3, suspended: 4 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

@Component({
  selector: "app-vendor-admin",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MultiSelectComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>Vendors</h1><p>Companies, subscriptions and users. <span class="muted">Access is governed by the <b>Vendor Management</b> permission in admin.portal.io.</span></p></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="badge-sample">SAMPLE DATA</span><button class="pbtn" (click)="openCompany()">+ Add company</button><button class="pbtn primary" (click)="openUser()">+ Add user</button></div>
    </div>

    <div *ngIf="vs.storeError" class="pcard" style="border:1px solid var(--negative)"><div class="bd" style="color:var(--negative);font-size:12px"><b>Vendor store not connected.</b> The admin UI is running on this browser's local cache only — edits are NOT saved server-side and will NOT apply to vendor logins or permission enforcement. {{ vs.storeError }}</div></div>

    <div class="pcard">
      <div class="hd"><div class="t">Company Subscriptions</div><div class="s">Click a company to expand its logo, users and controls. Click a column to sort.</div></div>
      <div class="bd">
        <table class="ptbl">
          <thead><tr>
            <th class="sort" (click)="sort('name')">Company {{ arrow('name') }}</th>
            <th class="sort" (click)="sort('start')">Start {{ arrow('start') }}</th>
            <th class="sort" (click)="sort('end')">End {{ arrow('end') }}</th>
            <th class="sort" (click)="sort('status')">Status {{ arrow('status') }}</th>
            <th></th>
          </tr></thead>
          <tbody>
            <ng-container *ngFor="let c of sortedCompanies">
              <tr [routerLink]="['/admin/vendors/company', c.name]" style="cursor:pointer">
                <td style="font-weight:600"><span style="color:var(--text-muted);font-size:11px;margin-right:4px;cursor:pointer" (click)="toggle(c.name); $event.stopPropagation()">{{ expanded === c.name ? "▾" : "▸" }}</span>{{ c.name }}</td>
                <td class="muted">{{ c.start | date:'mediumDate' }}</td>
                <td class="muted">{{ c.end | date:'mediumDate' }}</td>
                <td><span class="sub-badge" [ngClass]="vs.companyStatus(c.name)">{{ vs.companyStatus(c.name) }}</span></td>
                <td class="num" style="color:var(--accent);font-weight:600;white-space:nowrap">Manage →</td>
              </tr>
              <tr *ngIf="expanded === c.name">
                <td colspan="5" style="background:var(--surface-2);padding:12px 14px">
                  <table class="ptbl" style="margin:0">
                    <thead><tr><th>User</th><th>Visible brands</th><th>Category access</th><th>Account</th><th></th></tr></thead>
                    <tbody>
                      <tr *ngFor="let u of vs.usersForCompany(c.name)" [routerLink]="['/admin/vendors/user', u.email]" style="cursor:pointer">
                        <td style="font-weight:600">{{ u.name }}<div class="muted" style="font-size:11px">{{ u.email }}</div></td>
                        <td class="muted" style="font-size:11px">{{ u.brands.join(', ') }}</td>
                        <td class="muted" style="font-size:11px">{{ u.parents.length ? u.parents.length + ' categories' : 'All categories' }}</td>
                        <td><span class="sub-badge" [ngClass]="u.suspended ? 'expired' : 'active'">{{ u.suspended ? "Suspended" : "Active" }}</span></td>
                        <td class="num" style="color:var(--accent);font-weight:600">View →</td>
                      </tr>
                      <tr *ngIf="!vs.usersForCompany(c.name).length"><td colspan="5" class="muted">No users yet.</td></tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add / Edit Company modal -->
    <div *ngIf="showCompany" class="dl-modal">
      <div class="vm-card">
        <h3>{{ companyMode === 'edit' ? 'Edit company' : 'Add company' }}</h3>
        <div class="field-lite"><label>Company name</label><input [(ngModel)]="cForm.name" [disabled]="companyMode === 'edit'" placeholder="Acme Audio" /></div>
        <div style="font-size:12px;font-weight:700;margin:6px 0 4px">Default brands <span class="muted" style="font-weight:400">— auto-applied to users added to this company</span></div>
        <input class="minput" style="width:100%;margin-bottom:6px" placeholder="Type to search every brand…" [(ngModel)]="cQuery" />
        <div class="suggest" *ngIf="cSuggest.length"><div class="sg" *ngFor="let b of cSuggest" (click)="addBrand(cForm.brands, b); cQuery=''">{{ b }}</div></div>
        <div class="chips" style="margin:6px 0 12px"><span class="chip on" *ngFor="let b of cForm.brands" (click)="removeBrand(cForm.brands, b)">{{ b }} ✕</span></div>
        <div style="font-size:12px;font-weight:700;margin-bottom:2px">Default permissions</div>
        <div style="margin-bottom:14px"><div class="perm-row" *ngFor="let p of permKeys"><span>{{ p }}</span><label class="switch"><input type="checkbox" [checked]="cForm.perms[p]" (change)="cForm.perms[p]=!cForm.perms[p]" /><span class="track"></span></label></div></div>
        <div style="display:flex;justify-content:flex-end;gap:8px"><button class="pbtn" (click)="showCompany=false">Cancel</button><button class="pbtn primary" (click)="saveCompany()" [disabled]="!cForm.name.trim()">{{ companyMode === 'edit' ? 'Save changes' : 'Add company' }}</button></div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div *ngIf="deleteName" class="dl-modal">
      <div class="vm-card" style="max-width:420px">
        <h3>Delete company?</h3>
        <p style="font-size:13px;color:var(--text-muted)">This permanently removes <b>{{ deleteName }}</b> and its {{ usersCount(deleteName) }} user(s) from the dataset. This can't be undone.</p>
        <div style="display:flex;justify-content:flex-end;gap:8px"><button class="pbtn" (click)="deleteName=null">Cancel</button><button class="pbtn danger-solid" (click)="confirmDelete()">Delete company</button></div>
      </div>
    </div>

    <!-- Add User modal -->
    <div *ngIf="showUser" class="dl-modal">
      <div class="vm-card">
        <h3>Add user</h3>
        <div class="field-lite"><label>First name</label><input [(ngModel)]="uForm.firstName" /></div>
        <div class="field-lite"><label>Last name</label><input [(ngModel)]="uForm.lastName" /></div>
        <div class="field-lite"><label>Email address</label><input type="email" [(ngModel)]="uForm.email" placeholder="user@company.com" />
          <div *ngIf="uForm.email && !validEmail" style="color:var(--negative);font-size:11px;margin-top:2px">Enter a valid email address.</div>
        </div>
        <div class="field-lite"><label>Company (required)</label>
          <select class="minput" [(ngModel)]="uForm.companyName" (change)="onCompany()">
            <option value="">Select a company…</option>
            <option *ngFor="let c of companies" [value]="c.name">{{ c.name }}</option>
          </select>
        </div>
        <div style="font-size:12px;font-weight:700;margin:6px 0 4px">Visible brands <span class="muted" style="font-weight:400">— every brand in the catalog; type to search</span></div>
        <input class="minput" style="width:100%;margin-bottom:6px" placeholder="Type a brand…" [(ngModel)]="uQuery" />
        <div class="suggest" *ngIf="uSuggest.length"><div class="sg" *ngFor="let b of uSuggest" (click)="addBrand(uForm.brands, b); uQuery=''">{{ b }}</div></div>
        <div class="chips" style="margin:6px 0 12px"><span class="chip on" *ngFor="let b of uForm.brands" (click)="removeBrand(uForm.brands, b)">{{ b }} ✕</span></div>
        <div style="font-size:12px;font-weight:700;margin:6px 0 4px">Restrict access <span class="muted" style="font-weight:400">— leave empty for full access to the master filter set</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <app-multiselect label="Parent categories" allLabel="All categories" [options]="parentOptions" [selected]="uForm.parents" (selectedChange)="uForm.parents=$event"></app-multiselect>
          <app-multiselect label="Sub-categories" allLabel="All sub-categories" [options]="subOptions(uForm.parents)" [selected]="uForm.subs" (selectedChange)="uForm.subs=$event"></app-multiselect>
          <app-multiselect label="Buying groups" allLabel="All groups" [search]="false" [options]="buyingGroupOptions" [selected]="uForm.buyingGroups" (selectedChange)="uForm.buyingGroups=$event"></app-multiselect>
          <app-multiselect label="States" allLabel="All states" [options]="stateOptions" [selected]="uForm.states" (selectedChange)="uForm.states=$event"></app-multiselect>
        </div>
        <div style="font-size:12px;font-weight:700;margin-bottom:2px">Permissions</div>
        <div style="margin-bottom:8px"><div class="perm-row" *ngFor="let p of permKeys"><span>{{ p }}</span><label class="switch"><input type="checkbox" [checked]="uForm.perms[p]" (change)="uForm.perms[p]=!uForm.perms[p]" /><span class="track"></span></label></div></div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">A confirmation email is sent so they can verify and set a password (account-setup flow flagged for the dev team).</div>
        <div style="display:flex;justify-content:flex-end;gap:8px"><button class="pbtn" (click)="showUser=false">Cancel</button><button class="pbtn primary" (click)="saveUser()" [disabled]="!validEmail || !uForm.companyName">Add user</button></div>
      </div>
    </div>
  `,
})
export class VendorAdminComponent implements OnInit {
  vs = inject(VendorAdminService);
  private data = inject(DataService);
  private an = inject(AnalyticsService);
  private auth = inject(AuthService);

  permKeys = USER_PERMISSIONS;
  catalog = this.an.brandList;
  parentOptions = this.an.parentCats;
  buyingGroupOptions = this.an.buyingGroups;
  stateOptions = this.an.states;
  sortKey = "name";
  sortDir = 1;
  expanded: string | null = null;

  showCompany = false;
  companyMode: "add" | "edit" = "add";
  cForm = this.blankCompany();
  cQuery = "";
  deleteName: string | null = null;
  showUser = false;
  uForm = this.blankUser();
  uQuery = "";

  async ngOnInit(): Promise<void> { await this.vs.refresh(); }

  get companies(): Company[] { return this.vs.listCompanies(); }
  get sortedCompanies(): Company[] {
    const k = this.sortKey, d = this.sortDir;
    return [...this.companies].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (k === "name") { av = a.name; bv = b.name; }
      else if (k === "start") { av = a.start; bv = b.start; }
      else if (k === "end") { av = a.end; bv = b.end; }
      else { av = ORDER[this.vs.companyStatus(a.name)] ?? 9; bv = ORDER[this.vs.companyStatus(b.name)] ?? 9; }
      return av < bv ? -d : av > bv ? d : 0;
    });
  }
  get cSuggest(): string[] { const q = this.cQuery.toLowerCase().trim(); return q ? this.catalog.filter((b) => b.toLowerCase().startsWith(q) && !this.cForm.brands.includes(b)).slice(0, 6) : []; }
  get uSuggest(): string[] { const q = this.uQuery.toLowerCase().trim(); return q ? this.catalog.filter((b) => b.toLowerCase().startsWith(q) && !this.uForm.brands.includes(b)).slice(0, 6) : []; }
  get validEmail(): boolean { return EMAIL_RE.test(this.uForm.email.trim()); }
  subOptions(parents: string[]): string[] { return parents.length ? this.an.subsForParents(parents) : []; }

  sort(k: string): void { if (this.sortKey === k) this.sortDir *= -1; else { this.sortKey = k; this.sortDir = 1; } }
  arrow(k: string): string { return this.sortKey === k ? (this.sortDir > 0 ? "▲" : "▼") : ""; }
  toggle(name: string): void { this.expanded = this.expanded === name ? null : name; }
  onStart(name: string, ev: Event): void { const c = this.vs.getCompany(name); this.vs.setCompanySub(name, (ev.target as HTMLInputElement).value, c?.end || (ev.target as HTMLInputElement).value); }
  onEnd(name: string, ev: Event): void { const c = this.vs.getCompany(name); this.vs.setCompanySub(name, c?.start || (ev.target as HTMLInputElement).value, (ev.target as HTMLInputElement).value); }

  private logoKey(name: string): string { return this.data.listVendors().find((v) => v.name === name)?.id || name; }
  logo(name: string): string | undefined { return this.vs.getLogo(this.logoKey(name)); }
  onLogo(name: string, ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.vs.setLogo(this.logoKey(name), reader.result as string);
    reader.readAsDataURL(file);
  }

  addBrand(arr: string[], b: string): void { if (!arr.includes(b)) arr.push(b); }
  removeBrand(arr: string[], b: string): void { const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1); }

  private blankCompany() { return { name: "", brands: [] as string[], perms: Object.fromEntries(USER_PERMISSIONS.map((p) => [p, true])) as Record<string, boolean> }; }
  openCompany(): void { this.companyMode = "add"; this.cForm = this.blankCompany(); this.cQuery = ""; this.showCompany = true; }
  openEditCompany(c: Company): void { this.companyMode = "edit"; this.cForm = { name: c.name, brands: [...c.brands], perms: { ...c.perms } }; this.cQuery = ""; this.showCompany = true; }
  saveCompany(): void {
    if (!this.cForm.name.trim()) return;
    if (this.companyMode === "edit") this.vs.updateCompany(this.cForm.name, { brands: this.cForm.brands, perms: this.cForm.perms });
    else this.vs.addCompany(this.cForm);
    this.showCompany = false;
  }
  askDelete(name: string): void { this.deleteName = name; }
  usersCount(name: string | null): number { return name ? this.vs.usersForCompany(name).length : 0; }
  confirmDelete(): void { if (this.deleteName) { if (this.expanded === this.deleteName) this.expanded = null; this.vs.deleteCompany(this.deleteName); this.deleteName = null; } }

  private blankUser() { return { firstName: "", lastName: "", email: "", companyName: "", brands: [] as string[], parents: [] as string[], subs: [] as string[], buyingGroups: [] as string[], states: [] as string[], perms: Object.fromEntries(USER_PERMISSIONS.map((p) => [p, true])) as Record<string, boolean> }; }
  openUser(): void { this.uForm = this.blankUser(); this.uQuery = ""; this.showUser = true; }
  onCompany(): void { const c = this.vs.getCompany(this.uForm.companyName); if (c) { this.uForm.brands = [...c.brands]; this.uForm.perms = { ...c.perms }; this.uForm.parents = [...(c.parents || [])]; this.uForm.subs = [...(c.subs || [])]; this.uForm.states = [...(c.states || [])]; } }
  saveUser(): void { if (!this.validEmail || !this.uForm.companyName) return; this.vs.addUser({ ...this.uForm, createdBy: this.auth.session()?.email || "Admin" }); this.showUser = false; this.expanded = this.uForm.companyName; }
}
