import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { HBarsComponent, MultiLineChartComponent, MultiSeries, PALETTE } from "../components/charts.component";
import { MultiSelectComponent } from "../components/multiselect.component";
import { REPORT_SPECS, ReportSpec, ReportWidget } from "../core/report-specs";
import { findReport } from "../core/reports-catalog";

@Component({
  selector: "app-report-view",
  standalone: true,
  imports: [CommonModule, FormsModule, HBarsComponent, MultiLineChartComponent, MultiSelectComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-faint)">Portal Reports</div>
        <h1 style="margin-top:2px">{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <span class="badge-sample">SAMPLE DATA</span>
    </div>

    <ng-container *ngIf="spec as s; else todo">
      <div class="filterbar" style="align-items:flex-end">
        <div class="filt" *ngIf="s.aggregation"><label>Aggregation</label>
          <div class="tgl"><button *ngFor="let a of aggs" [class.on]="agg === a" (click)="agg = a">{{ a }}</button></div>
        </div>
        <div class="filt" *ngIf="s.dateRange"><label>Date Range</label>
          <select class="minput" [(ngModel)]="dateRange"><option *ngFor="let d of dateRanges">{{ d }}</option></select>
        </div>
        <app-multiselect *ngFor="let f of s.customFilters" [label]="f.label" allLabel="All" [options]="f.options" [selected]="[]"></app-multiselect>
      </div>

      <div class="grid c2" style="align-items:start">
        <ng-container *ngFor="let w of s.widgets">
          <div *ngIf="w.type === 'kpis'" class="span2" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px">
            <div class="pcard kpi" *ngFor="let k of $any(w).items" style="flex:1;min-width:165px"><div class="label">{{ k.label }}</div><div class="value">{{ k.value }}</div></div>
          </div>

          <div *ngIf="w.type === 'bars'" class="pcard" [class.span2]="$any(w).span === 2">
            <div class="hd"><div class="t">{{ $any(w).title }}</div></div>
            <div class="bd"><app-hbars [rows]="$any(w).rows" [money]="!!$any(w).money"></app-hbars></div>
          </div>

          <div *ngIf="w.type === 'lines'" class="pcard" [class.span2]="$any(w).span === 2">
            <div class="hd"><div class="t">{{ $any(w).title }}</div></div>
            <div class="bd"><app-multiline [series]="lineSeries(w)" [axis]="$any(w).axis" [yLabel]="$any(w).yLabel || 'Value'" xLabel="Period" valueFormat="num"></app-multiline></div>
          </div>

          <div *ngIf="w.type === 'table'" class="pcard" [class.span2]="$any(w).span === 2">
            <div class="hd"><div class="t">{{ $any(w).title }}</div></div>
            <div class="bd" style="max-height:440px;overflow:auto">
              <table class="ptbl">
                <thead><tr><th *ngFor="let c of $any(w).columns; let i = index" [class.num]="i > 0">{{ c }}</th></tr></thead>
                <tbody><tr *ngFor="let r of $any(w).rows"><td *ngFor="let cell of r; let i = index" [class.num]="i > 0" [style.font-weight]="r[0] === 'Total' ? '700' : '400'">{{ cell }}</td></tr></tbody>
              </table>
            </div>
          </div>
          <div *ngIf="w.type === 'note'" class="pcard span2" [style.border-left]="'3px solid ' + ($any(w).tone === 'support' ? 'var(--negative)' : 'var(--accent)')">
            <div class="bd"><div class="muted" style="font-size:13px;font-weight:600">{{ $any(w).text }}</div></div>
          </div>
        </ng-container>
      </div>
    </ng-container>

    <ng-template #todo>
      <div class="pcard" style="margin-bottom:16px;border-left:3px solid var(--accent)">
        <div class="bd"><div style="font-weight:700;margin-bottom:2px">Not built yet</div><div class="muted" style="font-size:13px">This Periscope report hasn't been recreated yet. Share its URL and I'll replicate it faithfully.</div></div>
      </div>
      <div class="grid c4" style="margin-bottom:16px"><div class="pcard kpi" *ngFor="let i of [1,2,3,4]"><div class="skl skl-sm"></div><div class="skl skl-lg" style="margin-top:10px"></div></div></div>
      <div class="pcard"><div class="hd"><div class="t">Preview</div></div><div class="bd"><div class="skl skl-chart"></div></div></div>
    </ng-template>
  `,
})
export class ReportViewComponent {
  private route = inject(ActivatedRoute);
  spec: ReportSpec | undefined;
  title = "Report";
  description = "";
  aggs = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"];
  agg = "Monthly";
  dateRanges = ["All Dates", "365 Days", "180 Days", "90 Days", "30 Days", "Current Month", "Current Week", "Custom Range"];
  dateRange = "All Dates";

  constructor() {
    const upd = () => {
      const id = this.route.snapshot.paramMap.get("id") || "";
      this.spec = REPORT_SPECS[id];
      const r = findReport(id);
      this.title = this.spec?.name || r?.name || "Report";
      this.description = this.spec?.description || r?.description || "";
    };
    upd();
    this.route.paramMap.subscribe(upd);
  }

  lineSeries(w: ReportWidget): MultiSeries[] {
    const lw = w as { series: { label: string; values: number[] }[] };
    return lw.series.map((s, i) => ({ label: s.label, values: s.values, color: PALETTE[i % PALETTE.length] }));
  }
}
