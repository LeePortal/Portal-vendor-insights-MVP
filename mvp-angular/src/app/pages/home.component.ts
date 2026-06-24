import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { AuthService } from "../core/auth.service";
import { DataService } from "../core/data.service";
import { AFilter } from "../core/analytics.service";
import { BrandPerformanceSource, HealthCheck } from "../core/brand-performance.source";
import { DATA_MODE } from "../core/app-config";
import { MultiLineChartComponent, MultiSeries } from "../components/charts.component";
import { fmtCompact, fmtNumber } from "../core/format";

interface Kp { label: string; value: string; yoy: number; }
interface PropCard { label: string; count: number | null; yoy: number; }
interface SkuRow { brand: string; model: string; category: string; sales: string; share: string; units: string; avg: string; }
interface BrandRow { brand: string; sales: string; share: string; yoy: string; }
interface SwitchRow { product: string; to: string; units: string; }

/**
 * Home hub.
 *  - Admin: network sales performance + live-data system status (unchanged).
 *  - Vendor users (subscribers AND free-signup): platform-wide proposal activity only — Submitted /
 *    Accepted / Completed across the whole Portal network, NOT brand-specific. Subscribers then get the
 *    Market Insights / Premium Placement hub cards; free-signup accounts instead get a blurred
 *    "Top selling SKUs" teaser to entice a subscription.
 */
