import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AnalyticsService, AFilter } from "../core/analytics.service";
import { BuilderWidget, DashFilters } from "../core/custom-dashboard.service";
import { HBarsComponent, MultiLineChartComponent, MultiSeries, PALETTE } from "./charts.component";
import { GeoHeatComponent } from "./geoheat.component";

@Component({
  selector: "app-builder-widget",
  standalone: true,
  imports: [CommonModule, HBarsComponent, MultiLineChartComponent, GeoHeatComponent],
  template: `
    <div class="pcard" style="height:100%">
      <div class="hd"><div class="t">{{ widget.title || "Untitled widget" }}</div><div class="s">{{ subtitle }}</div></div>
      <div class="bd">
        <div *ngIf="widget.viz === 'kpi'" class="kpi" style="padding:4px 0"><div class="value" style="font-size:30px">{{ kpiText }}</div></div>
        <app-hbars *ngIf="widget.viz === 'bar'" [rows]="bars" [money]="barsMoney"></app-hbars>
        <app-multiline *ngIf="widget.viz === 'line'" [series]="series" [axis]="axis" [yLabel]="primaryLabel" xLabel="Month" [valueFormat]="lineFmt"></app-multiline>

        <ng-container *ngIf="widget.viz === 'insight'">
          <div *ngIf="insightKpi" class="kpi" style="padding:0 0 10px"><div class="value" style="font-size:26px">{{ insightKpi }}</div></div>
          <app-hbars *ngIf="insightMode === 'bars'" [rows]="bars" [money]="false"></app-hbars>
          <app-geoheat *ngIf="insightMode === 'geo'" [data]="geoData"></app-geoheat>
          <div *ngIf="insightMode === 'table'" style="max-height:340px;overflow:auto">
            <table class="ptbl"><thead><tr><th *ngFor="let c of cols; let i = index" [class.num]="i > 0">{{ c }}</th></tr></thead>
              <tbody><tr *ngFor="let r of rows"><td *ngFor="let cell of r; let i = index" [class.num]="i > 0">{{ cell }}</td></tr></tbody></table>
          </div>
        </ng-container>

        <div *ngIf="widget.viz === 'table'" style="max-height:340px;overflow:auto">
          <table class="ptbl"><thead><tr><th *ngFor="let c of cols; let i = index" [class.num]="i > 0">{{ c }}</th></tr></thead>
            <tbody><tr *ngFor="let r of rows"><td *ngFor="let cell of r; let i = index" [class.num]="i > 0">{{ cell }}</td></tr></tbody></table>
        </div>
      </div>
    </div>
  `,
})
export class BuilderWidgetComponent implements OnChanges {
  @Input() widget!: BuilderWidget;
  @Input() dash?: DashFilters;
  constructor(private an: AnalyticsService) {}

  subtitle = ""; primaryLabel = ""; lineFmt: "money" | "pct" | "num" = "num";
  kpiText = ""; bars: { label: string; value: number }[] = []; barsMoney = false;
  series: MultiSeries[] = []; axis: string[] = [];
  cols: string[] = []; rows: (string | number)[][] = [];
  insightKpi = ""; insightMode: "table" | "bars" | "geo" = "table";
  geoData: { label: string; value: number }[] = [];

  private merge(w: string[], d: string[]): string[] { if (w.length && d.length) return w.filter((x) => d.includes(x)); return d.length ? d : w; }
  private filter(): AFilter {
    const w = this.widget; const d = this.dash || { parents: [], subs: [], buyingGroups: [], states: [] };
    return { brand: w.brand || "admin", parents: this.merge(w.parents, d.parents), subs: this.merge(w.subs, d.subs), buyingGroups: this.merge(w.buyingGroups, d.buyingGroups), states: this.merge(w.states, d.states), normalize: false, agg: "monthly", horizon: "All" };
  }
  private dimLabel(d: string | null): string { return d === "brand" ? "Brand" : d === "parent" ? "Parent Category" : d === "subcat" ? "Sub-Category" : ""; }

