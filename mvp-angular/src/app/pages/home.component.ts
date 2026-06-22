import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AuthService } from "../core/auth.service";
import { DataService } from "../core/data.service";
import { BrandPerformanceSource, HealthCheck } from "../core/brand-performance.source";
import { DATA_MODE } from "../core/app-config";
import { TrendChartComponent } from "../components/charts.component";
import { fmtCompact, fmtNumber } from "../core/format";

interface Kp { label: string; value: string; yoy: number; }

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, TrendChartComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h1>{{ isAdmin ? "Network sales performance" : "Welcome, " + firstName }}</h1>
        <p>{{ isAdmin ? "Across all subscribing brands on the Portal network — trailing 12 months vs. prior year." : "How your products are selling across the Portal network — trailing 12 months vs. prior year." }}</p>
      </div>
      <span class="badge-sample">SAMPLE DATA</span>
    </div>

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
      <div class="hd"><div class="t">Sales performance</div><div class="s">Revenue by month, trailing 12 months</div></div>
      <div class="bd"><app-trend [points]="trendPts" yLabel="Revenue ($)" xLabel="Month" valueFormat="money"></app-trend></div>
    </div>
  `,
  styles: [`
    .st-dot { display:inline-block; width:11px; height:11px; border-radius:50%; background:#c9c9c9; flex:0 0 auto; box-shadow:0 0 0 3px rgba(0,0,0,0.04); }
    .st-green { background:#1d9e75; } .st-amber { background:#f0a000; } .st-red { background:#d85a30; }
  `],
})
export class HomeComponent {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private src = inject(BrandPerformanceSource);
  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  brandName = this.isAdmin ? "Portal network" : this.data.getVendor(this.session.vendorId || "")?.name || "your brand";
  firstName = (this.session.name || "").trim().split(/\s+/)[0] || this.session.name;

  kpis: Kp[] = [];
  trendPts: { label: string; value: number }[] = [];
  dataMode = DATA_MODE;
  statusChecks: HealthCheck[] = [];
  statusLoading = false;
  lastChecked = "";

  constructor() {
    const CUR = { start: "2025-07-01", end: "2026-06-30" };
    const PRIOR = { start: "2024-07-01", end: "2025-06-30" };
    const vids = this.isAdmin ? this.data.listVendors().map((v) => v.id) : [this.session.vendorId!];
    let cR = 0, pR = 0, cP = 0, pP = 0, cD = 0, pD = 0, cCR = 0, pCR = 0;
    for (const vid of vids) {
      const c = this.data.getKpis({ vendorId: vid, start: CUR.start, end: CUR.end });
      const p = this.data.getKpis({ vendorId: vid, start: PRIOR.start, end: PRIOR.end });
      cR += c.revenue; pR += p.revenue; cP += c.proposals; pP += p.proposals; cD += c.activeDealers; pD += p.activeDealers;
      const ar = 0.4 + this.rng(vid) * 0.14;
      cCR += ar; pCR += ar - 0.02 + this.rng(vid + "p") * 0.04;
    }
    const curCR = (cCR / vids.length) * 100;
    const priCR = (pCR / vids.length) * 100;
    const yoy = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
    this.kpis = [
      { label: "Active dealers", value: fmtNumber(cD), yoy: yoy(cD, pD) },
      { label: "Unique proposals", value: fmtNumber(cP), yoy: yoy(cP, pP) },
      { label: "Revenue", value: fmtCompact(cR), yoy: yoy(cR, pR) },
      { label: "Close rate", value: Math.round(curCR) + "%", yoy: yoy(curCR, priCR) },
    ];
    const trends = vids.map((vid) => this.data.getRevenueTrend({ vendorId: vid, start: CUR.start, end: CUR.end }));
    this.trendPts = trends[0].map((tp, i) => ({ label: tp.label, value: trends.reduce((s, t) => s + (t[i] ? t[i].revenue : 0), 0) }));
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
