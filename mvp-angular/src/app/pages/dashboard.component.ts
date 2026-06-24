import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
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
import { WidgetToolsComponent } from "../components/widget-tools.component";
import { PORTAL_WORDMARK_DATA_URI } from "../core/report-logo";
import { SubscriptionService } from "../core/subscription.service";

interface Widget { title: string; value: string; yoy: number; points: DualPoint[]; hasBrand: boolean; vfmt: "money" | "pct" | "num"; ylabel: string; }

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, FormsModule, TrendChartComponent, DualLineChartComponent, MultiLineChartComponent, MultiSelectComponent, WidgetToolsComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>{{ title }}</h1><p>Category performance across the Portal network. <span class="muted" *ngIf="viewAs !== 'admin'">· {{ viewAs }}</span></p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="badge-sample">{{ dataMode === 'api' ? 'LIVE DATA' : 'SAMPLE DATA' }}</span>
        <button class="pbtn" [class.primary]="subscribed" (click)="toggleSub()">{{ subscribed ? "Subscribed" : "Subscribe" }}</button>
        <button *ngIf="can('Export CSV')" class="pbtn" [disabled]="csvBusy" (click)="exportCsv()">{{ csvBusy ? "Preparing…" : "⬇ Export CSV" }}</button>
        <button *ngIf="can('Pull reports')" class="pbtn" [disabled]="pdfBusy" (click)="pull()">{{ pdfBusy ? "Preparing…" : "Pull report" }}</button>
      </div>
    </div>

    <div class="filterbar" style="align-items:flex-end">
      <div class="filt" *ngIf="can('Brands')" style="position:relative"><label>Brand <span class="muted" style="font-weight:400">— type to find one; blank = all brands</span></label>
        <input class="minput" [placeholder]="viewAs === 'admin' ? 'All brands' : viewAs" [(ngModel)]="brandQuery" />
        <div class="suggest" *ngIf="brandSuggest.length"><div class="sg" *ngFor="let b of brandSuggest" (click)="setBrand(b); brandQuery=''">{{ b }}</div></div>
        <div *ngIf="viewAs !== 'admin'" class="chips" style="margin-top:4px"><span class="chip on" (click)="setBrand('admin'); brandQuery=''">{{ viewAs }} ✕</span></div>
      </div>
      <div class="filt" *ngIf="can('Aggregation')"><label>Aggregation</label>
        <div class="tgl">
          <button *ngFor="let a of aggs" [class.on]="agg === a" (click)="agg = a; rebuild()">{{ a | titlecase }}</button>
        </div>
      </div>
      <div class="filt" *ngIf="can('Date Range')"><label>Date Range</label>
        <div class="tgl">
          <button *ngFor="let h of horizons" [class.on]="horizon === h" (click)="setHorizon(h)">{{ h }}</button>
        </div>
      </div>
      <div class="filt" *ngIf="horizon === 'Custom' && can('Date Range')"><label>From</label>
        <input class="minput" type="date" [value]="fromDate" [min]="minDate" [max]="toDate || today" (change)="onFrom($any($event.target).value)" />
      </div>
      <div class="filt" *ngIf="horizon === 'Custom' && can('Date Range')"><label>To</label>
        <input class="minput" type="date" [value]="toDate" [min]="fromDate || minDate" [max]="today" (change)="onTo($any($event.target).value)" />
      </div>
      <app-multiselect *ngIf="can('Parent Category')" label="Parent category" allLabel="All categories" [options]="parentOptions" [selected]="parents" (selectedChange)="onParents($event)"></app-multiselect>
      <app-multiselect *ngIf="can('Subcategory')" label="Sub-category" allLabel="All sub-categories" [options]="subOptions" [selected]="subs" (selectedChange)="subs = $event; rebuild()"></app-multiselect>
      <app-multiselect *ngIf="can('Buying Group')" label="Buying group" [allLabel]="dataMode === 'api' ? 'Not mapped yet' : 'All buying groups'" [disabled]="dataMode === 'api'" [search]="false" [options]="buyingGroupOptions" [selected]="buyingGroups" (selectedChange)="buyingGroups = $event; rebuild()"></app-multiselect>
      <app-multiselect *ngIf="can('Supplier')" label="Supplier" [allLabel]="dataMode === 'api' ? 'Not mapped yet' : 'All suppliers'" [disabled]="dataMode === 'api'" [search]="false" [options]="supplierOptions" [selected]="suppliers" (selectedChange)="suppliers = $event; rebuild()"></app-multiselect>
      <app-multiselect *ngIf="can('State')" label="State" allLabel="All states" [options]="stateOptions" [labels]="stateLabels" [selected]="states" (selectedChange)="states = $event; rebuild()"></app-multiselect>
      <app-multiselect *ngIf="dataMode === 'api' && can('Proposal Status')" label="Proposal status" allLabel="All statuses" [search]="false" [sort]="false" [options]="statusOptions" [selected]="statuses" (selectedChange)="statuses = $event; rebuild()"></app-multiselect>
      <div class="filt"><label>Normalize data <span class="info-i" title="Shows only dealers active in both the selected window and the same window a year earlier — for a true year-over-year comparison.">&#9432;</span></label>
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
      <div class="pcard kpi"><div class="label">{{ viewAs === 'admin' ? 'Revenue' : 'Brand Revenue' }} <span class="info-i" title="Total revenue at retail for selected filters">&#9432;</span></div><div class="value">{{ money(kpis.revenue) }}</div><div class="delta" [style.color]="dcol(kpis.revenueYoY)">{{ yoyStr(kpis.revenueYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Units Sold <span class="info-i" title="Count of units sold for selected filters">&#9432;</span></div><div class="value">{{ num(kpis.units) }}</div><div class="delta" [style.color]="dcol(kpis.unitsYoY)">{{ yoyStr(kpis.unitsYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Number of Proposals <span class="info-i" title="Count of unique proposals for selected filters">&#9432;</span></div><div class="value">{{ num(kpis.proposals) }}</div><div class="delta" [style.color]="dcol(kpis.proposalsYoY)">{{ yoyStr(kpis.proposalsYoY) }} YoY</div></div>
      <div class="pcard kpi"><div class="label">Active Dealers <span class="info-i" [title]="'Unique dealers selling at least 1 product from ' + (focusBrand && focusBrand !== 'admin' ? focusBrand : 'the brand') + ' for selected filters'">&#9432;</span></div><div class="value">{{ num(kpis.dealers) }}</div><div class="delta" [style.color]="dcol(kpis.dealersYoY)">{{ yoyStr(kpis.dealersYoY) }} YoY</div></div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div><div class="t">Revenue — period over period</div><app-widget-tools [chart]="true" [filename]="widgetFile('pop')" (csvOut)="widgetCsv('pop')"></app-widget-tools><div class="s">{{ horizon }} vs. the same period last year · by {{ agg }}</div></div>
        <div style="display:flex;gap:16px;align-items:center;flex:0 0 auto">
          <div style="text-align:right"><div style="font-size:20px;font-weight:600">{{ money(kpis.revenue) }}</div><div class="muted" style="font-size:12px">this period</div></div>
          <div class="delta" [style.color]="dcol(kpis.revenueYoY)" style="font-size:14px">{{ yoyStr(kpis.revenueYoY) }} YoY</div>
        </div>
      </div>
      <div class="bd">
        <div style="display:flex;gap:18px;font-size:12px;color:var(--text-muted);margin-bottom:8px">
          <span><span style="display:inline-block;width:14px;border-top:3px solid #ff5000;vertical-align:middle"></span> This period</span>
          <span><span style="display:inline-block;width:14px;border-top:3px solid #8a8a82;vertical-align:middle"></span> Same period last year</span>
        </div>
        <app-multiline [series]="popSeries" [axis]="popAxis" yLabel="Revenue ($)" xLabel="Period" valueFormat="money"></app-multiline>
      </div>
    </div>

    <div class="pcard" style="margin-bottom:16px">
      <div class="hd"><div class="t">Competitive index — brand share of category $ by {{ agg }}</div><app-widget-tools [chart]="true" [filename]="widgetFile('compindex')" (csvOut)="widgetCsv('compindex')"></app-widget-tools><div class="s">Share is calculated against the <b>total</b> selected category. Toggle brands to compare; top 10 shown by default.</div></div>
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
      <div class="hd"><div class="t">Category Share by Brand</div><app-widget-tools [filename]="widgetFile('brandshare')" (csvOut)="widgetCsv('brandshare')"></app-widget-tools><div class="s">Every brand matching the filters</div></div>
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
      <div class="hd"><div class="t">Category Share by Item</div><app-widget-tools [filename]="widgetFile('item')" (csvOut)="widgetCsv('item')"></app-widget-tools><div class="s">Every SKU matching the filters ({{ itemRows.length }})</div></div>
      <div class="bd" style="max-height:420px;overflow:auto">
        <table class="ptbl">
          <thead><tr><th>#</th><th>Brand</th><th>Model</th><th>Category</th><th class="num">Total Sales</th><th class="num">$ Share %</th><th class="num"># Units</th><th class="num">Avg Sell $</th></tr></thead>
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
      <div class="hd"><div class="t">Sub-Category Sales Breakdown</div><app-widget-tools [filename]="widgetFile('subcat')" (csvOut)="widgetCsv('subcat')"></app-widget-tools></div>
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
        <app-widget-tools [chart]="true" [filename]="dlName(w.title)" (csvOut)="dualCsv(w)"></app-widget-tools>
        <div class="hd"><div class="t">{{ w.title }}</div><div class="s"><b style="font-size:18px;color:var(--text)">{{ w.value }}</b> <span [style.color]="w.yoy >= 0 ? 'var(--positive)' : 'var(--negative)'">▲ {{ w.yoy }}%</span> YoY</div></div>
        <div class="bd"><app-dual [points]="w.points" [showBrand]="w.hasBrand" [brandLabel]="focusBrand" [valueFormat]="w.vfmt" [yLabel]="w.ylabel" xLabel="Month"></app-dual></div>
      </div>
    </div>

    <h2 *ngIf="accepted.length" style="font-size:17px;margin:22px 0 12px;border-top:1px solid var(--border);padding-top:18px">Accepted &amp; Completed proposals</h2>
    <div class="grid c2" *ngIf="accepted.length">
      <div class="pcard span2" *ngFor="let w of accepted">
        <app-widget-tools [chart]="true" [filename]="dlName(w.title)" (csvOut)="dualCsv(w)"></app-widget-tools>
        <div class="hd"><div class="t">{{ w.title }}</div><div class="s"><b style="font-size:18px;color:var(--text)">{{ w.value }}</b> <span [style.color]="w.yoy >= 0 ? 'var(--positive)' : 'var(--negative)'">▲ {{ w.yoy }}%</span> YoY</div></div>
        <div class="bd"><app-dual [points]="w.points" [showBrand]="w.hasBrand" [brandLabel]="focusBrand" [valueFormat]="w.vfmt" [yLabel]="w.ylabel" xLabel="Month"></app-dual></div>
      </div>
    </div>

    <h2 *ngIf="(won.length || lost.length) && (!isAdmin || viewAs !== 'admin')" style="font-size:17px;margin:22px 0 12px;border-top:1px solid var(--border);padding-top:18px">Competitive displacement</h2>
    <div class="grid c2" style="align-items:start" *ngIf="(won.length || lost.length) && (!isAdmin || viewAs !== 'admin')">
      <div class="pcard">
        <div class="hd"><div class="t" style="color:var(--positive)">Business won — competitors displaced</div><app-widget-tools [filename]="widgetFile('won')" (csvOut)="widgetCsv('won')"></app-widget-tools><div class="s">Line items where {{ focusBrand }} replaced a competitor</div></div>
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
        <div class="hd"><div class="t" style="color:var(--negative)">Business lost — you were displaced</div><app-widget-tools [filename]="widgetFile('lost')" (csvOut)="widgetCsv('lost')"></app-widget-tools><div class="s">Click an item to see the SKUs that displaced it, ranked by units</div></div>
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

    <div *ngIf="!isAdmin" class="pcard" style="margin-top:16px;margin-bottom:16px">
      <div class="hd" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div><div class="t">Dealers specifying {{ ownBrand }} - last 30 days</div><app-widget-tools [filename]="widgetFile('dealers')" (csvOut)="widgetCsv('dealers')"></app-widget-tools><div class="s">Not affected by filters</div></div>
        <div style="display:flex;gap:18px;flex:0 0 auto;text-align:right">
          <div><div style="font-size:20px;font-weight:600">{{ specDealers.count }}</div><div class="muted" style="font-size:12px">dealers</div></div>
          <div><div style="font-size:20px;font-weight:600;color:var(--positive)">{{ specDealers.newCount }}</div><div class="muted" style="font-size:12px">new</div></div>
        </div>
      </div>
      <div class="bd" style="max-height:380px;overflow:auto">
        <div *ngIf="!specDealers.count" class="muted" style="font-size:13px">No dealers specified {{ ownBrand }} in the last 30 days.</div>
        <table class="ptbl" *ngIf="specDealers.count" style="table-layout:fixed;width:100%">
          <thead><tr><th class="sort" (click)="sortDealers('name')" style="cursor:pointer">Dealer {{ dealerArrow('name') }}</th><th class="sort" (click)="sortDealers('state')" style="cursor:pointer">State {{ dealerArrow('state') }}</th><th class="sort" (click)="sortDealers('new')" style="cursor:pointer">New {{ dealerArrow('new') }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let d of sortedDealers">
              <td style="font-weight:600">{{ d.name }}</td>
              <td class="muted">{{ d.state || '—' }}</td>
              <td><span *ngIf="d.isNew" style="font-size:11px;color:var(--positive);border:1px solid var(--positive);border-radius:4px;padding:0 6px">New</span></td>
            </tr>
          </tbody>
        </table>
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
  private subSvc = inject(SubscriptionService);

  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  title = "Brand Performance Overview";
  allBrands = this.va.listCompanies().map((c) => c.name).sort((a, b) => a.localeCompare(b));
  aggs = ["daily", "weekly", "monthly", "quarterly"];
  horizons = ["MTD", "QTD", "YTD", "Custom"];
  today = new Date().toISOString().slice(0, 10);
  minDate = "2022-01-01";
  buyingGroupOptions = this.an.buyingGroups;
  supplierOptions = ["ADI Global", "Snap One", "Capitol Sales", "DOW Electronics", "Wave Electronics", "AVAD"]; // sample distributors (synthetic mode); live = unmapped (fact table has supplierid only)
  get stateOptions(): string[] { return this.an.states; }
  get stateLabels(): Record<string, string> { return this.an.stateLabels; }
  get statusOptions(): string[] { return this.an.statusList; }  // live from /api/meta; auto-discovers new statuses
  restrictParents: string[] = [];

  viewAs = "admin";
  ownBrand = "";   // the vendor's own brand (locked target for their competitive widgets)
  brandQuery = ""; // type-ahead text for the Brand filter
  specDealers: { count: number; newCount: number; dealers: { name: string; city: string; state: string; isNew: boolean }[] } = { count: 0, newCount: 0, dealers: [] };  // vendor-only, filter-independent
  dealerSort: "name" | "state" | "new" = "new";
  dealerDir = -1;
  agg = "monthly";
  horizon = "YTD";
  fromDate = "";
  toDate = "";
  normalize = false;
  parents: string[] = [];
  subs: string[] = [];
  buyingGroups: string[] = [];
  suppliers: string[] = [];
  states: string[] = [];
  readonly defaultStatuses = ["Accepted", "Completed", "Submitted"];
  statuses: string[] = [...this.defaultStatuses];
  dashId = "overview";
  get subscribed(): boolean { return this.subSvc.isSubscribed(this.dashId); }

  brandRows: BrandShareRow[] = [];
  itemRows: ItemRow[] = [];
  subcatRows: SubcatRow[] = [];
  compRows: BrandShareRow[] = [];
  compSeries: MultiSeries[] = [];
  compAxis: string[] = [];
  popSeries: MultiSeries[] = [];
  popAxis: string[] = [];
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

  async ngOnInit(): Promise<void> {
    await this.an.ready();
    const id = this.route.snapshot.paramMap.get("id") || "overview";
    this.dashId = id;
    this.title = (DASHBOARDS.find((d) => d.id === id)?.name || "Brand Performance Overview");
    if (!this.isAdmin) {
      this.viewAs = this.data.getVendor(this.session.vendorId || "")?.name || this.allBrands[0];
      this.ownBrand = this.viewAs;
      this.restrictParents = this.session.allowedParents ?? this.va.getUser(this.session.email)?.parents ?? [];
    }
    // Subscription gate FIRST: if the vendor isn't active, never fetch — the shell's lock screen covers the page,
    // and skipping the load is what stops any data from rendering/flashing behind it.
    if (this.locked) { this.loading = false; this.firstLoad = false; return; }
    this.selectAllCats();
    this.rebuild(true);
    if (!this.isAdmin) this.src.dealersSpeccing(this.ownBrand).then((d) => (this.specDealers = d)).catch(() => {});
  }

  get parentOptions(): string[] { return this.an.visibleParentsFor(this.viewAs, this.restrictParents, this.dataMode === "api"); }
  /** Subscription gate, same source of truth as the shell (auth.subStatus + synthetic-mode fallback). When true
   *  the vendor's window isn't active, so ngOnInit skips every fetch and the shell shows the lock screen. */
  get locked(): boolean {
    if (this.isAdmin) return false;
    const st = this.auth.subStatus();
    const eff = st === "none" ? this.va.statusOf(this.session.email) : st;
    return eff !== "active";
  }
  /** Brand the per-brand widgets (displacement / funnel brand line) represent: focal for admins, own brand for vendors. */
  get focusBrand(): string { return this.isAdmin ? this.viewAs : this.ownBrand; }
  /** Per-user control visibility (USER_PERMISSIONS keys). Admins see every control; for a vendor a perm
   *  explicitly set to false hides that control. Unset or true = visible. */
  get userPerms(): Record<string, boolean> { return this.session.perms ?? {}; }
  can(p: string): boolean { return this.isAdmin || this.userPerms[p] !== false; }

  private readonly WIDGET_LABELS: Record<string, string> = { pop: "Revenue Period over Period", compindex: "Competitive Index", brandshare: "Category Share by Brand", item: "Category Share by Item", subcat: "Sub-Category Breakdown", won: "Business Won", lost: "Business Lost", dealers: "Dealers Specifying" };
  /** Standard download filename (no extension), matching the main exports: "Portal Market Insights - <what> - <brand> - <user> <date>". */
  dlName(descriptor: string): string {
    const brand = this.viewAs === "admin" ? "All brands" : this.viewAs;
    const user = (this.session.name || this.session.email || "").trim();
    const date = new Date().toISOString().slice(0, 10);
    return ("Portal Market Insights - " + descriptor + " - " + brand + (user ? " - " + user : "") + " " + date).replace(/[\\/:*?"<>|]/g, "-");
  }
  widgetFile(which: string): string { return this.dlName(this.WIDGET_LABELS[which] || which); }

  /** Per-widget data export (CSV, same UTF-8 BOM style as the main export). */
  widgetCsv(which: string): void {
    if (which === "pop") {
      const headers = ["Period", ...this.popSeries.map((s) => s.label)];
      const rows = this.popAxis.map((lbl, i) => [lbl, ...this.popSeries.map((s) => s.values[i] ?? "")] as any[]);
      return this.downloadCsvFile(this.widgetFile("pop"), headers, rows);
    }
    const map: Record<string, any[]> = {
      compindex: this.compRows, brandshare: this.brandRows, item: this.itemRows,
      subcat: this.subcatRows, won: this.won, lost: this.lost, dealers: this.specDealers.dealers,
    };
    const arr = map[which] || [];
    if (!arr.length) return this.downloadCsvFile(this.widgetFile(which), ["(no data)"], []);
    const headers = Object.keys(arr[0]).filter((k) => typeof (arr[0] as any)[k] !== "object");
    const rows = arr.map((o: any) => headers.map((h) => o[h]));
    this.downloadCsvFile(this.widgetFile(which), headers, rows);
  }
  /** CSV for a proposal-funnel chart widget (Submitted / Accepted) — exports its plotted points. */
  dualCsv(w: Widget): void {
    const arr = w.points || [];
    const name = this.dlName(w.title || "Proposal chart");
    if (!arr.length) return this.downloadCsvFile(name, ["(no data)"], []);
    const headers = Object.keys(arr[0]).filter((k) => typeof (arr[0] as any)[k] !== "object");
    const rows = arr.map((o: any) => headers.map((h) => (o as any)[h]));
    this.downloadCsvFile(name, headers, rows);
  }
  private downloadCsvFile(name: string, headers: string[], rows: any[][]): void {
    const esc = (v: any) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = "﻿" + [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** Brands this user may focus: their visible-brands allow-list if set, else every Portal brand. Admins = all. */
  get brandUniverse(): string[] { const a = this.session.allowedBrands ?? []; return a.length ? this.an.brandList.filter((b) => a.includes(b)) : this.an.brandList; }
  /** Live brand suggestions (within the user's allowed brands) that START WITH what's typed; capped for the dropdown. */
  get brandSuggest(): string[] { const q = this.brandQuery.toLowerCase().trim(); return q ? this.brandUniverse.filter((b) => b.toLowerCase().startsWith(q)).slice(0, 8) : []; }
  get sortedDealers(): { name: string; city: string; state: string; isNew: boolean }[] {
    const k = this.dealerSort, d = this.dealerDir;
    return [...this.specDealers.dealers].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (k === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === "state") { av = (a.state || "").toLowerCase(); bv = (b.state || "").toLowerCase(); }
      else { av = a.isNew ? 1 : 0; bv = b.isNew ? 1 : 0; }
      return av < bv ? -d : av > bv ? d : 0;
    });
  }
  sortDealers(k: "name" | "state" | "new"): void { if (this.dealerSort === k) this.dealerDir *= -1; else { this.dealerSort = k; this.dealerDir = k === "new" ? -1 : 1; } }
  dealerArrow(k: "name" | "state" | "new"): string { return this.dealerSort === k ? (this.dealerDir > 0 ? "▲" : "▼") : ""; }
  get subOptions(): string[] { return this.parents.length ? this.an.subsForParents(this.parents) : []; }

  /** Pre-select every category/sub-category the user is allowed to see (so nothing looks hidden). */
  private selectAllCats(): void { this.parents = [...this.parentOptions]; this.subs = [...this.subOptions]; }

  private filter(): AFilter {
    const custom = this.horizon === "Custom";
    // When all (or none) are selected, send empty lists: the server already scopes to the user's
    // allowed categories, and an empty filter is far cheaper than a giant IN(...) clause (avoids 504s).
    const allP = this.parentOptions.length, allS = this.subOptions.length;
    const parents = this.parents.length && this.parents.length < allP ? this.parents : [];
    const subs = this.subs.length && this.subs.length < allS ? this.subs : [];
    return { brand: this.viewAs, parents, subs, buyingGroups: this.buyingGroups, suppliers: this.suppliers, states: this.states, statuses: this.statuses, normalize: this.normalize, agg: this.agg, horizon: this.horizon, from: custom ? this.fromDate : "", to: custom ? this.toDate : "" };
  }
  /** Date Range presets vs custom calendar. Switching to Custom seeds sensible dates (Jan 1 → today). */
  setHorizon(h: string): void {
    this.horizon = h;
    if (h === "Custom") {
      if (!this.fromDate) this.fromDate = this.today.slice(0, 4) + "-01-01";
      if (!this.toDate) this.toDate = this.today;
    }
    this.rebuild();
  }
  onFrom(v: string): void { this.fromDate = v && v < this.minDate ? this.minDate : v; if (this.fromDate && this.toDate) this.rebuild(); }
  onTo(v: string): void { this.toDate = v && v < this.minDate ? this.minDate : v; if (this.fromDate && this.toDate) this.rebuild(); }
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
      this.popAxis = p.revByPeriod.labels;
      this.popSeries = [
        { label: "This period", values: p.revByPeriod.values, color: "#ff5000" },
        { label: "Same period last year", values: p.revByPeriod.prior, color: "#8a8a82" },
      ];
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

  onParents(v: string[]): void { this.parents = v; this.subs = [...this.subOptions]; this.rebuild(); }
  setBrand(v: string): void { this.viewAs = v; this.rebuild(true); }
  reset(): void { this.buyingGroups = []; this.suppliers = []; this.states = []; this.statuses = [...this.defaultStatuses]; this.normalize = false; this.agg = "monthly"; this.horizon = "YTD"; this.fromDate = ""; this.toDate = ""; this.selectAllCats(); this.rebuild(true); }
  toggleSub(): void { this.subSvc.toggle(this.dashId); }
  toggleLost(model: string): void { this.expandedLost = this.expandedLost === model ? null : model; }
  publish(): void { alert("Publish this dashboard by subscribing companies (admin). You can target specific companies or All. To be fleshed out."); }

  /**
   * BY-PROPOSAL line-item export. In live (api) mode it pulls one row per proposal line item for
   * every brand matching the applied category/state/status filters + Date Range, straight from
   * Redshift (UTF-8 BOM included so Excel opens it clean). In sample mode it falls back to the
   * item-level summary the synthetic generator can produce.
   */
  async exportCsv(): Promise<void> {
    const fname = this.dlName("by proposal") + ".csv";
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
      const { html, header, footer } = this.buildReportHtml();
      const blob = await this.src.renderPdf({ html, header, footer });
      const fname = this.dlName("Report") + ".pdf";
      this.dl.request({ kind: "pdf", filename: fname, blobData: blob });
    } catch (e: any) {
      this.loadError = "Couldn't build the report PDF: " + ((e && e.message) || e);
    } finally {
      this.pdfBusy = false;
    }
  }

  private esc(s: any): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  private axvHtml(v: number, f: "money" | "pct" | "num"): string { return f === "money" ? this.money(v) : f === "pct" ? (Math.round(v * 10) / 10) + "%" : this.num(v); }

  /** Competitive index multi-line chart as inline SVG (renders identically in any HTML->PDF engine). */
  private svgMulti(series: MultiSeries[], axis: string[]): string {
    const GREY = "#8A8A8A";
    const live = series.filter((s) => s.values && s.values.length);
    if (!live.length || !axis.length) return "";
    const W = 1000, H = 300, padL = 58, padR = 20, padT = 16, padB = 46, iw = W - padL - padR, ih = H - padT - padB;
    const n = axis.length, max = Math.max(1, ...live.flatMap((s) => s.values.filter((v) => v != null)));
    const X = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v: number) => padT + ih - (Math.max(0, v || 0) / max) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" font-family="Helvetica,Arial,sans-serif">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => { const gy = padT + ih - g * ih; s += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${padL + iw}" y2="${gy.toFixed(1)}" stroke="#ececef" stroke-width="1"/><text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="${GREY}">${this.axvHtml(g * max, "pct")}</text>`; });
    live.forEach((se) => { s += `<polyline points="${se.values.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2.4"/>`; se.values.forEach((v, i) => { s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${n <= 3 ? 4 : 2.6}" fill="${se.color}"/>`; }); });
    const idx = n <= 2 ? axis.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    idx.forEach((i) => { s += `<text x="${X(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="11" fill="${GREY}">${this.esc(axis[i])}</text>`; });
    s += "</svg>";
    const legend = `<div class="legend">` + live.slice(0, 10).map((se) => `<span class="lg"><span class="sw" style="background:${se.color}"></span>${this.esc(se.label)}</span>`).join("") + `</div>`;
    return `<div class="chart">${s}${legend}</div>`;
  }

  /** Proposal-trend dual-axis chart (category solid / brand dashed, right axis) as inline SVG. */
  private svgDual(points: DualPoint[], vfmt: "money" | "pct" | "num", showBrand: boolean): string {
    const ORANGE = "#F05622", DARK = "#27272A", GREY = "#8A8A8A";
    if (!points || !points.length) return "";
    const brandLabel = this.viewAs === "admin" ? "Viewed brand" : this.viewAs;
    const W = 1000, H = 300, padL = 66, padR = showBrand ? 66 : 20, padT = 16, padB = 46, iw = W - padL - padR, ih = H - padT - padB;
    const n = points.length, catMax = Math.max(1, ...points.map((p) => p.category)), brMax = Math.max(1, ...points.map((p) => p.brand));
    const X = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const YC = (v: number) => padT + ih - (Math.max(0, v || 0) / catMax) * ih;
    const YB = (v: number) => padT + ih - (Math.max(0, v || 0) / brMax) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" font-family="Helvetica,Arial,sans-serif">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => { const gy = padT + ih - g * ih; s += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${padL + iw}" y2="${gy.toFixed(1)}" stroke="#ececef" stroke-width="1"/><text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="${DARK}">${this.axvHtml(g * catMax, vfmt)}</text>` + (showBrand ? `<text x="${padL + iw + 6}" y="${(gy + 3).toFixed(1)}" text-anchor="start" font-size="11" fill="${ORANGE}">${this.axvHtml(g * brMax, vfmt)}</text>` : ""); });
    s += `<polyline points="${points.map((p, i) => X(i).toFixed(1) + "," + YC(p.category).toFixed(1)).join(" ")}" fill="none" stroke="${DARK}" stroke-width="2.4"/>`;
    points.forEach((p, i) => { s += `<circle cx="${X(i).toFixed(1)}" cy="${YC(p.category).toFixed(1)}" r="${n <= 3 ? 4 : 2.6}" fill="${DARK}"/>`; });
    if (showBrand) { s += `<polyline points="${points.map((p, i) => X(i).toFixed(1) + "," + YB(p.brand).toFixed(1)).join(" ")}" fill="none" stroke="${ORANGE}" stroke-width="2.6" stroke-dasharray="8 5"/>`; points.forEach((p, i) => { s += `<circle cx="${X(i).toFixed(1)}" cy="${YB(p.brand).toFixed(1)}" r="${n <= 3 ? 4 : 2.6}" fill="${ORANGE}"/>`; }); }
    const idx = n <= 2 ? points.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    idx.forEach((i) => { s += `<text x="${X(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="11" fill="${GREY}">${this.esc(points[i].label)}</text>`; });
    s += "</svg>";
    const legend = `<div class="legend"><span class="lg"><span class="sw" style="background:${DARK}"></span>Category</span>` + (showBrand ? `<span class="lg"><span class="sw" style="background:${ORANGE}"></span>${this.esc(brandLabel)} (right axis)</span>` : "") + `</div>`;
    return `<div class="chart">${s}${legend}</div>`;
  }

  /** Assemble the branded, renderer-agnostic report: static HTML + inline SVG, plus per-page
   *  header/footer templates. The same output renders under Chromium (now) or WeasyPrint/Gotenberg. */
  private buildReportHtml(): { html: string; header: string; footer: string } {
    const ORANGE = "#F05622", GREY = "#8A8A8A";
    const company = this.viewAs === "admin" ? "All companies" : this.viewAs;
    const statuses = this.dataMode === "api" ? (this.statuses.join(", ") || "All statuses") : "Sample data";
    const range = this.horizon === "Custom" ? (this.fromDate + " to " + this.toDate) : this.horizon;
    const scope = [range, this.parents.length ? this.parents.join(", ") : "All categories", this.states.length ? this.states.join(", ") : "All states"].map((x) => this.esc(x)).join("   &middot;   ") + "   &middot;   Statuses: " + this.esc(statuses);
    const date = new Date().toISOString().slice(0, 10);
    const kpiCard = (l: string, v: string, y: number) => `<div class="card"><div class="lbl">${l}</div><div class="big">${v}</div><div class="yoy" style="color:${y >= 0 ? "#1d9e75" : "#d85a30"}">${y >= 0 ? "+" : ""}${y}% YoY</div></div>`;
    const tbl = (cols: { t: string; r?: boolean }[], rows: any[][], meIdx?: (i: number) => boolean) => {
      let h = `<table><thead><tr>` + cols.map((c) => `<th class="${c.r ? "r" : ""}">${c.t}</th>`).join("") + `</tr></thead><tbody>`;
      rows.forEach((r, ri) => { h += `<tr${meIdx && meIdx(ri) ? ' class="me"' : ""}>` + r.map((cell, ci) => `<td class="${cols[ci].r ? "r" : ""}">${this.esc(cell)}</td>`).join("") + `</tr>`; });
      return h + `</tbody></table>`;
    };
    const section = (inner: string) => `<div class="section">${inner}</div>`;
    const logo = this.session.logo || "";
    const titleBlock = (logo && this.viewAs !== "admin")
      ? `<img src="${logo}" alt="${this.esc(company)}" style="height:40px;max-width:260px;object-fit:contain;display:block;margin-bottom:2px" />`
      : `<h1>${this.esc(company)}</h1>`;
    let body = `${titleBlock}<div class="sub">Market performance overview</div><div class="scope">${scope}</div>`;
    body += section(`<div class="cards">${kpiCard("Brand revenue", this.money(this.kpis.revenue), this.kpis.revenueYoY)}${kpiCard("Units sold", this.num(this.kpis.units), this.kpis.unitsYoY)}${kpiCard("Proposals", this.num(this.kpis.proposals), this.kpis.proposalsYoY)}${kpiCard("Active dealers", this.num(this.kpis.dealers), this.kpis.dealersYoY)}</div>`);
    if (this.compSeries.some((s) => s.values && s.values.length)) body += section(`<h2>Competitive index &mdash; share of category</h2>${this.svgMulti(this.compSeries, this.compAxis)}`);
    body += section(`<h2>Category share by brand</h2>` + tbl([{ t: "#" }, { t: "Brand" }, { t: "Total sales", r: true }, { t: "$ share", r: true }, { t: "Units", r: true }, { t: "SKUs", r: true }], this.brandRows.slice(0, 12).map((r, i) => [i + 1, r.brand, this.cur(r.sales), this.pct(r.sharePct / 100), this.num(r.units), this.num(r.skus)]), (i) => !!this.brandRows[i] && this.brandRows[i].brand === this.viewAs));
    body += section(`<h2>Top items</h2>` + tbl([{ t: "Brand" }, { t: "Model" }, { t: "Total sales", r: true }, { t: "$ share", r: true }], this.itemRows.slice(0, 10).map((r) => [r.brand, r.model, this.cur(r.sales), this.pct(r.sharePct / 100)]), (i) => !!this.itemRows[i] && this.itemRows[i].brand === this.viewAs));
    if (this.subcatRows.length) body += section(`<h2>Sub-category breakdown</h2>` + tbl([{ t: "Sub-category" }, { t: "Total sales", r: true }, { t: "$ % of cat", r: true }, { t: "Units", r: true }, { t: "Avg sell", r: true }], this.subcatRows.map((r) => [r.subcat, this.cur(r.sales), this.pct(r.pctOfCat / 100), this.num(r.units), this.cur(r.avgSell)])));
    if (this.submitted.length) { body += `<h2 class="grouphd">Category value on Submitted proposals</h2>`; this.submitted.forEach((w) => { body += section(`<div class="ct">${this.esc(w.title)}</div>${this.svgDual(w.points, w.vfmt, w.hasBrand)}`); }); }
    if (this.accepted.length) { body += `<h2 class="grouphd">Accepted &amp; Completed proposals</h2>`; this.accepted.forEach((w) => { body += section(`<div class="ct">${this.esc(w.title)}</div>${this.svgDual(w.points, w.vfmt, w.hasBrand)}`); }); }
    const wonHtml = this.won.length ? this.won.slice(0, 6).map((d) => `<li>${this.esc(d.model)} &mdash; ${this.num(d.units)} units, ${this.cur(d.sales)} (beat ${d.competitorsBeaten})</li>`).join("") : `<li class="muted">None in the selected range</li>`;
    const lostHtml = this.lost.length ? this.lost.slice(0, 6).map((d) => `<li>${this.esc(d.model)} &mdash; ${this.num(d.lostUnits)} units lost</li>`).join("") : `<li class="muted">None in the selected range</li>`;
    body += section(`<h2>Competitive displacement</h2><div class="two"><div><div class="cwon">Business won &mdash; competitors displaced</div><ul>${wonHtml}</ul></div><div><div class="clost">Business lost &mdash; you were displaced</div><ul>${lostHtml}</ul></div></div>`);
    const css = `*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#2b2b2b;margin:0;font-size:12px;line-height:1.45}`
      + `h1{font-size:26px;margin:4px 0 2px;color:#1f1f1f}.sub{color:${GREY};font-size:13px}.scope{color:${GREY};font-size:11px;margin:3px 0 14px}`
      + `h2{font-size:15px;color:#1f1f1f;margin:14px 0 8px;padding-bottom:5px;border-bottom:1px solid #E6E0DC}`
      + `h2.grouphd{border-bottom:none;color:${ORANGE};margin-top:18px}`
      + `.section{page-break-inside:avoid;break-inside:avoid;margin-bottom:10px}`
      + `.cards{display:flex;gap:12px;margin:6px 0}.card{flex:1;border:1px solid #EADfd9;border-top:4px solid ${ORANGE};border-radius:8px;padding:11px 13px;background:#FFFCFB}`
      + `.card .lbl{font-size:9.5px;color:#6a6a6a;text-transform:uppercase;letter-spacing:.5px;font-weight:700}.card .big{font-size:25px;font-weight:800;color:#1f1f1f;margin:3px 0}.card .yoy{font-size:11px;font-weight:700}`
      + `table{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0}th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #EDEDED}th.r,td.r{text-align:right}`
      + `thead th{background:#F6F4F2;color:#555;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #E0DAD5}`
      + `tr.me{background:#FDEDE6;font-weight:700}`
      + `.ct{font-size:11px;color:#777;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin:8px 0 2px}`
      + `.chart{border:1px solid #EEE;border-radius:8px;padding:8px 12px 6px;margin:4px 0}`
      + `.legend{margin-top:8px;font-size:11px;color:#555}.legend .lg{margin-right:16px;white-space:nowrap}.legend .sw{display:inline-block;width:12px;height:3px;vertical-align:middle;margin-right:4px}`
      + `.two{display:flex;gap:28px}.two>div{flex:1}ul{margin:6px 0;padding-left:16px}li{margin:3px 0;font-size:11px}.muted{color:#aaa;list-style:none;margin-left:-16px}`
      + `.cwon{font-weight:700;color:#1d9e75;font-size:12px}.clost{font-weight:700;color:#d85a30;font-size:12px}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
    const header = `<div style="width:100%;font-size:9px;padding:0 0.55in;box-sizing:border-box;-webkit-print-color-adjust:exact;"><div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid ${ORANGE};padding-bottom:5px;"><div><img src="${PORTAL_WORDMARK_DATA_URI}" style="height:24px;display:block"/><div style="font-size:6px;letter-spacing:1px;color:${GREY};text-transform:uppercase;margin-top:2px">Where brands and integrators connect</div></div><div style="text-align:right"><div style="font-size:9px;letter-spacing:2px;color:${GREY};font-weight:700">MARKET INSIGHTS</div><div style="font-size:7px;color:#9a9a9a">Brand Performance Report</div></div></div></div>`;
    const footer = `<div style="width:100%;font-size:7.5px;color:#aaa;padding:0 0.55in;box-sizing:border-box;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;"><span>Generated ${date} &middot; ${this.esc(company)} &middot; ${this.esc(this.session.name)} &middot; Portal.io</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
    return { html, header, footer };
  }

  money(n: number): string { if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B"; if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k"; return "$" + Math.round(n); }
  cur(n: number): string { return "$" + Math.round(n).toLocaleString("en-US"); }
  num(n: number): string { return Math.round(n).toLocaleString("en-US"); }
  pct(fr: number): string { return (fr * 100).toFixed(2) + "%"; }
  yoyStr(v: number): string { return (v >= 0 ? "▲ " : "▼ ") + Math.abs(v) + "%"; }
  dcol(v: number): string { return v >= 0 ? "var(--positive)" : "var(--negative)"; }
}
