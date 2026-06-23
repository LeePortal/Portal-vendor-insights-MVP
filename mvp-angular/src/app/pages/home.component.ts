import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AuthService } from "../core/auth.service";
import { DataService } from "../core/data.service";
import { AFilter } from "../core/analytics.service";
import { BrandPerformanceSource, HealthCheck } from "../core/brand-performance.source";
import { DATA_MODE } from "../core/app-config";
import { TrendChartComponent, MultiLineChartComponent, MultiSeries } from "../components/charts.component";
import { fmtCompact, fmtNumber } from "../core/format";

interface Kp { label: string; value: string; yoy: number; }

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, TrendChartComponent, MultiLineChartComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h1>{{ isAdmin ? "Network sales performance" : "Welcome, " + firstName }}</h1>
        <p>{{ isAdmin ? "Across all subscribing brands on the Portal network — trailing 12 months vs. prior year." : "How your products are selling across the Portal network — trailing 12 months vs. prior year." }}</p>
      </div>
      <span class="badge-sample">{{ dataMode === 'api' ? 'LIVE DATA' : 'SAMPLE DATA' }}</span>
    </div>

    <div *ngIf="loadError" class="pcard" style="border:1px solid var(--negative);margin-bottom:16px"><div class="bd" style="color:var(--negative);font-size:13px">{{ loadError }}</div></div>

    <div class="pcard" *ngIf="isAdmin && dataMode === 'api'" style="margin-bottom:16px">
      <div class="hd" style="display:flex;justify-content:space-between;align-items:center">
        <div><div class="t">System status</div><div class="s">Live-data connection health <span *ngIf="lastChecked" class="muted">· checked {{ lastChecked }}</span></div></div>
        <button class="pbtn" (click)="loadHealth()" [disabled]="statusLoading">{{ statusLoading ? "Checking…" : "Recheck" }}</button>
      </div>
      <div class="bd">
        <div *ngIf="statusLoading && !statusChecks.length" style="font-size:13px;display:flex;align-items:center;gap:10px"><span class="st-dot st-amber"></span> Checking connections…</div>
        <div *ngFor="let c of statusChecks" style="display:flex;align-items:center;gap:10px;padding:5px 0;font-size:13px">
          <span class="st-dot" [class.st-green]="c.status === 'up'" [class.st-amber]="c.status === 'degraded'" [class.st-red]="c.status === 'down'"></span>
          <span style="font-weight:600;min-width:160px">{{ c.label }}</span>
          <span class="muted">{{ c.detail }}</span>
        </div>
      </div>
    </div>

    <div class="grid c4" style="margin-bottom:16px">
      <div class="pcard kpi" *ngFor="let kp of kpis">
        <div class="label">{{ kp.label }}</div>
        <div class="value">{{ kp.value }}</div>
        <div class="delta" [class.up]="kp.yoy > 0.05" [class.down]="kp.yoy < -0.05">{{ kp.yoy >= 0 ? "▲" : "▼" }} {{ absPct(kp.yoy) }} YoY</div>
      </div>
    </div>

    <div class="pcard">
      <div class="hd"><div class="t">Sales performance</div><div class="s">Revenue by month — trailing 12 months vs. prior year</div></div>
      <div class="bd">
        <div style="display:flex;gap:18px;font-size:12px;color:var(--text-muted);margin-bottom:8px">
          <span><span style="display:inline-block;width:14px;border-top:3px solid #ff5000;vertical-align:middle"></span> This year</span>
          <span><span style="display:inline-block;width:14px;border-top:3px solid #8a8a82;vertical-align:middle"></span> Last year</span>
        </div>
        <app-multiline [series]="trendSeries" [axis]="trendAxis" yLabel="Revenue ($)" xLabel="Month" valueFormat="money"></app-multiline>
      </div>
    </div>
  `,
  styles: [`
    .st-dot { display:inline-block; width:11px; height:11px; border-radius:50%; background:#c9c9c9; flex:0 0 auto; box-shadow:0 0 0 3px rgba(0,0,0,0.04); }
    .st-green { background:#1d9e75; } .st-amber { background:#f0a000; } .st-red { background:#d85a30; }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private src = inject(BrandPerformanceSource);
  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  brandName = this.isAdmin ? "Portal network" : this.data.getVendor(this.session.vendorId || "")?.name || "your brand";
  firstName = (this.session.name || "").trim().split(/\s+/)[0] || this.session.name;

  kpis: Kp[] = [];
  trendSeries: MultiSeries[] = [];
  trendAxis: string[] = [];
  dataMode = DATA_MODE;
  statusChecks: HealthCheck[] = [];
  statusLoading = false;
  lastChecked = "";

  loadError = "";

  async ngOnInit(): Promise<void> {
    // Live: trailing 12 months vs the prior year. Admin = whole network (all brands); vendor = own brand.
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    const filter: AFilter = {
      brand: this.isAdmin ? "admin" : (this.data.getVendor(this.session.vendorId || "")?.name || ""),
      parents: [], subs: [], buyingGroups: [], states: [], statuses: ["Accepted", "Completed", "Submitted"],
      normalize: false, agg: "monthly", horizon: "Custom", from, to,
    };
    try {
      const p = await this.src.get(filter);
      this.kpis = [
        { label: "Active dealers", value: fmtNumber(p.kpis.dealers), yoy: p.kpis.dealersYoY },
        { label: "Unique proposals", value: fmtNumber(p.kpis.proposals), yoy: p.kpis.proposalsYoY },
        { label: this.isAdmin ? "Revenue" : "Brand revenue", value: fmtCompact(p.kpis.revenue), yoy: p.kpis.revenueYoY },
        { label: "Units sold", value: fmtNumber(p.kpis.units), yoy: p.kpis.unitsYoY },
      ];
      this.trendAxis = p.revByPeriod.labels || [];
      this.trendSeries = [
        { label: "This year", values: p.revByPeriod.values || [], color: "#ff5000" },
        { label: "Last year", values: p.revByPeriod.prior || [], color: "#8a8a82" },
      ];
      this.loadError = "";
    } catch (e: any) {
      this.loadError = "Couldn't load live data: " + ((e && e.message) || e);
    }
    if (this.isAdmin && this.dataMode === "api") this.loadHealth();
  }

  async loadHealth(): Promise<void> {
    this.statusLoading = true;
    try {
      const h = await this.src.health();
      this.statusChecks = [{ id: "api", label: "Data API", status: "up", detail: "Reachable" }, ...h.checks];
      this.lastChecked = new Date(h.ts).toLocaleTimeString();
    } catch {
      this.statusChecks = [{ id: "api", label: "Data API", status: "down", detail: "Unreachable" }];
      this.lastChecked = new Date().toLocaleTimeString();
    } finally {
      this.statusLoading = false;
    }
  }

  absPct(n: number): string { return Math.abs(n).toFixed(1) + "%"; }
  private rng(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
}
