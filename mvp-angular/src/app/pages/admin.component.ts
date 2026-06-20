import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivityService, VendorEngagement } from "../core/activity.service";
import { VendorAdminService } from "../core/vendor-admin.service";
import { ActivityEvent } from "../core/models";
import { fmtDateTime, fmtNumber, relativeTime } from "../core/format";
import { HBarsComponent, TrendChartComponent } from "../components/charts.component";
import { RouterLink } from "@angular/router";

interface UserRow { name: string; email: string; logins: number; views: number; minutes: number; reportsPulled: number; csvExports: number; lastActive: number; }

@Component({
  selector: "app-admin",
  standalone: true,
  imports: [CommonModule, RouterLink, TrendChartComponent, HBarsComponent],
  template: `
    <div class="page-head">
      <h1>Admin — Vendor Engagement</h1>
      <p>How brands and manufacturers use Market Insights. First-party activity tracking (modeled on Periscope Usage Data).</p>
    </div>

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
  `,
})
export class AdminComponent {
  private activity = inject(ActivityService);
  private va = inject(VendorAdminService);

  summary = this.activity.getSummary(30);
  topDashRows = this.activity.getTopDashboards(30).map((d) => ({ label: d.name, value: d.views }));
  engagement: VendorEngagement[] = this.activity.getVendorEngagement(30);
  recent: ActivityEvent[] = this.activity.getRecentEvents(14);
  loginPoints: { label: string; value: number }[] = [];

  ranges = [{ k: "all", l: "All time" }, { k: "ytd", l: "YTD" }, { k: "mtd", l: "MTD" }, { k: "wtd", l: "WTD" }, { k: "custom", l: "Custom" }];
  rangeKey = "all";
  cStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  cEnd = new Date().toISOString().slice(0, 10);
  expanded: string | null = null;

  n = fmtNumber;
  rel = relativeTime;
  dt = fmtDateTime;

  constructor() { this.recompute(); }

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
}
