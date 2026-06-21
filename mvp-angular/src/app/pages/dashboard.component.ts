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
        <button class="pbtn" [disabled]="csvBusy" (click)="exportCsv()">{{ csvBusy ? "Preparing…" : "⬇ Export CSV" }}</button>
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
    <div *ngIf="notice" class="pcard" style="border-color:#ff5000;color:#ff5000;background:var(--accent-soft);margin-bottom:16px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px"><span>{{ notice }}</span><a style="cursor:pointer;font-weight:600" (click)="notice = ''">Dismiss</a></div>
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
  notice = "";
  csvBusy = false;
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

  /**
   * BY-PROPOSAL line-item export. In live (api) mode it pulls one row per proposal line item for
   * every brand matching the applied category/state/status filters + Date Range, straight from
   * Redshift (UTF-8 BOM included so Excel opens it clean). In sample mode it falls back to the
   * item-level summary the synthetic generator can produce.
   */
  async exportCsv(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const fname = "Portal Market Insights - by proposal - " + this.viewAs + " " + date + ".csv";
    if (this.dataMode === "api") {
      this.csvBusy = true;
      this.notice = "";
      try {
        const r = await this.src.exportProposals(this.filter());
        if (!r.rows) { this.notice = "No line items match the current filters — nothing to export."; return; }
        this.notice = r.truncated
          ? "Exported the first " + r.rows.toLocaleString("en-US") + " line items (export cap). Narrow the category, state, status or date range to pull the rest."
          : "Exported " + r.rows.toLocaleString("en-US") + " line items.";
        this.dl.request({ kind: "csv", filename: fname, build: () => r.csv });
      } catch (e: any) {
        this.loadError = "Couldn't build the export: " + ((e && e.message) || e);
      } finally {
        this.csvBusy = false;
      }
      return;
    }
    // Sample-data fallback: item-level summary (no raw proposal grain available offline).
    const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = ["brand", "model", "description", "total_sell", "dollar_share_pct", "units", "unit_share_pct", "avg_sell"];
    const lines = [header.join(",")];
    for (const it of this.itemRows) lines.push([it.brand, it.model, it.desc, Math.round(it.sales), it.sharePct.toFixed(2), Math.round(it.units), it.unitSharePct.toFixed(2), it.avgSell.toFixed(2)].map(esc).join(","));
    this.dl.request({ kind: "csv", filename: fname, build: () => String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n" });
  }
  pull(): void {
    const fname = "Portal.io Market Insights Report - " + this.viewAs + " " + new Date().toISOString().slice(0, 10) + ".html";
    this.dl.request({ kind: "pdf", filename: fname, build: () => this.buildReport() });
  }
  private esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  private buildReport(): string {
    const company = this.viewAs === "admin" ? "All companies" : this.viewAs;
    const scope = [this.horizon, this.parents.length ? this.parents.join(", ") : "All categories", this.states.length ? this.states.join(", ") : "All states"].join(" · ");
    const statuses = this.dataMode === "api" ? (this.statuses.join(", ") || "All statuses") : "Sample data";
    const card = (label: string, val: string, y: number) => `<div class="card"><div class="cl">${label}</div><div class="cv">${val}</div><div class="cy" style="color:${y >= 0 ? "#1d9e75" : "#d85a30"}">${y >= 0 ? "▲" : "▼"} ${Math.abs(y)}% YoY</div></div>`;
    const brandHtml = this.brandRows.slice(0, 10).map((r, i) => `<tr${r.brand === this.viewAs ? ' class="me"' : ""}><td>${i + 1}</td><td>${this.esc(r.brand)}</td><td class="n">${this.cur(r.sales)}</td><td class="n">${this.pct(r.sharePct / 100)}</td><td class="n">${this.num(r.units)}</td><td class="n">${this.num(r.skus)}</td></tr>`).join("");
    const itemHtml = this.itemRows.slice(0, 8).map((r) => `<tr${r.brand === this.viewAs ? ' class="me"' : ""}><td>${this.esc(r.brand)}</td><td>${this.esc(r.model)}</td><td class="n">${this.cur(r.sales)}</td><td class="n">${this.pct(r.sharePct / 100)}</td></tr>`).join("");
    const wonHtml = this.won.slice(0, 5).map((d) => `<li>${this.esc(d.model)} — ${this.num(d.units)} units, ${this.cur(d.sales)} (beat ${d.competitorsBeaten})</li>`).join("") || '<li class="muted">None in the selected range</li>';
    const lostHtml = this.lost.slice(0, 5).map((d) => `<li>${this.esc(d.model)} — ${this.num(d.lostUnits)} units lost</li>`).join("") || '<li class="muted">None in the selected range</li>';
    const brandLabel = this.viewAs === "admin" ? "Viewed brand" : this.viewAs;
    const idxChart = this.svgMulti(this.compSeries, this.compAxis, "Share of category (%)");
    const subV = this.submitted[0], accV = this.accepted[0];
    const subChart = subV ? this.svgDual(subV.points, brandLabel, subV.vfmt, subV.ylabel, subV.hasBrand) : "";
    const accChart = accV ? this.svgDual(accV.points, brandLabel, accV.vfmt, accV.ylabel, accV.hasBrand) : "";
    const idxSection = idxChart ? `<h2>Competitive index — share of category</h2>${idxChart}` : "";
    const trendSection = (subChart || accChart)
      ? `<h2>Proposal trends</h2>${subChart ? `<div class="ct">Category value on submitted proposals</div>${subChart}` : ""}${accChart ? `<div class="ct">Accepted &amp; completed proposals</div>${accChart}` : ""}`
      : "";
    return `<!doctype html><html><head><meta charset="utf-8"><title>Portal Market Insights — ${this.esc(company)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#333;margin:0 auto;padding:32px;max-width:980px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start}.wm{font-size:22px;font-weight:700;color:#ff5000;letter-spacing:.5px}
.tag{font-size:10px;color:#8a8a8a;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px}
.hr-r{text-align:right;font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1px}
.rule{height:4px;background:#ff5000;margin:12px 0 18px;border-radius:2px}
h1{font-size:24px;margin:0}.sub{color:#8a8a8a;font-size:13px;margin:2px 0}.scope{color:#8a8a8a;font-size:12px;margin-bottom:18px}
.cards{display:flex;gap:12px;margin-bottom:8px}.card{flex:1;border:1px solid #e5e5e5;border-radius:8px;padding:12px}
.cl{font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.5px}.cv{font-size:22px;font-weight:700;margin:3px 0}.cy{font-size:11px}
h2{font-size:14px;border-top:1px solid #eee;padding-top:14px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f0f0f0}th{color:#8a8a8a;font-weight:600}td.n,th.n{text-align:right}
tr.me{background:#fff1ea;font-weight:700}
.two{display:flex;gap:24px}.two>div{flex:1}ul{margin:6px 0;padding-left:18px;font-size:12px}li{margin:3px 0}.muted{color:#aaa;list-style:none;margin-left:-18px}
.ft{font-size:10px;color:#aaa;margin-top:14px;text-align:right}
.chartbox{border:1px solid #eee;border-radius:8px;padding:10px 12px;margin:6px 0 14px;break-inside:avoid}
.cyt{font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.legend{font-size:11px;color:#555;margin-top:6px}.ct{font-size:12px;font-weight:700;color:#333;margin:10px 0 2px}
@media print{body{padding:0}}
</style></head><body>
<div class="hdr"><div><div class="wm">Portal</div><div class="tag">Where brands and integrators connect</div></div><div class="hr-r">Market Insights<br>Brand Performance Report</div></div>
<div class="rule"></div>
<h1>${this.esc(company)}</h1><div class="sub">Market performance overview</div>
<div class="scope">${this.esc(scope)} · Statuses: ${this.esc(statuses)}</div>
<div class="cards">${card("Brand revenue", this.money(this.kpis.revenue), this.kpis.revenueYoY)}${card("Units sold", this.num(this.kpis.units), this.kpis.unitsYoY)}${card("Proposals", this.num(this.kpis.proposals), this.kpis.proposalsYoY)}${card("Active dealers", this.num(this.kpis.dealers), this.kpis.dealersYoY)}</div>
${idxSection}
<h2>Category share by brand</h2>
<table><thead><tr><th>#</th><th>Brand</th><th class="n">Total sales</th><th class="n">$ share</th><th class="n">Units</th><th class="n"># SKUs</th></tr></thead><tbody>${brandHtml}</tbody></table>
<h2>Top items</h2>
<table><thead><tr><th>Brand</th><th>Model</th><th class="n">Total sales</th><th class="n">$ share</th></tr></thead><tbody>${itemHtml}</tbody></table>
${trendSection}
<h2>Competitive displacement</h2>
<div class="two"><div><div style="font-size:12px;font-weight:700;color:#1d9e75">Business won — competitors displaced</div><ul>${wonHtml}</ul></div><div><div style="font-size:12px;font-weight:700;color:#d85a30">Business lost — you were displaced</div><ul>${lostHtml}</ul></div></div>
<div class="ft">Generated ${new Date().toISOString().slice(0, 10)} · ${this.esc(company)} · ${this.esc(this.session.name)} · Portal.io</div>
</body></html>`;
  }

  // ---- Static SVG charts for the printable report (no Angular runtime there). ----
  private axv(v: number, f: "money" | "pct" | "num"): string {
    if (f === "money") return this.money(v);
    if (f === "pct") return (Math.round(v * 10) / 10) + "%";
    return this.num(v);
  }
  private xLabels(labels: string[], xOf: (i: number) => number, y: number): string {
    const n = labels.length; if (!n) return "";
    const idx = n <= 2 ? labels.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    return idx.map((i) => `<text x="${xOf(i).toFixed(1)}" y="${y}" text-anchor="middle" font-size="9" fill="#8a8a8a">${this.esc(labels[i])}</text>`).join("");
  }
  /** Competitive index: multi-line share-of-category (%) for the selected brands. */
  private svgMulti(series: MultiSeries[], axis: string[], yLabel: string): string {
    const live = series.filter((s) => s.values && s.values.length);
    if (!live.length || !axis.length) return "";
    const W = 860, H = 250, padL = 50, padR = 14, padT = 12, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
    const n = axis.length, max = Math.max(1, ...live.flatMap((s) => s.values.filter((v) => v != null)));
    const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v: number) => padT + ih - (Math.max(0, v || 0) / max) * ih;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => { const gy = padT + ih - g * ih; return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#ececef" stroke-width="1"/><text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8a8a8a">${this.axv(g * max, "pct")}</text>`; }).join("");
    const lines = live.map((s) => {
      const pts = s.values.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
      const dots = s.values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${n <= 3 ? 4 : 2.5}" fill="${s.color}"/>`).join("");
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
    }).join("");
    const legend = live.slice(0, 10).map((s, i) => `<span style="white-space:nowrap;margin-right:14px"><span style="display:inline-block;width:11px;height:3px;background:${s.color};vertical-align:middle"></span> ${this.esc(s.label)}</span>`).join("");
    return `<div class="chartbox"><div class="cyt">${this.esc(yLabel)}</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="height:auto;display:block">${grid}${lines}${this.xLabels(axis, x, H - 10)}</svg><div class="legend">${legend}</div></div>`;
  }
  /** Proposal trend: category (dark, left axis) vs viewed brand (orange dashed, right axis). */
  private svgDual(points: DualPoint[], brandLabel: string, vfmt: "money" | "pct" | "num", yLabel: string, showBrand: boolean): string {
    if (!points || !points.length) return "";
    const W = 860, H = 240, padL = 60, padR = 60, padT = 12, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
    const n = points.length, catMax = Math.max(1, ...points.map((p) => p.category)), brMax = Math.max(1, ...points.map((p) => p.brand));
    const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const yc = (v: number) => padT + ih - (Math.max(0, v || 0) / catMax) * ih;
    const yb = (v: number) => padT + ih - (Math.max(0, v || 0) / brMax) * ih;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => {
      const gy = padT + ih - g * ih;
      const left = `<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#27272a">${this.axv(g * catMax, vfmt)}</text>`;
      const right = showBrand ? `<text x="${W - padR + 6}" y="${(gy + 3).toFixed(1)}" text-anchor="start" font-size="9" fill="#ff5000">${this.axv(g * brMax, vfmt)}</text>` : "";
      return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#ececef" stroke-width="1"/>${left}${right}`;
    }).join("");
    const catLine = `<polyline points="${points.map((p, i) => x(i).toFixed(1) + "," + yc(p.category).toFixed(1)).join(" ")}" fill="none" stroke="#27272a" stroke-width="2"/>` +
      points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${yc(p.category).toFixed(1)}" r="${n <= 3 ? 4 : 2.5}" fill="#27272a"/>`).join("");
    const brLine = showBrand ? `<polyline points="${points.map((p, i) => x(i).toFixed(1) + "," + yb(p.brand).toFixed(1)).join(" ")}" fill="none" stroke="#ff5000" stroke-width="2.5" stroke-dasharray="7 4"/>` +
      points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${yb(p.brand).toFixed(1)}" r="${n <= 3 ? 4 : 2.5}" fill="#ff5000"/>`).join("") : "";
    const legend = `<span style="margin-right:14px"><span style="display:inline-block;width:11px;height:3px;background:#27272a;vertical-align:middle"></span> Category</span>` +
      (showBrand ? `<span><span style="display:inline-block;width:11px;height:3px;background:#ff5000;vertical-align:middle"></span> ${this.esc(brandLabel)} <span style="color:#ff5000">(right axis)</span></span>` : "");
    return `<div class="chartbox"><div class="cyt">${this.esc(yLabel)}</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="height:auto;display:block">${grid}${catLine}${brLine}${this.xLabels(points.map((p) => p.label), x, H - 10)}</svg><div class="legend">${legend}</div></div>`;
  }

  money(n: number): string { if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B"; if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k"; return "$" + Math.round(n); }
  cur(n: number): string { return "$" + Math.round(n).toLocaleString("en-US"); }
  num(n: number): string { return Math.round(n).toLocaleString("en-US"); }
  pct(fr: number): string { return (fr * 100).toFixed(2) + "%"; }
  yoyStr(v: number): string { return (v >= 0 ? "▲ " : "▼ ") + Math.abs(v) + "%"; }
  dcol(v: number): string { return v >= 0 ? "var(--positive)" : "var(--negative)"; }
}