@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MultiLineChartComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h1>{{ isAdmin ? "Network sales performance" : "Welcome, " + firstName }}</h1>
        <p>{{ isAdmin ? "Across all subscribing brands on the Portal network — trailing 12 months vs. prior year." : "Proposal activity across the Portal network — trailing 12 months vs. prior year." }}</p>
      </div>
      <span class="badge-sample">{{ dataMode === 'api' ? 'LIVE DATA' : 'SAMPLE DATA' }}</span>
    </div>

    <div *ngIf="loadError" class="pcard" style="border:1px solid var(--negative);margin-bottom:16px"><div class="bd" style="color:var(--negative);font-size:13px">{{ loadError }}</div></div>

    <ng-container *ngIf="isAdmin">
      <div class="pcard" *ngIf="dataMode === 'api'" style="margin-bottom:16px">
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

      <div *ngIf="loading" class="grid c4" style="margin-bottom:16px">
        <div class="pcard kpi" *ngFor="let s of [1,2,3,4]"><div class="hsk" style="height:12px;width:55%;margin-bottom:14px"></div><div class="hsk" style="height:26px;width:72%"></div></div>
      </div>
      <div class="grid c4" style="margin-bottom:16px" *ngIf="!loading">
        <div class="pcard kpi" *ngFor="let kp of kpis">
          <div class="label">{{ kp.label }}</div>
          <div class="value">{{ kp.value }}</div>
          <div class="delta" [class.up]="kp.yoy > 0.05" [class.down]="kp.yoy < -0.05">{{ kp.yoy >= 0 ? "▲" : "▼" }} {{ absPct(kp.yoy) }} YoY</div>
        </div>
      </div>

      <div *ngIf="loading" class="pcard"><div class="hsk" style="height:14px;width:32%;margin-bottom:18px"></div><div class="hsk" style="height:240px"></div></div>
      <div class="pcard" *ngIf="!loading">
        <div class="hd"><div class="t">Sales performance</div><div class="s">Revenue by month — trailing 12 months vs. prior year</div></div>
        <div class="bd">
          <div style="display:flex;gap:18px;font-size:12px;color:var(--text-muted);margin-bottom:8px">
            <span><span style="display:inline-block;width:14px;border-top:3px solid #ff5000;vertical-align:middle"></span> This year</span>
            <span><span style="display:inline-block;width:14px;border-top:3px solid #8a8a82;vertical-align:middle"></span> Last year</span>
          </div>
          <app-multiline [series]="trendSeries" [axis]="trendAxis" yLabel="Revenue ($)" xLabel="Month" valueFormat="money"></app-multiline>
        </div>
      </div>
    </ng-container>

    <ng-container *ngIf="!isAdmin">
      <div *ngIf="loading" class="kgrid3" style="margin-bottom:16px">
        <div class="pcard kpi" *ngFor="let s of [1,2,3]"><div class="hsk" style="height:12px;width:55%;margin-bottom:14px"></div><div class="hsk" style="height:26px;width:60%"></div></div>
      </div>
      <div class="kgrid3" style="margin-bottom:16px" *ngIf="!loading">
        <div class="pcard kpi" *ngFor="let c of propCards">
          <div class="label">{{ c.label }} proposals</div>
          <div class="value">{{ c.count === null ? "—" : n(c.count) }}</div>
          <div class="delta" *ngIf="c.count !== null" [class.up]="c.yoy > 0.05" [class.down]="c.yoy < -0.05">{{ c.yoy >= 0 ? "▲" : "▼" }} {{ absPct(c.yoy) }} YoY</div>
          <div class="delta" *ngIf="c.count === null">Network total</div>
        </div>
      </div>

      <div *ngIf="!isFree" class="grid c2">
        <a routerLink="/dashboards/overview" class="pcard" style="text-decoration:none;color:inherit;display:block;cursor:pointer">
          <div class="hd"><div class="t">Market Insights</div><div class="s">How your products are selling across the Portal network</div></div>
          <div class="bd" style="font-size:13px;color:var(--accent);font-weight:700">Open dashboard &rarr;</div>
        </a>
        <a routerLink="/premium" class="pcard" style="text-decoration:none;color:inherit;display:block;cursor:pointer">
          <div class="hd"><div class="t">Premium Placement</div><div class="s">Your Spotlight advertising performance</div></div>
          <div class="bd" style="font-size:13px;color:var(--accent);font-weight:700">Open dashboard &rarr;</div>
        </a>
      </div>

      <ng-container *ngIf="isFree">
        <div class="pcard tz-banner">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--text)">Unlock the full Market Insights view</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;max-width:520px">You're exploring on a free account. Subscribe to reveal sales, share, competitive switches and trends across the Portal network.</div>
            </div>
            <button class="pbtn primary" (click)="subscribe()" style="flex:0 0 auto">{{ subscribed ? "Thanks — we'll be in touch" : "Subscribe to unlock" }}</button>
          </div>
        </div>

        <div class="pcard tz-card2">
          <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="t">Top selling SKUs</div><div class="s">Best-selling products across the Portal network</div></div><span class="tz-chip"><mat-icon>lock</mat-icon> Locked</span></div>
          <div class="bd">
            <div *ngIf="teaserLoading" class="tz-skel"><div class="hsk" style="height:28px;margin-bottom:9px"></div><div class="hsk" *ngFor="let s of [1,2,3,4,5]" style="height:24px;margin-bottom:8px"></div></div>
            <table *ngIf="!teaserLoading" class="ptbl" style="width:100%">
              <thead><tr><th>#</th><th>Brand</th><th>Model</th><th>Category</th><th class="num">Total Sales</th><th class="num">$ Share %</th><th class="num"># Units</th><th class="num">Avg Sell $</th></tr></thead>
              <tbody class="tz-blur">
                <tr *ngFor="let r of teaserSkus; let i = index"><td class="muted">{{ i + 1 }}</td><td style="font-weight:600">{{ r.brand }}</td><td>{{ r.model }}</td><td class="muted">{{ r.category }}</td><td class="num">{{ r.sales }}</td><td class="num">{{ r.share }}</td><td class="num">{{ r.units }}</td><td class="num">{{ r.avg }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="pcard tz-card2">
          <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="t">Top 10 brands</div><div class="s">Ranked by network sales · trailing 12 months</div></div><span class="tz-chip"><mat-icon>lock</mat-icon> Locked</span></div>
          <div class="bd">
            <div *ngIf="teaserLoading" class="tz-skel"><div class="hsk" style="height:28px;margin-bottom:9px"></div><div class="hsk" *ngFor="let s of [1,2,3,4]" style="height:24px;margin-bottom:8px"></div></div>
            <table *ngIf="!teaserLoading" class="ptbl" style="width:100%">
              <thead><tr><th style="width:32px">#</th><th>Brand</th><th class="num">Total Sales</th><th class="num">$ Share %</th><th class="num">YoY</th></tr></thead>
              <tbody>
                <tr *ngFor="let b of teaserBrands; let i = index"><td class="muted">{{ i + 1 }}</td><td style="font-weight:600">{{ b.brand }}</td><td class="num"><span class="tz-blur">{{ b.sales }}</span></td><td class="num"><span class="tz-blur">{{ b.share }}</span></td><td class="num"><span class="tz-blur">{{ b.yoy }}</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="pcard tz-card2">
          <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="t">Who's replacing whom</div><div class="s">Competitive switches in your category · last 90 days</div></div><span class="tz-chip"><mat-icon>lock</mat-icon> Locked</span></div>
          <div class="bd">
            <div *ngIf="teaserLoading" class="tz-skel"><div class="hsk" style="height:28px;margin-bottom:9px"></div><div class="hsk" *ngFor="let s of [1,2,3]" style="height:24px;margin-bottom:8px"></div></div>
            <table *ngIf="!teaserLoading" class="ptbl" style="width:100%">
              <thead><tr><th>Product</th><th>Switched to</th><th class="num">Units</th></tr></thead>
              <tbody>
                <tr *ngFor="let s of teaserSwitches"><td>{{ s.product }}</td><td><span class="tz-blur">{{ s.to }}</span></td><td class="num"><span class="tz-blur">{{ s.units }}</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </ng-container>
  `,
  styles: [`
    @keyframes hpulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
    .hsk { background: var(--border); border-radius: 6px; animation: hpulse 1.1s ease-in-out infinite; display: block; }
    .st-dot { display:inline-block; width:11px; height:11px; border-radius:50%; background:#c9c9c9; flex:0 0 auto; box-shadow:0 0 0 3px rgba(0,0,0,0.04); }
    .st-green { background:#1d9e75; } .st-amber { background:#f0a000; } .st-red { background:#d85a30; }
    .kgrid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    @media (max-width:760px) { .kgrid3 { grid-template-columns:1fr; } }
    .tz-banner { background:var(--accent-soft, #fff3ee); border:1px solid var(--accent); margin-bottom:14px; }
    .tz-card2 { margin-bottom:14px; }
    .tz-skel { padding:4px 0; }
    .tz-blur { filter:blur(4px); user-select:none; pointer-events:none; }
    .tz-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:var(--accent); border:1px solid var(--accent); border-radius:999px; padding:3px 9px; white-space:nowrap; flex:0 0 auto; }
    .tz-chip mat-icon { font-size:14px; width:14px; height:14px; }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private src = inject(BrandPerformanceSource);
  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  isFree = !!this.session.freeSignup;
  firstName = (this.session.name || "").trim().split(/\s+/)[0] || this.session.name;

  // Admin network view
  kpis: Kp[] = [];
  trendSeries: MultiSeries[] = [];
  trendAxis: string[] = [];
  statusChecks: HealthCheck[] = [];
  statusLoading = false;
  lastChecked = "";

  // Vendor / free-signup view
  n = fmtNumber;
  propCards: PropCard[] = [{ label: "Submitted", count: null, yoy: 0 }, { label: "Accepted", count: null, yoy: 0 }, { label: "Completed", count: null, yoy: 0 }];
  subscribed = false;
  teaserLoading = true; // brief faux "fetching" delay on the teasers so they feel like real data loading
  // Representative teaser rows — intentionally NOT real data (the values are blurred to entice a subscription).
  teaserSkus: SkuRow[] = [
    { brand: "Sonos", model: "Era 300", category: "Speakers", sales: "$1.42M", share: "8.1%", units: "3,120", avg: "$455" },
    { brand: "Denon", model: "AVR-X3800H", category: "Receivers", sales: "$1.18M", share: "6.7%", units: "980", avg: "$1,204" },
    { brand: "Klipsch", model: "RP-8060FA", category: "Speakers", sales: "$0.97M", share: "5.5%", units: "1,640", avg: "$591" },
    { brand: "Origin", model: "D90", category: "Architectural", sales: "$0.81M", share: "4.6%", units: "2,210", avg: "$366" },
    { brand: "Marantz", model: "Cinema 50", category: "Receivers", sales: "$0.74M", share: "4.2%", units: "620", avg: "$1,193" },
  ];
  teaserBrands: BrandRow[] = [
    { brand: "Sonos", sales: "$4.2M", share: "12.4%", yoy: "+8%" },
    { brand: "Denon", sales: "$3.8M", share: "11.1%", yoy: "+3%" },
    { brand: "Klipsch", sales: "$3.1M", share: "9.0%", yoy: "+14%" },
    { brand: "Bose", sales: "$2.7M", share: "7.9%", yoy: "-2%" },
    { brand: "Marantz", sales: "$2.2M", share: "6.4%", yoy: "+6%" },
    { brand: "Yamaha", sales: "$1.9M", share: "5.6%", yoy: "+1%" },
    { brand: "Polk Audio", sales: "$1.6M", share: "4.7%", yoy: "+9%" },
    { brand: "Definitive Technology", sales: "$1.3M", share: "3.8%", yoy: "-4%" },
    { brand: "JBL", sales: "$1.1M", share: "3.2%", yoy: "+5%" },
    { brand: "Episode", sales: "$0.9M", share: "2.6%", yoy: "+11%" },
  ];
  teaserSwitches: SwitchRow[] = [
    { product: "8\" in-ceiling speaker", to: "Brand Alpha", units: "214" },
    { product: "7.2 AV receiver", to: "Brand Bravo", units: "156" },
    { product: "Outdoor subwoofer", to: "Brand Charlie", units: "98" },
    { product: "Soundbar", to: "Brand Delta", units: "71" },
    { product: "Architectural amplifier", to: "Brand Echo", units: "63" },
  ];

  dataMode = DATA_MODE;
  loadError = "";
  loading = true;

  async ngOnInit(): Promise<void> {
    if (this.isAdmin) { await this.loadAdmin(); }
    else { await this.loadVendor(); }
  }

  /** Admin: network sales performance (trailing 12 months vs prior year) + system status. */
  private async loadAdmin(): Promise<void> {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    const filter: AFilter = {
      brand: "admin", parents: [], subs: [], buyingGroups: [], states: [], statuses: ["Accepted", "Completed", "Submitted"],
      normalize: false, agg: "monthly", horizon: "Custom", from, to,
    };
    try {
      const p = await this.src.get(filter);
      this.kpis = [
        { label: "Active dealers", value: fmtNumber(p.kpis.dealers), yoy: p.kpis.dealersYoY },
        { label: "Unique proposals", value: fmtNumber(p.kpis.proposals), yoy: p.kpis.proposalsYoY },
        { label: "Revenue", value: fmtCompact(p.kpis.revenue), yoy: p.kpis.revenueYoY },
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
    } finally {
      this.loading = false;
    }
    if (this.dataMode === "api") this.loadHealth();
  }

  /** Vendor / free-signup: platform-wide proposal activity (not brand-specific). */
  private async loadVendor(): Promise<void> {
    if (this.isFree) setTimeout(() => { this.teaserLoading = false; }, 1200); // faux fetch delay on the teaser widgets
    try {
      const r = await this.src.platformStats();
      const by: Record<string, { count: number; yoy: number }> = {};
      for (const s of r.statuses) by[s.key] = { count: s.count, yoy: s.yoy };
      this.propCards = ["Submitted", "Accepted", "Completed"].map((k) => {
        const e = by[k];
        return { label: k, count: e ? e.count : null, yoy: e ? e.yoy : 0 };
      });
      this.loadError = "";
    } catch (e: any) {
      this.loadError = "Couldn't load network activity: " + ((e && e.message) || e);
    } finally {
      this.loading = false;
    }
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

  subscribe(): void { this.subscribed = true; }
  absPct(n: number): string { return Math.abs(n).toFixed(1) + "%"; }
}
