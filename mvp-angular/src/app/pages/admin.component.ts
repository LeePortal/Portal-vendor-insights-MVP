import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivityService, VendorEngagement } from "../core/activity.service";
import { PremiumPlacementSource, PpAdvertiser, PpCampaign } from "../core/premium-placement.source";
import { VendorAdminService } from "../core/vendor-admin.service";
import { ActivityEvent } from "../core/models";
import { fmtDateTime, fmtNumber, relativeTime } from "../core/format";
import { HBarsComponent, TrendChartComponent } from "../components/charts.component";
import { RouterLink, ActivatedRoute } from "@angular/router";

interface UserRow { name: string; email: string; logins: number; views: number; minutes: number; reportsPulled: number; csvExports: number; lastActive: number; }

@Component({
  selector: "app-admin",
  standalone: true,
  imports: [CommonModule, RouterLink, TrendChartComponent, HBarsComponent],
  template: `
    <div class="page-head">
      <h1>Admin — Vendor Engagement</h1>
      <p>How brands and manufacturers use Market Insights and Premium Placement. First-party activity tracking (modeled on Periscope Usage Data).</p>
    </div>

    <div class="tgl" style="margin-bottom:16px">
      <button [class.on]="prod === 'mi'" (click)="prod = 'mi'">Market Insights</button>
      <button [class.on]="prod === 'pp'" (click)="showPp()">Premium Placement</button>
    </div>

    <div *ngIf="prod === 'mi'">
    <div class="grid c4" style="margin-bottom:16px">
      <div class="pcard kpi"><div class="label">Total logins</div><div class="value">{{ n(summary.totalLogins) }}</div><div class="delta flat">last 30 days</div></div>
      <div class="pcard kpi"><div class="label">Active brands</div><div class="value">{{ n(summary.activeVendors) }}</div><div class="delta flat">signed in ≥ 1 time</div></div>
      <div class="pcard kpi"><div class="label">Reports pulled</div><div class="value">{{ n(summary.reportsPulled) }}</div><div class="delta flat">on-demand + scheduled</div></div>
      <div class="pcard kpi"><div class="label">CSV extracts</div><div class="value">{{ n(summary.csvExports) }}</div><div class="delta flat">data downloads</div></div>
    </div>

    <div class="grid c2">
      <div class="pcard span2">
        <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><div class="t">Daily logins</div><div class="s">Logins per day · {{ rangeLabel }}</div></div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div class="tgl">
              <button *ngFor="let r of ranges" [class.on]="rangeKey === r.k" (click)="setRange(r.k)">{{ r.l }}</button>
            </div>
            <input *ngIf="rangeKey === 'custom'" class="minput" type="date" [value]="cStart" (change)="onCustom($event, 's')" />
            <input *ngIf="rangeKey === 'custom'" class="minput" type="date" [value]="cEnd" (change)="onCustom($event, 'e')" />
          </div>
        </div>
        <div class="bd"><app-trend [points]="loginPoints" [gridlines]="true"></app-trend></div>
      </div>

      <div class="pcard"><div class="hd"><div class="t">Most-viewed dashboards</div><div class="s">By number of views</div></div>
        <div class="bd"><app-hbars [rows]="topDashRows" [money]="false"></app-hbars></div>
      </div>

      <div class="pcard"><div class="hd"><div class="t">Recent activity</div><div class="s">Live event feed</div></div>
        <div class="bd">
          <div *ngFor="let e of recent" style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:4px 0">
            <span style="display:flex;gap:8px;align-items:center;min-width:0">
              <span class="tag" [ngClass]="e.type">{{ label(e.type) }}</span>
              <b>{{ e.vendorName }}</b>
              <span class="muted" *ngIf="e.target" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">· {{ e.target }}</span>
            </span>
            <span class="muted" [title]="dt(e.ts)" style="flex-shrink:0">{{ rel(e.ts) }}</span>
          </div>
        </div>
      </div>

      <div class="pcard span2"><div class="hd"><div class="t">Brand engagement</div><div class="s">Click a brand to expand its users</div></div>
        <div class="bd">
          <table class="ptbl">
            <thead><tr><th>Brand</th><th class="num">Logins</th><th class="num">Views</th><th class="num">Minutes</th><th class="num">Reports</th><th class="num">CSVs</th><th class="num">Last active</th></tr></thead>
            <tbody>
              <ng-container *ngFor="let v of engagement">
                <tr (click)="toggle(v.vendorId)" style="cursor:pointer">
                  <td style="font-weight:600"><span style="color:var(--text-muted);font-size:11px;margin-right:4px">{{ expanded === v.vendorId ? "▾" : "▸" }}</span>{{ v.vendorName }}</td>
                  <td class="num">{{ n(v.logins) }}</td>
                  <td class="num">{{ n(v.views) }}</td>
                  <td class="num">{{ n(v.minutes) }}</td>
                  <td class="num">{{ n(v.reportsPulled) }}</td>
                  <td class="num">{{ n(v.csvExports) }}</td>
                  <td class="num muted">{{ v.lastActive ? rel(v.lastActive) : "—" }}</td>
                </tr>
                <tr *ngIf="expanded === v.vendorId">
                  <td colspan="7" style="background:var(--surface-2);padding:0">
                    <table class="ptbl" style="margin:0">
                      <thead><tr><th style="padding-left:30px">User</th><th class="num">Logins</th><th class="num">Views</th><th class="num">Minutes</th><th class="num">Reports</th><th class="num">CSVs</th><th class="num">Last active</th></tr></thead>
                      <tbody>
                        <tr *ngFor="let u of usersFor(v.vendorName)" [routerLink]="['/admin/vendors/user', u.email]" style="cursor:pointer">
                          <td style="padding-left:30px">{{ u.name }}</td>
                          <td class="num">{{ n(u.logins) }}</td>
                          <td class="num">{{ n(u.views) }}</td>
                          <td class="num">{{ n(u.minutes) }}</td>
                          <td class="num">{{ n(u.reportsPulled) }}</td>
                          <td class="num">{{ n(u.csvExports) }}</td>
                          <td class="num muted">{{ u.lastActive ? rel(u.lastActive) : "—" }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>

    <div *ngIf="prod === 'pp'">
      <div class="filterbar" style="align-items:flex-end;margin-bottom:16px">
        <div class="filt"><label>Period</label>
          <div class="tgl">
            <button [class.on]="ppPeriod === 'mtd'" (click)="setPpPeriod('mtd')">MTD</button>
            <button [class.on]="ppPeriod === 'lastmonth'" (click)="setPpPeriod('lastmonth')">Last month</button>
            <button [class.on]="ppPeriod === 'custom'" (click)="setPpPeriod('custom')">Custom</button>
          </div>
        </div>
        <div class="filt" *ngIf="ppPeriod === 'custom'"><label>From</label><input class="minput" type="date" [value]="ppFrom" (change)="onPpCustom($event, 's')" /></div>
        <div class="filt" *ngIf="ppPeriod === 'custom'"><label>To</label><input class="minput" type="date" [value]="ppTo" (change)="onPpCustom($event, 'e')" /></div>
        <div class="filt"><label>Company</label>
          <select class="minput" (change)="onPpCompany($any($event.target).value)">
            <option value="">All companies</option>
            <option *ngFor="let a of ppAdvertisers" [value]="a.id" [selected]="a.id === ppCompany">{{ a.name }}</option>
          </select>
        </div>
        <div class="filt"><label>Status</label>
          <div class="tgl">
            <button [class.on]="ppStatus === 'all'" (click)="setPpStatus('all')">All</button>
            <button [class.on]="ppStatus === 'active'" (click)="setPpStatus('active')">Active</button>
            <button [class.on]="ppStatus === 'expired'" (click)="setPpStatus('expired')">Expired</button>
          </div>
        </div>
      </div>

      <div *ngIf="!ppConfigured" class="pcard" style="border:1px solid #ff5000;background:var(--accent-soft);margin-bottom:16px">
        <div class="bd" style="font-size:13px;color:#ff5000">AdButler isn't connected yet. Set <b>ADBUTLER_API_KEY</b> in the environment and this page will populate with live Spotlight impressions, clicks and advertisers.</div>
      </div>

      <div class="dash-wrap">
        <div *ngIf="ppLoading && ppFirstLoad">
          <div class="grid c4" style="margin-bottom:16px">
            <div class="pcard" *ngFor="let s of [1,2,3]"><div class="sk" style="height:12px;width:55%;margin-bottom:14px"></div><div class="sk" style="height:24px;width:75%"></div></div>
          </div>
          <div class="pcard"><div class="sk" style="height:14px;width:35%;margin-bottom:18px"></div><div class="sk" style="height:14px;margin-bottom:12px" *ngFor="let s of [1,2,3,4,5]"></div></div>
        </div>
        <ng-container *ngIf="!(ppLoading && ppFirstLoad)">
          <div *ngIf="ppLoading" class="upd-pill"><span class="upd-dot"></span> Updating…</div>
          <div *ngIf="ppLoading" class="upd-overlay"><div class="upd-spinner"></div></div>
          <div class="dash-body" [class.updating]="ppLoading">

      <div class="grid c4" style="margin-bottom:16px">
        <div class="pcard kpi"><div class="label">Ad impressions</div><div class="value">{{ ppConfigured ? n(ppTotalImpressions) : "—" }}</div><div class="delta flat">Spotlight (live) · Featured pending</div></div>
        <div class="pcard kpi"><div class="label">Clicks</div><div class="value">{{ ppConfigured ? n(ppTotalClicks) : "—" }}</div><div class="delta flat">Spotlight (live) · Featured pending</div></div>
        <div class="pcard kpi"><div class="label">Active advertisers</div><div class="value">{{ ppConfigured ? n(activeAdvertisers) : "—" }}</div><div class="delta flat">from AdButler · not filtered</div></div>
      </div>

      <!-- TODO(premium-placement): Featured Products impressions/clicks fold into ppFeaturedImpressions/ppFeaturedClicks
           once their source exists; today they are 0. Spotlight is live from AdButler via /api/adbutler. -->
      <div class="pcard" *ngIf="ppConfigured">
        <div class="hd"><div class="t">Campaigns by company</div><div class="s">Click a company to see its campaigns · {{ ppCompanyGroups.length }} {{ ppStatus === 'active' ? 'active' : ppStatus === 'expired' ? 'expired' : '' }} compan{{ ppCompanyGroups.length === 1 ? 'y' : 'ies' }} · impressions &amp; clicks for the selected period</div></div>
        <div class="bd" style="max-height:520px;overflow:auto">
          <div *ngIf="!ppLoading && !ppCompanyGroups.length" class="muted" style="font-size:13px">No companies match the current filters.</div>
          <table class="ptbl" *ngIf="!ppLoading && ppCompanyGroups.length">
            <thead><tr><th>Company</th><th class="num">Campaigns</th><th class="num">Impressions</th><th class="num">Clicks</th></tr></thead>
            <tbody>
              <ng-container *ngFor="let g of ppCompanyGroups">
                <tr (click)="togglePpCompany(g.id)" style="cursor:pointer">
                  <td style="font-weight:600"><span style="color:var(--text-muted);font-size:11px;margin-right:4px">{{ ppExpanded === g.id ? "▾" : "▸" }}</span>{{ g.name }}</td>
                  <td class="num">{{ g.adItems }}</td>
                  <td class="num">{{ n(g.impressions) }}</td>
                  <td class="num">{{ n(g.clicks) }}</td>
                </tr>
                <tr *ngIf="ppExpanded === g.id">
                  <td colspan="4" style="background:var(--surface-2);padding:0">
                    <table class="ptbl" style="margin:0">
                      <thead><tr><th style="padding-left:30px">Campaign</th><th>Status</th><th class="num">Impressions</th><th class="num">Clicks</th></tr></thead>
                      <tbody>
                        <tr *ngFor="let c of g.campaigns" [routerLink]="['/admin/premium/campaign', c.id]" [queryParams]="{ from: ppRange().from, to: ppRange().to }" style="cursor:pointer">
                          <td style="padding-left:30px;font-weight:600">{{ c.name }}</td>
                          <td><span class="sub-badge" [ngClass]="c.active ? 'active' : 'expired'">{{ c.active ? "Active" : "Expired" }}</span></td>
                          <td class="num">{{ n(c.impressions) }}</td>
                          <td class="num">{{ n(c.clicks) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </div>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class AdminComponent {
  private activity = inject(ActivityService);
  private va = inject(VendorAdminService);
  private pp = inject(PremiumPlacementSource);
  private route = inject(ActivatedRoute);

  summary = this.activity.getSummary(30);
  topDashRows = this.activity.getTopDashboards(30).map((d) => ({ label: d.name, value: d.views }));
  engagement: VendorEngagement[] = this.activity.getVendorEngagement(30);
  recent: ActivityEvent[] = this.activity.getRecentEvents(14);
  loginPoints: { label: string; value: number }[] = [];

  ranges = [{ k: "all", l: "All time" }, { k: "ytd", l: "YTD" }, { k: "mtd", l: "MTD" }, { k: "wtd", l: "WTD" }, { k: "custom", l: "Custom" }];
  rangeKey = "all";
  prod: "mi" | "pp" = "mi";  // which product line's activity is shown
  // Premium Placement (Spotlight live from AdButler via /api/adbutler; Featured Products = placeholder 0 for now)
  ppPeriod: "mtd" | "lastmonth" | "custom" = "mtd";
  ppFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  ppTo = new Date().toISOString().slice(0, 10);
  ppCompany = "";
  ppStatus: "all" | "active" | "expired" = "all";
  ppExpanded: string | null = null;  // expanded company in the campaigns accordion
  ppAdvertisers: PpAdvertiser[] = [];
  ppAllCampaigns: PpCampaign[] = [];
  ppConfigured = true;
  ppLoading = false;
  ppFirstLoad = true;
  ppFeaturedImpressions = 0; ppFeaturedClicks = 0; // TODO: Featured Products — fold in once its data source exists
  private ppLoaded = false;
  cStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  cEnd = new Date().toISOString().slice(0, 10);
  expanded: string | null = null;

  n = fmtNumber;
  rel = relativeTime;
  dt = fmtDateTime;

  constructor() {
    this.recompute();
    if (this.route.snapshot.queryParamMap.get("view") === "pp") this.showPp();
  }

  get rangeLabel(): string {
    return (this.ranges.find((r) => r.k === this.rangeKey) || this.ranges[0]).l;
  }
  get rangeDays(): number {
    const now = new Date();
    const DAY = 86400000;
    if (this.rangeKey === "ytd") return Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / DAY) + 1;
    if (this.rangeKey === "mtd") return now.getDate();
    if (this.rangeKey === "wtd") return now.getDay() + 1;
    if (this.rangeKey === "custom") return Math.max(1, Math.ceil((now.getTime() - new Date(this.cStart).getTime()) / DAY));
    return 60;
  }
  setRange(k: string): void { this.rangeKey = k; this.recompute(); }
  onCustom(ev: Event, which: "s" | "e"): void {
    const v = (ev.target as HTMLInputElement).value;
    if (which === "s") this.cStart = v; else this.cEnd = v;
    this.recompute();
  }
  private recompute(): void {
    this.loginPoints = this.activity.getActivityByDay(this.rangeDays).map((d) => ({ label: d.date.slice(5), value: d.logins }));
  }

  toggle(vendorId: string): void { this.expanded = this.expanded === vendorId ? null : vendorId; }
  usersFor(name: string): UserRow[] {
    const us = this.va.usersForBrandName(name);
    const bd = this.activity.userBreakdown(us.map((u) => u.email), this.rangeDays);
    return us.map((u, i) => ({ name: u.name, ...bd[i] }));
  }
  label(t: string): string {
    return { login: "Login", dashboard_view: "Viewed", report_pull: "Report", csv_export: "CSV" }[t] || t;
  }

  // ---- Premium Placement (admin view) ----
  /** Campaigns after the Company + Status filters (Period is applied when the metrics are fetched). */
  get filteredCampaigns(): PpCampaign[] {
    return this.ppAllCampaigns.filter((c) =>
      (!this.ppCompany || c.advertiserId === this.ppCompany) &&
      (this.ppStatus === "all" || (this.ppStatus === "active" ? c.active : !c.active)));
  }
  get ppTotalImpressions(): number { return this.filteredCampaigns.reduce((s, c) => s + c.impressions, 0) + this.ppFeaturedImpressions; }
  get ppTotalClicks(): number { return this.filteredCampaigns.reduce((s, c) => s + c.clicks, 0) + this.ppFeaturedClicks; }
  /** Distinct companies with at least one active (running) campaign — from AdButler, NOT subject to the filters. */
  get activeAdvertisers(): number { return new Set(this.ppAllCampaigns.filter((c) => c.active).map((c) => c.advertiserId)).size; }
  get ppCompanyName(): string { const a = this.ppAdvertisers.find((x) => x.id === this.ppCompany); return a ? a.name : ""; }

  showPp(): void { this.prod = "pp"; if (!this.ppLoaded) { this.ppLoaded = true; this.loadPpAdvertisers(); this.refreshPp(); } }
  setPpPeriod(p: "mtd" | "lastmonth" | "custom"): void { this.ppPeriod = p; this.refreshPp(); }
  onPpCustom(ev: Event, which: "s" | "e"): void { const v = (ev.target as HTMLInputElement).value; if (which === "s") this.ppFrom = v; else this.ppTo = v; if (this.ppPeriod === "custom") this.refreshPp(); }
  onPpCompany(id: string): void { this.ppCompany = id || ""; this.ppExpanded = this.ppCompany || null; }  // filter + auto-expand the picked company
  setPpStatus(s: "all" | "active" | "expired"): void { this.ppStatus = s; }  // client-side filter, no refetch
  togglePpCompany(id: string): void { this.ppExpanded = this.ppExpanded === id ? null : id; }
  /** Filtered campaigns grouped by company, for the click-to-expand list (campaigns hidden until a company is opened). */
  get ppCompanyGroups(): { id: string; name: string; campaigns: PpCampaign[]; impressions: number; clicks: number; adItems: number }[] {
    const m = new Map<string, { id: string; name: string; campaigns: PpCampaign[]; impressions: number; clicks: number; adItems: number }>();
    for (const c of this.filteredCampaigns) {
      let g = m.get(c.advertiserId);
      if (!g) { g = { id: c.advertiserId, name: c.advertiserName || "—", campaigns: [], impressions: 0, clicks: 0, adItems: 0 }; m.set(c.advertiserId, g); }
      g.campaigns.push(c); g.impressions += c.impressions; g.clicks += c.clicks; g.adItems += c.adItems;
    }
    return [...m.values()].sort((a, b) => b.impressions - a.impressions);
  }

  ppRange(): { from: string; to: string } {
    const now = new Date(); const ymd = (d: Date) => d.toISOString().slice(0, 10);
    if (this.ppPeriod === "mtd") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    if (this.ppPeriod === "lastmonth") return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    return { from: this.ppFrom, to: this.ppTo };
  }
  private async loadPpAdvertisers(): Promise<void> {
    const r = await this.pp.advertisers();
    this.ppConfigured = r.configured; this.ppAdvertisers = r.advertisers;
  }
  async refreshPp(): Promise<void> {
    const { from, to } = this.ppRange();
    this.ppLoading = true;
    try {
      const c = await this.pp.campaigns(from, to);
      this.ppConfigured = c.configured;
      this.ppAllCampaigns = c.campaigns;
    } finally { this.ppLoading = false; this.ppFirstLoad = false; }
  }
}