  ngOnChanges(): void {
    const w = this.widget; if (!w) return;
    const f = this.filter();
    this.insightKpi = "";
    if (w.viz === "insight") { this.renderInsight(w, f); return; }
    const m = w.measures[0] || "sales";
    const meta = this.an.measureMeta(m);
    this.primaryLabel = meta.label;
    this.subtitle = meta.label + (w.viz !== "kpi" && w.groupBy ? " by " + this.dimLabel(w.groupBy) : "");
    if (w.viz === "kpi") {
      const v = this.an.measureKpi(m, f);
      this.kpiText = meta.money ? "$" + Math.round(v).toLocaleString("en-US") : Math.round(v).toLocaleString("en-US");
    } else if (w.viz === "bar") {
      this.bars = this.an.measureGroup(m, w.groupBy || "brand", f, 12); this.barsMoney = meta.money;
    } else if (w.viz === "line") {
      const r = this.an.measureSeries(m, w.groupBy, f);
      this.axis = r.axis; this.series = r.series.map((sx, i) => ({ label: sx.label, values: sx.values, color: PALETTE[i % PALETTE.length] })); this.lineFmt = meta.money ? "money" : "num";
    } else {
      const t = this.an.measureTable(w.measures.length ? w.measures : [m], w.groupBy || "brand", f); this.cols = t.columns; this.rows = t.rows;
    }
  }

  private renderInsight(w: BuilderWidget, f: AFilter): void {
    const brand = w.brand && w.brand !== "admin" ? w.brand : "category";
    this.insightMode = "table";
    if (w.insight === "new-dealers") {
      const r = this.an.newDealers(f); this.insightKpi = r.count + " new dealers"; this.cols = r.columns; this.rows = r.rows;
      this.subtitle = "New dealers speccing " + brand + " (last 30 days)";
    } else if (w.insight === "lost-dealers") {
      const r = this.an.lostDealers(f); this.insightKpi = r.count + " dealers lost"; this.cols = r.columns; this.rows = r.rows;
      this.subtitle = "Dealers with no " + brand + " sales in 6+ months";
    } else if (w.insight === "disp-won") {
      const a = this.an.displacementWon(f); this.subtitle = brand + " won the line item vs a competitor";
      this.cols = ["Model", "Sub-category", "# Units won", "$ won", "Competitors beaten"];
      this.rows = a.map((d) => [d.model, d.desc, d.units.toLocaleString("en-US"), "$" + d.sales.toLocaleString("en-US"), d.competitorsBeaten]);
    } else if (w.insight === "disp-lost") {
      const a = this.an.displacementLost(f); this.subtitle = brand + " was displaced on the line item";
      this.cols = ["Your model", "Sub-category", "# Units lost", "$ lost", "Displaced by (#)"];
      this.rows = a.map((d) => [d.model, d.subcat, d.lostUnits.toLocaleString("en-US"), "$" + d.lostSales.toLocaleString("en-US"), d.displacers.length]);
    } else if (w.insight === "substitution") {
      const a = this.an.displacementLost(f); this.subtitle = "Which competitor SKUs replaced " + brand + " (ranked by units)";
      this.cols = ["Your model", "Sub-category", "Displaced by", "Competitor model", "Units"];
      this.rows = a.flatMap((d) => d.displacers.map((s) => [d.model, d.subcat, s.brand, s.model, s.units.toLocaleString("en-US")] as (string | number)[])).slice(0, 24);
    } else if (w.insight === "funnel") {
      const fn = this.an.proposalFunnel(f); this.insightMode = "bars";
      this.bars = fn.stages.map((s) => ({ label: s.stage, value: s.brand }));
      this.subtitle = brand + " proposal funnel — Proposed → Submitted → Accepted → Completed";
    } else {
      this.geoData = this.an.salesByState(f); this.insightMode = "geo";
      this.subtitle = (brand === "category" ? "Category" : brand) + " sales by state";
    }
  }
}
