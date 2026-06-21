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
        <button class="pbtn" [disabled]="pdfBusy" (click)="pull()">{{ pdfBusy ? "Preparing…" : "Pull report" }}</button>
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
  pdfBusy = false;
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
  async pull(): Promise<void> {
    this.pdfBusy = true;
    this.notice = "";
    try {
      const blob = await this.buildPdf();
      const fname = "Portal Market Insights Report - " + this.viewAs + " " + new Date().toISOString().slice(0, 10) + ".pdf";
      this.dl.request({ kind: "pdf", filename: fname, blobData: blob });
    } catch (e: any) {
      this.loadError = "Couldn't build the report PDF: " + ((e && e.message) || e);
    } finally {
      this.pdfBusy = false;
    }
  }

  /** Build the branded one-page-style report as a real downloadable PDF (jsPDF, vector charts).
   *  jsPDF is loaded on demand so it stays out of the initial bundle. */
  private async buildPdf(): Promise<Blob> {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 40, CW = PW - M * 2;
    const ORANGE: [number, number, number] = [255, 80, 0];
    const DARK: [number, number, number] = [39, 39, 42];
    const GREY: [number, number, number] = [138, 138, 138];
    const GRID: [number, number, number] = [236, 236, 239];
    const GREEN: [number, number, number] = [29, 158, 117];
    const RED: [number, number, number] = [216, 90, 48];
    const company = this.viewAs === "admin" ? "All companies" : this.viewAs;
    const brandLabel = this.viewAs === "admin" ? "Viewed brand" : this.viewAs;
    const scope = [this.horizon, this.parents.length ? this.parents.join(", ") : "All categories", this.states.length ? this.states.join(", ") : "All states"].join("   ·   ");
    const statuses = this.dataMode === "api" ? (this.statuses.join(", ") || "All statuses") : "Sample data";
    const date = new Date().toISOString().slice(0, 10);
    const st = { y: M };
    const hexRgb = (h: string): [number, number, number] => { const m = h.replace("#", ""); const f = m.length === 3 ? m.split("").map((c) => c + c).join("") : m; const n = parseInt(f, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const sc = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
    const fcol = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
    const tc = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
    const ensure = (need: number) => { if (st.y + need > PH - M - 24) { doc.addPage(); st.y = M; } };
    const clip = (t: any, w: number): string => { const s = String(t ?? ""); return doc.splitTextToSize(s, w)[0] || ""; };

    // Header
    doc.setFont("helvetica", "bold"); doc.setFontSize(19); tc(ORANGE); doc.text("Portal", M, st.y + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); tc(GREY); doc.text("WHERE BRANDS AND INTEGRATORS CONNECT", M, st.y + 19);
    doc.setFontSize(9); tc(GREY);
    doc.text("MARKET INSIGHTS", PW - M, st.y + 3, { align: "right" });
    doc.text("Brand Performance Report", PW - M, st.y + 15, { align: "right" });
    st.y += 28; fcol(ORANGE); doc.rect(M, st.y, CW, 3, "F"); st.y += 18;

    // Title + scope
    doc.setFont("helvetica", "bold"); doc.setFontSize(19); tc(DARK); doc.text(company, M, st.y + 6); st.y += 20;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); tc(GREY); doc.text("Market performance overview", M, st.y); st.y += 14;
    doc.setFontSize(8.5);
    const scopeLines: string[] = doc.splitTextToSize(scope + "   ·   Statuses: " + statuses, CW);
    doc.text(scopeLines, M, st.y); st.y += scopeLines.length * 11 + 8;

    // KPI cards
    const cards: [string, string, number][] = [
      ["Brand revenue", this.money(this.kpis.revenue), this.kpis.revenueYoY],
      ["Units sold", this.num(this.kpis.units), this.kpis.unitsYoY],
      ["Proposals", this.num(this.kpis.proposals), this.kpis.proposalsYoY],
      ["Active dealers", this.num(this.kpis.dealers), this.kpis.dealersYoY],
    ];
    const gap = 10, cwd = (CW - 3 * gap) / 4, chh = 50;
    ensure(chh + 6);
    cards.forEach((c, i) => {
      const x = M + i * (cwd + gap);
      sc([229, 229, 229]); doc.setLineWidth(0.7); doc.roundedRect(x, st.y, cwd, chh, 4, 4, "S");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); tc(GREY); doc.text(c[0].toUpperCase(), x + 8, st.y + 14);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); tc(DARK); doc.text(clip(c[1], cwd - 14), x + 8, st.y + 32);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); tc(c[2] >= 0 ? GREEN : RED); doc.text((c[2] >= 0 ? "+" : "-") + Math.abs(c[2]) + "% YoY", x + 8, st.y + 44);
    });
    st.y += chh + 20;

    const h2 = (t: string) => { ensure(30); sc([238, 238, 238]); doc.setLineWidth(0.7); doc.line(M, st.y, M + CW, st.y); st.y += 15; doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); tc(DARK); doc.text(t, M, st.y); st.y += 12; };

    // Multi-line chart (competitive index)
    const drawMulti = (series: MultiSeries[], axis: string[]) => {
      const live = series.filter((s) => s.values && s.values.length);
      if (!live.length || !axis.length) return;
      const H = 160, padL = 46, padR = 12, padT = 8, padB = 20, iw = CW - padL - padR, ih = H - padT - padB;
      ensure(H + 18); const x0 = M, y0 = st.y;
      const n = axis.length, max = Math.max(1, ...live.flatMap((s) => s.values.filter((v) => v != null)));
      const X = (i: number) => x0 + padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const Y = (v: number) => y0 + padT + ih - (Math.max(0, v || 0) / max) * ih;
      sc(GRID); doc.setLineWidth(0.5); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); tc(GREY);
      [0, 0.25, 0.5, 0.75, 1].forEach((g) => { const gy = y0 + padT + ih - g * ih; doc.line(x0 + padL, gy, x0 + padL + iw, gy); doc.text((Math.round(g * max * 10) / 10) + "%", x0 + padL - 3, gy + 2, { align: "right" }); });
      live.forEach((s) => {
        const rgb = hexRgb(s.color); sc(rgb); doc.setLineWidth(1.4);
        for (let i = 1; i < s.values.length; i++) doc.line(X(i - 1), Y(s.values[i - 1]), X(i), Y(s.values[i]));
        fcol(rgb); s.values.forEach((v, i) => doc.circle(X(i), Y(v), n <= 3 ? 2.4 : 1.5, "F"));
      });
      tc(GREY); doc.setFontSize(6.5);
      const idx = n <= 2 ? axis.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
      idx.forEach((i) => doc.text(clip(axis[i], 60), X(i), y0 + H - 6, { align: "center" }));
      st.y = y0 + H;
      ensure(16); let lx = M; doc.setFontSize(7.5);
      live.slice(0, 8).forEach((s) => { const rgb = hexRgb(s.color); fcol(rgb); doc.rect(lx, st.y - 4, 9, 3.5, "F"); tc(DARK); doc.text(s.label, lx + 12, st.y); lx += 12 + doc.getTextWidth(s.label) + 14; if (lx > M + CW - 90) { st.y += 12; lx = M; } });
      st.y += 16;
    };

    // Dual-axis chart (category vs brand)
    const drawDual = (points: DualPoint[], vfmt: "money" | "pct" | "num", showBrand: boolean) => {
      if (!points || !points.length) return;
      const H = 160, padL = 52, padR = showBrand ? 52 : 14, padT = 8, padB = 20, iw = CW - padL - padR, ih = H - padT - padB;
      ensure(H + 18); const x0 = M, y0 = st.y;
      const n = points.length, catMax = Math.max(1, ...points.map((p) => p.category)), brMax = Math.max(1, ...points.map((p) => p.brand));
      const X = (i: number) => x0 + padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const YC = (v: number) => y0 + padT + ih - (Math.max(0, v || 0) / catMax) * ih;
      const YB = (v: number) => y0 + padT + ih - (Math.max(0, v || 0) / brMax) * ih;
      const fmt = (v: number) => vfmt === "money" ? this.money(v) : vfmt === "pct" ? (Math.round(v * 10) / 10) + "%" : this.num(v);
      sc(GRID); doc.setLineWidth(0.5); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      [0, 0.25, 0.5, 0.75, 1].forEach((g) => {
        const gy = y0 + padT + ih - g * ih; doc.line(x0 + padL, gy, x0 + padL + iw, gy);
        tc(DARK); doc.text(fmt(g * catMax), x0 + padL - 3, gy + 2, { align: "right" });
        if (showBrand) { tc(ORANGE); doc.text(fmt(g * brMax), x0 + padL + iw + 3, gy + 2, { align: "left" }); }
      });
      sc(DARK); doc.setLineWidth(1.4);
      for (let i = 1; i < n; i++) doc.line(X(i - 1), YC(points[i - 1].category), X(i), YC(points[i].category));
      fcol(DARK); points.forEach((p, i) => doc.circle(X(i), YC(p.category), n <= 3 ? 2.4 : 1.5, "F"));
      if (showBrand) {
        sc(ORANGE); doc.setLineWidth(1.6); doc.setLineDashPattern([4, 3], 0);
        for (let i = 1; i < n; i++) doc.line(X(i - 1), YB(points[i - 1].brand), X(i), YB(points[i].brand));
        doc.setLineDashPattern([], 0); fcol(ORANGE); points.forEach((p, i) => doc.circle(X(i), YB(p.brand), n <= 3 ? 2.4 : 1.5, "F"));
      }
      tc(GREY); doc.setFontSize(6.5);
      const idx = n <= 2 ? points.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
      idx.forEach((i) => doc.text(clip(points[i].label, 60), X(i), y0 + H - 6, { align: "center" }));
      st.y = y0 + H;
      ensure(16); let lx = M; doc.setFontSize(7.5);
      fcol(DARK); doc.rect(lx, st.y - 4, 9, 3.5, "F"); tc(DARK); doc.text("Category", lx + 12, st.y); lx += 12 + doc.getTextWidth("Category") + 16;
      if (showBrand) { fcol(ORANGE); doc.rect(lx, st.y - 4, 9, 3.5, "F"); tc(DARK); doc.text(brandLabel + " (right axis)", lx + 12, st.y); }
      st.y += 16;
    };

    type Col = { t: string; w: number; r?: boolean };
    const table = (cols: Col[], rows: string[][], meRow?: (i: number) => boolean) => {
      const headH = 18, rowH = 15;
      const head = () => { fcol([247, 247, 248]); doc.rect(M, st.y, CW, headH, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); tc(GREY); let x = M; cols.forEach((c) => { doc.text(c.t, c.r ? x + c.w - 4 : x + 4, st.y + 12, { align: c.r ? "right" : "left" }); x += c.w; }); st.y += headH; };
      ensure(headH + rowH * 2); head();
      rows.forEach((r, ri) => {
        if (st.y + rowH > PH - M - 24) { doc.addPage(); st.y = M; head(); }
        const me = !!(meRow && meRow(ri));
        if (me) { fcol([255, 241, 234]); doc.rect(M, st.y, CW, rowH, "F"); }
        doc.setFont("helvetica", me ? "bold" : "normal"); doc.setFontSize(7.5); tc(DARK);
        let x = M; cols.forEach((c, ci) => { doc.text(clip(r[ci], c.w - 8), c.r ? x + c.w - 4 : x + 4, st.y + 10, { align: c.r ? "right" : "left" }); x += c.w; });
        sc([240, 240, 240]); doc.setLineWidth(0.4); doc.line(M, st.y + rowH, M + CW, st.y + rowH); st.y += rowH;
      });
      st.y += 8;
    };

    // ===== Body =====
    if (this.compSeries.some((s) => s.values && s.values.length)) { h2("Competitive index — share of category"); drawMulti(this.compSeries, this.compAxis); }

    h2("Category share by brand");
    table(
      [{ t: "#", w: 24 }, { t: "Brand", w: CW - 24 - 100 - 78 - 70 - 60 }, { t: "Total sales", w: 100, r: true }, { t: "$ share", w: 78, r: true }, { t: "Units", w: 70, r: true }, { t: "SKUs", w: 60, r: true }],
      this.brandRows.slice(0, 12).map((r, i) => [String(i + 1), r.brand, this.cur(r.sales), this.pct(r.sharePct / 100), this.num(r.units), this.num(r.skus)]),
      (i) => !!this.brandRows[i] && this.brandRows[i].brand === this.viewAs,
    );

    h2("Top items");
    table(
      [{ t: "Brand", w: 120 }, { t: "Model", w: CW - 120 - 110 - 100 }, { t: "Total sales", w: 110, r: true }, { t: "$ share", w: 100, r: true }],
      this.itemRows.slice(0, 10).map((r) => [r.brand, r.model, this.cur(r.sales), this.pct(r.sharePct / 100)]),
      (i) => !!this.itemRows[i] && this.itemRows[i].brand === this.viewAs,
    );

    const subV = this.submitted[0], accV = this.accepted[0];
    if (subV || accV) {
      h2("Proposal trends");
      if (subV) { ensure(14); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); tc(DARK); doc.text("Category value on submitted proposals", M, st.y); st.y += 10; drawDual(subV.points, subV.vfmt, subV.hasBrand); }
      if (accV) { ensure(14); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); tc(DARK); doc.text("Accepted & completed proposals", M, st.y); st.y += 10; drawDual(accV.points, accV.vfmt, accV.hasBrand); }
    }

    h2("Competitive displacement");
    const colW = (CW - 20) / 2;
    const wonLines = this.won.slice(0, 6).map((d) => "•  " + d.model + " — " + this.num(d.units) + " units, " + this.cur(d.sales) + " (beat " + d.competitorsBeaten + ")");
    const lostLines = this.lost.slice(0, 6).map((d) => "•  " + d.model + " — " + this.num(d.lostUnits) + " units lost");
    if (!wonLines.length) wonLines.push("None in the selected range");
    if (!lostLines.length) lostLines.push("None in the selected range");
    ensure(24 + Math.max(wonLines.length, lostLines.length) * 11);
    const dy = st.y;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); tc(GREEN); doc.text("Business won — competitors displaced", M, dy);
    tc(RED); doc.text("Business lost — you were displaced", M + colW + 20, dy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); tc(DARK);
    let wy = dy + 13; wonLines.forEach((l) => { const ls: string[] = doc.splitTextToSize(l, colW); doc.text(ls, M, wy); wy += ls.length * 10; });
    let ly = dy + 13; lostLines.forEach((l) => { const ls: string[] = doc.splitTextToSize(l, colW); doc.text(ls, M + colW + 20, ly); ly += ls.length * 10; });
    st.y = Math.max(wy, ly) + 8;

    // Footer (page numbers) on every page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7); tc([170, 170, 170]);
      doc.text("Generated " + date + "   ·   " + company + "   ·   " + this.session.name + "   ·   Portal.io", M, PH - 18);
      doc.text("Page " + p + " of " + pages, PW - M, PH - 18, { align: "right" });
    }

    return doc.output("blob");
  }

  money(n: number): string { if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B"; if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k"; return "$" + Math.round(n); }
  cur(n: number): string { return "$" + Math.round(n).toLocaleString("en-US"); }
  num(n: number): string { return Math.round(n).toLocaleString("en-US"); }
  pct(fr: number): string { return (fr * 100).toFixed(2) + "%"; }
  yoyStr(v: number): string { return (v >= 0 ? "▲ " : "▼ ") + Math.abs(v) + "%"; }
  dcol(v: number): string { return v >= 0 ? "var(--positive)" : "var(--negative)"; }
}
