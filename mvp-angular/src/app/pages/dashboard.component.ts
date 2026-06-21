import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { DataService } from "../core/data.service";
import { DownloadService } from "../core/download.service";
import { VendorAdminService } from "../core/vendor-admin.service";
import { DASHBOARDS } from "../core/models";
import { AnalyticsService, AFilter, BrandShareRow, ItemRow, SubcatRow, DualPoint, WonRow, LostRow, BrandKpis, ShareSeries } from "../core/analytics.service";
import { BrandPerformanceSource } from "../core/brand-performance.source";
import { ProposalSeriesResult } from "../core/brand-performance.contract";
import { DATA_MODE } from "../core/app-config";
import { TrendChartComponent, DualLineChartComponent, MultiLineChartComponent, MultiSeries, PALETTE } from "../components/charts.component";
import { MultiSelectComponent } from "../components/multiselect.component";

interface Widget { title: string; value: string; yoy: number; points: DualPoint[]; hasBrand: boolean; vfmt: "money" | "pct" | "num"; ylabel: string; }

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, TrendChartComponent, DualLineChartComponent, MultiLineChartComponent, MultiSelectComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>{{ title }}</h1><p>Category performance across the Portal network. <span class="muted" *ngIf="viewAs !== 'admin'">· {{ viewAs }}</span></p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="badge-sample">{{ dataMode === 'api' ? 'LIVE DATA' : 'SAMPLE DATA' }}</span>
        <button class="pbtn" [class.primary]="subscribed" (click)="toggleSub()">{{ subscribed ? "Subscribed" : "Subscribe" }}</button>
        <button class="pbtn" (click)="exportCsv()">⬇ Export CSV</button>
        <button class="pbtn" (click)="pull()">Pull report</button>
        <button *ngIf="isAdmin" class="pbtn dark" (click)="publish()">Publish to company…</button>
      </div>
    </div>

    <div class="filterbar" style="align-items:flex-end">
      <div class="filt" *ngIf="isAdmin"><label>View as</label>
        <select class="minput" [value]="viewAs" (change)="setView($any($event.target).value)">
          <option value="admin">Admin (all access)</option>
          <option *ngFor="let b of allBrands" [value]="b">{{ b }}</option>
        </select>
      </div>
      <div class="filt"><label>Aggregation</label>
        <div class="tgl">
          <button *ngFor="let a of aggs" [class.on]="agg === a" (click)="agg = a; rebuild()">{{ a | titlecase }}</button>
        </div>
      </div>
      <div class="filt"><label>Date Range</label>
        <div class="tgl">
          <button *ngFor="let h of horizons" [class.on]="horizon === h" (click)="horizon = h; rebuild()">{{ h }}</button>
        </div>
      </div>
      <app-multiselect label="Parent category" allLabel="All categories" [options]="parentOptions" [selected]="parents" (selectedChange)="onParents($event)"></app-multiselect>
      <app-multiselect label="Sub-category" allLabel="All sub-categories" [options]="subOptions" [selected]="subs" (selectedChange)="subs = $event; rebuild()"></app-multiselect>
      <app-multiselect label="Buying group" [allLabel]="dataMode === 'api' ? 'Not mapped yet' : 'All buying groups'" [disabled]="dataMode === 'api'" [search]="false" [options]="buyingGroupOptions" [selected]="buyingGroups" (selectedChange)="buyingGroups = $event; rebuild()"></app-multiselect>
      <app-multiselect label="State" allLabel="All states" [options]="stateOptions" [selected]="states" (selectedChange)="states = $event; rebuild()"></app-multiselect>
      <app-multiselect *ngIf="dataMode === 'api'" label="Proposal status" allLabel="All statuses" [search]="false" [sort]="false" [options]="statusOptions" [selected]="statuses" (selectedChange)="statuses = $event; rebuild()"></app-multiselect>
      <div class="filt" *ngIf="dataMode === 'synthetic'"><label>Normalization <span class="info-i" title="Filters out brand-new accounts so you see true year-over-year performance.">&#9432;</span></label>
        <label class="switch"><input type="checkbox" [checked]="normalize" (change)="normalize = !normalize; rebuild()" /><span class="track"></span></label>
      </div>
      <div style="flex:1"></div>
      <button class="pbtn" (click)="reset()">Reset filters</button>
    </div>

    <div *ngIf="loadError" class="pcard" style="border-color:var(--negative);color:var(--negative);margin-bottom:16px;padding:12px 16px">{{ loadError }}</div>
    <p *ngIf="dataMode === 'api'" class="muted" style="font-size:12px;margin:-4px 0 14px">Live Redshift data (refreshed nightly). Proposal funnel &amp; competitive displacement are hidden in live mode until their metrics are defined with the data team.</p>

    <div class="dash-wrap">
    <div *ngIf="loading && firstLoad">
      <div class="grid c4" style="margin-bottom:16px">
        <div class="pcard" *ngFor="let s of [1,2,3,4]"><div class="sk" style="height:12px;width:55%;margin-bottom:14px"></div><div class="sk" style="height:24px;width:75%"></div></div>
      </div>
      <div class="pcard" style="margin-bottom:16px"><div class="sk" style="height:14px;width:35%;margin-bottom:18px"></div><div class="sk" style="height:240px"></div></div>
      <div class="pcard"><div class="sk" style="height:14px;margin-bottom:14px" *ngFor="let s of [1,2,3,4,5,6]"></div></div>
    </div>
    <ng-container *ngIf="!(loading && firstLoad)">
      <div *ngIf="loading" class="upd-pill"><span class="upd-dot"></span> Updating…</div>
      <div *ngIf="loading" class="upd-overlay"><div class="upd-spinner"></div></div>
      <div class="dash-body" [class.updating]="loading">

    <div class="grid c4" style="margin-bottom:16px">
      <div class="pcard kpi"><div class="label">Brand Revenue</div><div class="value">{{ money(kpis.revenue) }}</div><div class="delta" [style.color]="dcol(kpis.revenueYoY)">{{ yoyStr(kpis.revenueYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Units Sold</div><div class="value">{{ num(kpis.units) }}</div><div class="delta" [style.color]="dcol(kpis.unitsYoY)">{{ yoyStr(kpis.unitsYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Number of Proposals</div><div class="value">{{ num(kpis.proposals) }}</div><div class="delta" [style.color]="dcol(kpis.proposalsYoY)">{{ yoyStr(kpis.proposalsYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Active Dealers</div><div class="value">{{ num(kpis.dealers) }}</div><div class="delta" [style.color]="dcol(kpis.dealersYoY)">{{ yoyStr(kpis.dealersYoY) }} YoY</div></div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd"><div class="t">Competitive index — brand share of category $ by {{ agg }}</div><div class="s">Share is calculated against the <b>total</b> selected category. Toggle brands to compare; top 10 shown by default.</div></div>
      <div class="bd">
        <div class="comp-wrap">
          <div class="comp-list">
            <div class="comp-actions"><a (click)="topN(10)">Top 10</a><a (click)="allComp()">All</a><a (click)="clearComp()">Clear</a></div>
            <label class="comp-row" *ngFor="let r of compRows; let i = index" [class.viewed]="r.brand === viewAs">
              <input type="checkbox" [checked]="selectedBrands.includes(r.brand)" (change)="toggleComp(r.brand)" />
              <span class="comp-dot" [style.background]="colorFor(r.brand, i)"></span>
              <span class="comp-name">{{ i + 1 }}. {{ r.brand }}</span>
              <span class="comp-share">{{ pct(r.sharePct / 100) }}</span>
            </label>
          </div>
          <div class="comp-chart"><app-multiline [series]="compSeries" [axis]="compAxis" yLabel="Share of category (%)" xLabel="Month"></app-multiline></div>
        </div>
      </div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd"><div class="t">Category Share by Brand</div><div class="s">Every brand matching the filters</div></div>
      <div class="bd" style="max-height:380px;overflow:auto">
        <table class="ptbl">
          <thead><tr><th>#</th><th>Brand</th><th class="num">Total Sales</th><th class="num">$ Share %</th><th class="num"># Units</th><th class="num">Unit Share %</th><th class="num">Avg Unit $</th><th class="num"># SKUs</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of brandRows; let i = index" [style.background]="r.brand === viewAs ? 'var(--accent-soft)' : ''">
              <td class="muted">{{ i + 1 }}</td><td style="font-weight:600">{{ r.brand }}</td>
              <td class="num">{{ cur(r.sales) }}</td><td class="num">{{ pct(r.sharePct / 100) }}</td>
              <td class="num">{{ num(r.units) }}</td><td class="num">{{ pct(r.unitSharePct / 100) }}</td>
              <td class="num">{{ cur(r.avgSell) }}</td><td class="num">{{ num(r.skus) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd"><div class="t">Category Share by Item</div><div class="s">Every SKU matching the filters ({{ itemRows.length }})</div></div>
      <div class="bd" style="max-height:420px;overflow:auto">
        <table class="ptbl">
          <thead><tr><th>#</th><th>Brand</th><th>Model</th><th>Description</th><th class="num">Total Sales</th><th class="num">$ Share %</th><th class="num"># Units</th><th class="num">Avg Sell $</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of itemRows; let i = index" [style.background]="r.brand === viewAs ? 'var(--accent-soft)' : ''">
              <td class="muted">{{ i + 1 }}</td><td style="font-weight:600">{{ r.brand }}</td><td>{{ r.model }}</td><td class="muted">{{ r.desc }}</td>
              <td class="num">{{ cur(r.sales) }}</td><td class="num">{{ pct(r.sharePct / 100) }}</td><td class="num">{{ num(r.units) }}</td><td class="num">{{ cur(r.avgSell) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd"><div class="t">Sub-Category Sales Breakdown</div></div>
      <div class="bd" style="max-height:380px;overflow:auto">
        <table class="ptbl">
          <thead><tr><th>Sub-category</th><th class="num">Total Sales</th><th class="num">$ % of Category</th><th class="num"># Units</th><th class="num">Unit % of Category</th><th class="num">Avg Sell $</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of subcatRows"><td style="font-weight:600">{{ r.subcat }}</td><td class="num">{{ cur(r.sales) }}</td><td class="num">{{ pct(r.pctOfCat / 100) }}</td><td class="num">{{ num(r.units) }}</td><td class="num">{{ pct(r.unitPctOfCat / 100) }}</td><td class="num">{{ cur(r.avgSell) }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <h2 *ngIf="submitted.length" style="font-size:17px;margin:22px 0 12px;border-top:1px solid var(--border);padding-top:18px">Category value on Submitted proposals</h2>
    <div class="grid c2" *ngIf="submitted.length">
      <div class="pcard span2" *ngFor="let w of submitted">
        <div class="hd"><div class="t">{{ w.title }}</div><div class="s"><b style="font-size:18px;color:var(--text)">{{ w.value }}</b> <span [style.color]="w.yoy >= 0 ? 'var(--positive)' : 'var(--negative)'">▲ {{ w.yoy }}%</span> YoY</div></div>
        <div class="bd"><app-dual [points]="w.points" [showBrand]="w.hasBrand" [brandLabel]="viewAs" [valueFormat]="w.vfmt" [yLabel]="w.ylabel" xLabel="Month"></app-dual></div>
      </div>
    </div>

    <h2 *ngIf="accepted.length" style="font-size:17px;margin:22px 0 12px;border-top:1px solid var(--border);padding-top:18px">Accepted &amp; Completed proposals</h2>
    <div class="grid c2" *ngIf="accepted.length">
      <div class="pcard span2" *ngFor="let w of accepted">
        <div class="hd"><div class="t">{{ w.title }}</div><div class="s"><b style="font-size:18px;color:var(--text)">{{ w.value }}</b> <span [style.color]="w.yoy >= 0 ? 'var(--positive)' : 'var(--negative)'">▲ {{ w.yoy }}%</span> YoY</div></div>
        <div class="bd"><app-dual [points]="w.points" [showBrand]="w.hasBrand" [brandLabel]="viewAs" [valueFormat]="w.vfmt" [yLabel]="w.ylabel" xLabel="Month"></app-dual></div>
      </div>
    </div>

    <h2 *ngIf="won.length || lost.length" style="font-size:17px;margin:22px 0 12px;border-top:1px solid var(--border);padding-top:18px">Competitive displacement</h2>
    <div class="grid c2" style="align-items:start" *ngIf="won.length || lost.length">
      <div class="pcard">
        <div class="hd"><div class="t" style="color:var(--positive)">Business won — competitors displaced</div><div class="s">Line items where {{ viewAs === 'admin' ? 'the brand' : viewAs }} replaced a competitor</div></div>
        <div class="bd" style="max-height:440px;overflow:auto">
          <table class="ptbl">
            <thead><tr><th>Model</th><th>Sub-category</th><th class="num"># Units won</th><th class="num">$ won</th><th class="num">Competitors beaten</th></tr></thead>
            <tbody>
              <tr *ngFor="let d of won"><td style="font-weight:600">{{ d.model }}</td><td class="muted">{{ d.desc }}</td>
                <td class="num" style="color:var(--positive)">{{ num(d.units) }}</td><td class="num">{{ cur(d.sales) }}</td><td class="num">{{ d.competitorsBeaten }}</td></tr>
              <tr *ngIf="!won.length"><td colspan="5" class="muted">No wins for the current selection.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="pcard">
        <div class="hd"><div class="t" style="color:var(--negative)">Business lost — you were displaced</div><div class="s">Click an item to see the SKUs that displaced it, ranked by units</div></div>
        <div class="bd" style="max-height:440px;overflow:auto">
          <table class="ptbl">
            <thead><tr><th></th><th>Your model</th><th>Sub-category</th><th class="num"># Units lost</th><th class="num">$ lost</th></tr></thead>
            <tbody>
              <ng-container *ngFor="let d of lost">
                <tr (click)="toggleLost(d.model)" style="cursor:pointer">
                  <td class="muted" style="width:14px">{{ expandedLost === d.model ? "▾" : "▸" }}</td>
                  <td style="font-weight:600">{{ d.model }}</td><td class="muted">{{ d.subcat }}</td>
                  <td class="num" style="color:var(--negative)">{{ num(d.lostUnits) }}</td><td class="num">{{ cur(d.lostSales) }}</td>
                </tr>
                <tr *ngIf="expandedLost === d.model">
                  <td colspan="5" style="background:var(--surface-2);padding:10px 14px">
                    <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px">Displaced by — ranked by units</div>
                    <table class="ptbl" style="margin:0">
                      <thead><tr><th>#</th><th>Brand</th><th>Model</th><th class="num"># Units</th></tr></thead>
                      <tbody>
                        <tr *ngFor="let s of d.displacers; let i = index"><td class="muted">{{ i + 1 }}</td><td style="font-weight:600">{{ s.brand }}</td><td>{{ s.model }}</td><td class="num">{{ num(s.units) }}</td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </ng-container>
              <tr *ngIf="!lost.length"><td colspan="5" class="muted">No displacements for the current selection.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
      </div>
    </ng-container>
    </div>
  `,
  styles: [`
    @keyframes dashspin { to { transform: rotate(360deg); } }
    @keyframes dashpulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
    .dash-wrap { position: relative; }
    .dash-body.updating { opacity: .4; pointer-events: none; transition: opacity .2s; }
    .upd-overlay { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 90px; z-index: 5; }
    .upd-spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: #ff5000; border-radius: 50%; animation: dashspin .8s linear infinite; }
    .upd-pill { position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: var(--accent-soft); color: #ff5000; font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 999px; z-index: 6; display: inline-flex; gap: 7px; align-items: center; }
    .upd-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff5000; animation: dashpulse 1s ease-in-out infinite; }
    .sk { background: var(--border); border-radius: 6px; animation: dashpulse 1.1s ease-in-out infinite; display: block; }
  `],
})
export class DashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private data = inject(DataService);
  private an = inject(AnalyticsService);
  private src = inject(BrandPerformanceSource);
  private dl = inject(DownloadService);
  private va = inject(VendorAdminService);

  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  title = "Brand Performance Overview";
  allBrands = this.va.listCompanies().map((c) => c.name).sort((a, b) => a.localeCompare(b));
  aggs = ["daily", "weekly", "monthly", "quarterly"];
  horizons = ["MTD", "QTD", "YTD", "All"];
  buyingGroupOptions = this.an.buyingGroups;
  stateOptions = this.an.states;
  statusOptions = ["Completed", "Accepted", "Submitted", "Opened", "Draft", "Changes Required", "Declined", "Expired", "Email Failed"];
  restrictParents: string[] = [];

  viewAs = "admin";
  agg = "monthly";
  horizon = "YTD";
  normalize = false;
  parents: string[] = [];
  subs: string[] = [];
  buyingGroups: string[] = [];
  states: string[] = [];
  readonly defaultStatuses = ["Accepted", "Completed", "Submitted"];
  statuses: string[] = [...this.defaultStatuses];
  subscribed = false;

  brandRows: BrandShareRow[] = [];
  itemRows: ItemRow[] = [];
  subcatRows: SubcatRow[] = [];
  compRows: BrandShareRow[] = [];
  compSeries: MultiSeries[] = [];
  compAxis: string[] = [];
  selectedBrands: string[] = [];
  submitted: Widget[] = [];
  accepted: Widget[] = [];
  won: WonRow[] = [];
  lost: LostRow[] = [];
  expandedLost: string | null = null;
  catSales = 0; catUnits = 0; totalSkus = 0; myShare = 0; myskus = 0;
  kpis: BrandKpis = { revenue: 0, units: 0, proposals: 0, dealers: 0, revenueYoY: 0, unitsYoY: 0, proposalsYoY: 0, dealersYoY: 0 };
  dataMode = DATA_MODE;
  lastShareSeries: ShareSeries = { labels: [], rows: [], series: {} };
  loadError = "";
  loading = false;
  firstLoad = true;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id") || "overview";
    this.title = (DASHBOARDS.find((d) => d.id === id)?.name || "Brand Performance Overview");
    if (!this.isAdmin) {
      this.viewAs = this.data.getVendor(this.session.vendorId || "")?.name || this.allBrands[0];
      this.restrictParents = this.va.getUser(this.session.email)?.parents || [];
    } else {
      const v = this.route.snapshot.queryParamMap.get("view");
      if (v) this.viewAs = this.data.getVendor(v)?.name || "admin";
    }
    this.rebuild(true);
  }

  get parentOptions(): string[] { return this.an.visibleParentsFor(this.viewAs, this.restrictParents); }
  get subOptions(): string[] { return this.parents.length ? this.an.subsForParents(this.parents) : []; }

  private filter(): AFilter {
    return { brand: this.viewAs, parents: this.parents, subs: this.subs, buyingGroups: this.buyingGroups, states: this.states, statuses: this.statuses, normalize: this.normalize, agg: this.agg, horizon: this.horizon };
  }
  async rebuild(resetComp = false): Promise<void> {
    const f = this.filter();
    this.loading = true;
    try {
      const p = await this.src.get(f);
      this.brandRows = p.brandRows;
      this.itemRows = p.itemRows;
      this.subcatRows = p.subcatRows;
      this.lastShareSeries = p.share;
      this.compRows = p.share.rows.slice(0, 10);
      this.compAxis = p.share.labels;
      const present = new Set(this.compRows.map((r) => r.brand));
      if (resetComp || !this.selectedBrands.some((b) => present.has(b))) this.selectedBrands = this.defaultComp();
      else this.selectedBrands = this.selectedBrands.filter((b) => present.has(b));
      this.buildCompSeries(p.share.series);
      this.kpis = p.kpis;
      this.won = p.won;
      this.lost = p.lost;
      this.catSales = this.brandRows.reduce((s, r) => s + r.sales, 0);
      this.catUnits = this.brandRows.reduce((s, r) => s + r.units, 0);
      this.totalSkus = this.brandRows.reduce((s, r) => s + r.skus, 0);
      const mine = this.brandRows.find((r) => r.brand === this.viewAs);
      this.myShare = mine ? mine.sharePct / 100 : 0;
      this.myskus = mine ? mine.skus : 0;
      this.submitted = this.widgets(p.submitted);
      this.accepted = this.widgets(p.accepted);
      this.loadError = "";
    } catch (e: any) {
      this.loadError = "Couldn't load live data: " + ((e && e.message) || e);
    } finally {
      this.loading = false;
      this.firstLoad = false;
    }
  }
  private defaultComp(): string[] {
    const top = this.compRows.slice(0, 10).map((r) => r.brand);
    if (this.viewAs !== "admin" && !top.includes(this.viewAs) && this.compRows.some((r) => r.brand === this.viewAs)) { top.pop(); top.push(this.viewAs); }
    return top;
  }
  private buildCompSeries(series: Record<string, number[]>): void {
    this.compSeries = this.compRows
      .filter((r) => this.selectedBrands.includes(r.brand))
      .map((r, i) => ({ label: r.brand, values: series[r.brand] || [], color: this.colorFor(r.brand, this.compRows.indexOf(r)) }));
  }
  colorFor(brand: string, i: number): string { return brand === this.viewAs ? "#ff5000" : PALETTE[(i + 1) % PALETTE.length]; }

  toggleComp(brand: string): void {
    const i = this.selectedBrands.indexOf(brand);
    i >= 0 ? this.selectedBrands.splice(i, 1) : this.selectedBrands.push(brand);
    this.buildCompSeries(this.lastShareSeries.series);
  }
  topN(n: number): void { this.selectedBrands = this.compRows.slice(0, n).map((r) => r.brand); this.buildCompSeries(this.lastShareSeries.series); }
  allComp(): void { this.selectedBrands = this.compRows.map((r) => r.brand); this.buildCompSeries(this.lastShareSeries.series); }
  clearComp(): void { this.selectedBrands = []; this.compSeries = []; }

  private widgets(list: ProposalSeriesResult[]): Widget[] {
    const meta: Record<string, { t: string; vfmt: "money" | "pct" | "num"; yl: string }> = {
      value: { t: "Category $ on proposals", vfmt: "money", yl: "$ on proposals" },
      count: { t: "# of proposals containing the category", vfmt: "num", yl: "# proposals" },
      pct: { t: "% of proposals containing the category", vfmt: "pct", yl: "% of proposals" },
      avg: { t: "Average $ per proposal", vfmt: "money", yl: "Avg $ / proposal" },
    };
    return (list || []).map((r) => {
      const m = meta[r.kind] || meta["value"];
      const value = r.kind === "pct" ? Math.round(r.total) + "%" : r.kind === "count" ? this.num(r.total) : this.money(r.total);
      return { title: m.t, value, yoy: r.yoy, points: r.points, hasBrand: r.hasBrand, vfmt: m.vfmt, ylabel: m.yl };
    });
  }

  onParents(v: string[]): void { this.parents = v; this.subs = this.subs.filter((s) => this.subOptions.includes(s)); this.rebuild(); }
  setView(v: string): void { this.viewAs = v; this.parents = []; this.subs = []; this.rebuild(true); }
  reset(): void { this.parents = []; this.subs = []; this.buyingGroups = []; this.states = []; this.statuses = [...this.defaultStatuses]; this.normalize = false; this.agg = "monthly"; this.horizon = "YTD"; this.rebuild(true); }
  toggleSub(): void { this.subscribed = !this.subscribed; }
  toggleLost(model: string): void { this.expandedLost = this.expandedLost === model ? null : model; }
  publish(): void { alert("Publish this dashboard by subscribing companies (admin). You can target specific companies or All. To be fleshed out."); }

  exportCsv(): void {
    const rows = ["brand,model,description,parentcat_filtered,total_sales,units_sold,avg_sell"];
    for (const it of this.itemRows) rows.push([it.brand, it.model, it.desc, this.parents.join("|") || "all", Math.round(it.sales), it.units, it.avgSell.toFixed(2)].join(","));
    const fname = "Portal.io Market Insights - " + this.viewAs + " " + new Date().toISOString().slice(0, 10) + " " + this.session.name + ".csv";
    this.dl.request({ kind: "csv", filename: fname, build: () => rows.join("\n") });
  }
  pull(): void {
    const fname = "Portal.io Market Insights - " + this.viewAs + " " + new Date().toISOString().slice(0, 10) + " " + this.session.name + ".pdf";
    this.dl.request({ kind: "pdf", filename: fname });
  }

  money(n: number): string { if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B"; if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k"; return "$" + Math.round(n); }
  cur(n: number): string { return "$" + Math.round(n).toLocaleString("en-US"); }
  num(n: number): string { return Math.round(n).toLocaleString("en-US"); }
  pct(fr: number): string { return (fr * 100).toFixed(2) + "%"; }
  yoyStr(v: number): string { return (v >= 0 ? "▲ " : "▼ ") + Math.abs(v) + "%"; }
  dcol(v: number): string { return v >= 0 ? "var(--positive)" : "var(--negative)"; }
}
