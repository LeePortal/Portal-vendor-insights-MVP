import { Component, Input, ViewChild, ElementRef, AfterViewInit, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { fmtCurrency, fmtNumber } from "../core/format";

export const PALETTE = ["#ff5000", "#00a2c1", "#42ad65", "#8c33e7", "#f38800", "#22c1b0", "#8e9197", "#d6336c", "#1c7ed6", "#f59f00"];

interface Point { label: string; value: number; }
type VFmt = "money" | "pct" | "num";
function fmtVal(v: number, mode: VFmt): string {
  if (mode === "pct") return (Math.round(v * 100) / 100).toFixed(2) + "%";
  if (mode === "money") { if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B"; if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M"; if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k"; return "$" + Math.round(v); }
  return Math.round(v).toLocaleString("en-US");
}

/** Area + line trend chart with axis labels + hover tooltip. */
@Component({
  selector: "app-trend",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart">
      <div class="chart-yt">{{ yLabel }}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex">
          <div class="chart-yticks" [style.height.px]="ph"><span>{{ fv(max) }}</span><span>{{ fv(max/2) }}</span><span>0</span></div>
          <div #plot class="chart-plot" [style.height.px]="ph" (mousemove)="hover($event)" (mouseleave)="hi=-1">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
              <g *ngIf="gridlines"><line *ngFor="let gy of gridYs" x1="0" [attr.y1]="gy" [attr.x2]="W" [attr.y2]="gy" stroke="#e8e9ed" stroke-width="1" vector-effect="non-scaling-stroke"></line><line *ngFor="let gx of gridXs" [attr.x1]="gx" y1="0" [attr.x2]="gx" [attr.y2]="H" stroke="#eef0f2" stroke-width="1" vector-effect="non-scaling-stroke"></line></g>
              <polygon [attr.points]="areaPoints" fill="rgba(255,80,0,0.12)"></polygon>
              <polyline [attr.points]="linePoints" fill="none" [attr.stroke]="color" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
            </svg>
            <div class="chart-guide" *ngIf="hi>=0 && points.length" [style.left.%]="guideX"></div>
            <div class="chart-tip" *ngIf="hi>=0 && points[hi]" [style.left.%]="guideX">
              <b>{{ points[hi].label }}</b><div><span class="chart-dot" [style.background]="color"></span>{{ yLabel }}: {{ fv(points[hi].value) }}</div>
            </div>
          </div>
        </div>
        <div class="chart-xrow"><span *ngFor="let l of axisLabels">{{ l }}</span></div>
        <div class="chart-xt">{{ xLabel }}</div>
      </div>
    </div>
  `,
})
export class TrendChartComponent {
  @Input() points: Point[] = [];
  @Input() color = "#ff5000";
  @Input() gridlines = true;
  @Input() yLabel = "Logins";
  @Input() xLabel = "Day";
  @Input() valueFormat: VFmt = "num";
  W = 640; H = 220; pad = 10; ph = 230; hi = -1;
  fv(v: number): string { return fmtVal(v, this.valueFormat); }
  get max(): number { return Math.max(1, ...this.points.map((p) => p.value)); }
  private xy(): { x: number; y: number }[] {
    const n = this.points.length;
    return this.points.map((p, i) => ({ x: n <= 1 ? 0 : (i / (n - 1)) * this.W, y: this.H - (p.value / this.max) * (this.H - this.pad) }));
  }
  get gridYs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((f) => this.H - f * (this.H - this.pad)); }
  get gridXs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => fr * this.W); }
  get linePoints(): string { return this.xy().map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "); }
  get areaPoints(): string { const pts = this.xy(); if (!pts.length) return ""; return "0," + this.H + " " + pts.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") + " " + this.W + "," + this.H; }
  get axisLabels(): string[] { const n = this.points.length; if (n <= 2) return this.points.map((p) => p.label); return [this.points[0].label, this.points[Math.floor(n / 2)].label, this.points[n - 1].label]; }
  get guideX(): number { const n = this.points.length; return n <= 1 ? 0 : (this.hi / (n - 1)) * 100; }
  hover(ev: MouseEvent): void { const n = this.points.length; if (!n) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const fr = (ev.clientX - r.left) / r.width; this.hi = Math.max(0, Math.min(n - 1, Math.round(fr * (n - 1)))); }
}

/** Index line with a dashed "100 = parity" baseline + axis labels + hover. */
@Component({
  selector: "app-index",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart">
      <div class="chart-yt">{{ yLabel }}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex">
          <div class="chart-yticks" [style.height.px]="ph"><span>{{ max | number:'1.0-0' }}</span><span>{{ max/2 | number:'1.0-0' }}</span><span>0</span></div>
          <div #plot class="chart-plot" [style.height.px]="ph" (mousemove)="hover($event)" (mouseleave)="hi=-1">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
              <g><line *ngFor="let gy of gridYs" x1="0" [attr.y1]="gy" [attr.x2]="W" [attr.y2]="gy" stroke="#e8e9ed" stroke-width="1" vector-effect="non-scaling-stroke"></line><line *ngFor="let gx of gridXs" [attr.x1]="gx" y1="0" [attr.x2]="gx" [attr.y2]="H" stroke="#eef0f2" stroke-width="1" vector-effect="non-scaling-stroke"></line></g>
              <line x1="0" [attr.y1]="baselineY" [attr.x2]="W" [attr.y2]="baselineY" stroke="#aeb0b5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
              <polyline [attr.points]="linePoints" fill="none" stroke="#ff5000" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline>
            </svg>
            <div class="chart-guide" *ngIf="hi>=0 && points.length" [style.left.%]="guideX"></div>
            <div class="chart-tip" *ngIf="hi>=0 && points[hi]" [style.left.%]="guideX"><b>{{ points[hi].label }}</b><div>{{ yLabel }}: {{ points[hi].value | number:'1.0-1' }}</div></div>
          </div>
        </div>
        <div class="chart-xrow"><span *ngFor="let l of axisLabels">{{ l }}</span></div>
        <div class="chart-xt">{{ xLabel }} · dashed = category avg (100)</div>
      </div>
    </div>
  `,
})
export class IndexChartComponent {
  @Input() points: Point[] = [];
  @Input() yLabel = "Index (100 = parity)";
  @Input() xLabel = "Period";
  W = 640; H = 220; pad = 12; ph = 230; hi = -1;
  get max(): number { return Math.max(130, ...this.points.map((p) => p.value)); }
  private xy(): { x: number; y: number }[] { const n = this.points.length; return this.points.map((p, i) => ({ x: n <= 1 ? 0 : (i / (n - 1)) * this.W, y: this.H - (p.value / this.max) * (this.H - this.pad) })); }
  get gridYs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => this.H - fr * (this.H - this.pad)); }
  get gridXs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => fr * this.W); }
  get baselineY(): number { return this.H - (100 / this.max) * (this.H - this.pad); }
  get linePoints(): string { return this.xy().map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "); }
  get axisLabels(): string[] { const n = this.points.length; if (n <= 2) return this.points.map((p) => p.label); return [this.points[0].label, this.points[Math.floor(n / 2)].label, this.points[n - 1].label]; }
  get guideX(): number { const n = this.points.length; return n <= 1 ? 0 : (this.hi / (n - 1)) * 100; }
  hover(ev: MouseEvent): void { const n = this.points.length; if (!n) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const fr = (ev.clientX - r.left) / r.width; this.hi = Math.max(0, Math.min(n - 1, Math.round(fr * (n - 1)))); }
}

/** Horizontal bars (HTML) for ranked lists. */
@Component({
  selector: "app-hbars",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;flex-direction:column;gap:9px">
      <div *ngFor="let r of rows; let i = index" style="display:flex;align-items:center;gap:10px">
        <div style="width:140px;font-size:12px;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.label }}</div>
        <div style="flex:1;background:#f0f1f3;border-radius:4px;height:18px"><div [style.width.%]="pct(r.value)" [style.background]="color(i)" style="height:100%;border-radius:4px"></div></div>
        <div style="width:96px;font-size:12px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums">{{ fmt(r.value) }}</div>
      </div>
    </div>
    <div class="chart-xt" *ngIf="xLabel" style="text-align:right;margin-top:6px">{{ xLabel }} →</div>
  `,
})
export class HBarsComponent {
  @Input() rows: Point[] = [];
  @Input() money = true;
  @Input() xLabel = "";
  private get max(): number { return Math.max(1, ...this.rows.map((r) => r.value)); }
  pct(v: number): number { return Math.round((v / this.max) * 100); }
  color(i: number): string { return PALETTE[i % PALETTE.length]; }
  fmt(v: number): string { return this.money ? fmtCurrency(v) : fmtNumber(v); }
}

interface DPoint { label: string; category: number; brand: number; }

/** Two-line chart: category (dark) vs viewed brand (orange), with axis labels + hover. */
@Component({
  selector: "app-dual",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart">
      <div class="chart-yt">{{ yLabel }}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex">
          <div class="chart-yticks" [style.height.px]="ph"><span>{{ fv(catMax) }}</span><span>{{ fv(catMax/2) }}</span><span>0</span></div>
          <div #plot class="chart-plot" [style.height.px]="ph" (mousemove)="hover($event)" (mouseleave)="hi=-1">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
              <g><line *ngFor="let gy of gridYs" x1="0" [attr.y1]="gy" [attr.x2]="W" [attr.y2]="gy" stroke="#e8e9ed" stroke-width="1" vector-effect="non-scaling-stroke"></line><line *ngFor="let gx of gridXs" [attr.x1]="gx" y1="0" [attr.x2]="gx" [attr.y2]="H" stroke="#eef0f2" stroke-width="1" vector-effect="non-scaling-stroke"></line></g>
              <rect *ngIf="shadeFrom >= 0" [attr.x]="shadeX" y="0" [attr.width]="W - shadeX" [attr.height]="H" fill="rgba(255,80,0,0.07)"></rect>
              <line *ngIf="shadeFrom >= 0" [attr.x1]="shadeX" y1="0" [attr.x2]="shadeX" [attr.y2]="H" stroke="#ff5000" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
              <polyline [attr.points]="line('category')" fill="none" stroke="#27272a" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
              <polyline *ngIf="showBrand" [attr.points]="line('brand')" fill="none" stroke="#ff5000" stroke-width="2.5" stroke-dasharray="7 4" vector-effect="non-scaling-stroke"></polyline>
              <g><circle *ngFor="let p of pts('category')" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="points.length <= 3 ? 5 : 3" fill="#27272a"></circle></g>
              <g *ngIf="showBrand"><circle *ngFor="let p of pts('brand')" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="points.length <= 3 ? 5 : 3" fill="#ff5000"></circle></g>
            </svg>
            <div class="chart-guide" *ngIf="hi>=0 && points.length" [style.left.%]="guideX"></div>
            <div class="chart-tip" *ngIf="hi>=0 && points[hi]" [style.left.%]="guideX">
              <b>{{ points[hi].label }}</b>
              <div><span class="chart-dot" style="background:#27272a"></span>{{ categoryLabel }}: {{ fv(points[hi].category) }}</div>
              <div *ngIf="showBrand"><span class="chart-dot" style="background:#ff5000"></span>{{ brandLabel }}: {{ fv(points[hi].brand) }}</div>
            </div>
          </div>
          <div class="chart-yticks" *ngIf="showBrand" [style.height.px]="ph" style="color:#ff5000"><span>{{ fv(brandMax) }}</span><span>{{ fv(brandMax/2) }}</span><span>0</span></div>
        </div>
        <div class="chart-xrow"><span *ngFor="let l of axisLabels">{{ l }}</span></div>
        <div class="chart-xt">{{ xLabel }}</div>
        <div style="display:flex;gap:14px;font-size:11px;color:var(--text-muted);margin-top:4px;margin-left:46px">
          <span><span style="display:inline-block;width:10px;height:2px;background:#27272a;vertical-align:middle"></span> {{ categoryLabel }}</span>
          <span *ngIf="showBrand"><span style="display:inline-block;width:10px;height:2px;background:#ff5000;vertical-align:middle"></span> {{ brandLabel }} <span style="color:#ff5000">(right axis)</span></span>
          <span *ngIf="shadeFrom >= 0"><span style="display:inline-block;width:10px;height:10px;background:rgba(255,80,0,0.15);border:1px solid rgba(255,80,0,0.5);vertical-align:middle"></span> Advertising period</span>
        </div>
      </div>
    </div>
  `,
})
export class DualLineChartComponent implements AfterViewInit {
  @Input() points: DPoint[] = [];
  @Input() showBrand = true;
  @Input() brandLabel = "Your brand";
  @Input() yLabel = "$ value";
  @Input() xLabel = "Period";
  @Input() valueFormat: VFmt = "money";
  @Input() categoryLabel = "Category";
  @Input() shadeFrom = -1; // index from which to shade the advertising period; -1 = no shade
  W = 640; H = 210; pad = 12; ph = 215; hi = -1;
  get shadeX(): number { const n = this.points.length; return n <= 1 ? 0 : (this.shadeFrom / (n - 1)) * this.W; }
  @ViewChild("plot") plot?: ElementRef<HTMLElement>;
  ngAfterViewInit(): void { setTimeout(() => this.measure()); }
  @HostListener("window:resize") measure(): void { const el = this.plot?.nativeElement; if (el) { this.W = Math.max(50, el.clientWidth); this.H = Math.max(50, el.clientHeight); } }
  fv(v: number): string { return fmtVal(v, this.valueFormat); }
  get catMax(): number { return Math.max(1, ...this.points.map((p) => p.category)); }
  get brandMax(): number { return Math.max(1, ...this.points.map((p) => p.brand)); }
  pts(key: "category" | "brand"): { x: number; y: number }[] { const n = this.points.length; const m = key === "brand" ? this.brandMax : this.catMax; return this.points.map((p, i) => ({ x: n <= 1 ? this.W / 2 : (i / (n - 1)) * this.W, y: this.H - (p[key] / m) * (this.H - this.pad) })); }
  line(key: "category" | "brand"): string { return this.pts(key).map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "); }
  get gridYs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => this.H - fr * (this.H - this.pad)); }
  get gridXs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => fr * this.W); }
  get axisLabels(): string[] { const n = this.points.length; if (n <= 2) return this.points.map((p) => p.label); return [this.points[0].label, this.points[Math.floor(n / 2)].label, this.points[n - 1].label]; }
  get guideX(): number { const n = this.points.length; return n <= 1 ? 0 : (this.hi / (n - 1)) * 100; }
  hover(ev: MouseEvent): void { const n = this.points.length; if (!n) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const fr = (ev.clientX - r.left) / r.width; this.hi = Math.max(0, Math.min(n - 1, Math.round(fr * (n - 1)))); }
}

export interface MultiSeries { label: string; values: number[]; color: string; }

/** Multi-line chart with axis labels + hover tooltip listing every series value. */
@Component({
  selector: "app-multiline",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart">
      <div class="chart-yt">{{ yLabel }}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex">
          <div class="chart-yticks" [style.height.px]="ph"><span>{{ fv(max) }}</span><span>{{ fv(max/2) }}</span><span>0</span></div>
          <div #plot class="chart-plot" [style.height.px]="ph" (mousemove)="hover($event)" (mouseleave)="hi=-1">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
              <g><line *ngFor="let gy of gridYs" x1="0" [attr.y1]="gy" [attr.x2]="W" [attr.y2]="gy" stroke="#e8e9ed" stroke-width="1" vector-effect="non-scaling-stroke"></line><line *ngFor="let gx of gridXs" [attr.x1]="gx" y1="0" [attr.x2]="gx" [attr.y2]="H" stroke="#eef0f2" stroke-width="1" vector-effect="non-scaling-stroke"></line></g>
              <rect *ngIf="shadeFrom >= 0" [attr.x]="shadeX" y="0" [attr.width]="shadeX2 - shadeX" [attr.height]="H" fill="rgba(255,80,0,0.07)"></rect>
              <line *ngIf="shadeFrom >= 0" [attr.x1]="shadeX" y1="0" [attr.x2]="shadeX" [attr.y2]="H" stroke="#ff5000" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
              <line *ngIf="shadeFrom >= 0 && shadeTo >= 0" [attr.x1]="shadeX2" y1="0" [attr.x2]="shadeX2" [attr.y2]="H" stroke="#ff5000" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
              <line *ngIf="baseline != null" x1="0" [attr.y1]="baselineY" [attr.x2]="W" [attr.y2]="baselineY" stroke="#aeb0b5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
              <polyline *ngFor="let s of series" [attr.points]="line(s)" fill="none" [attr.stroke]="s.color" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
              <g *ngFor="let s of series"><circle *ngFor="let p of pts(s)" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="series.length && series[0].values.length <= 3 ? 5 : 3" [attr.fill]="s.color"></circle></g>
            </svg>
            <div class="chart-guide" *ngIf="hi>=0 && axis.length" [style.left.%]="guideX"></div>
            <div class="chart-tip" *ngIf="hi>=0 && axis[hi]" [style.left.%]="guideX" [class.flip]="hi > axis.length/2">
              <b>{{ axis[hi] }}</b>
              <div *ngFor="let s of series"><span class="chart-dot" [style.background]="s.color"></span>{{ s.label }}: {{ fv(s.values[hi]) }}</div>
            </div>
          </div>
        </div>
        <div class="chart-xrow"><span *ngFor="let l of axisLabels">{{ l }}</span></div>
        <div class="chart-xt">{{ xLabel }}</div>
      </div>
    </div>
  `,
})
export class MultiLineChartComponent implements AfterViewInit {
  @Input() series: MultiSeries[] = [];
  @Input() axis: string[] = [];
  @Input() yLabel = "Share of category (%)";
  @Input() xLabel = "Period";
  @Input() valueFormat: VFmt = "pct";
  @Input() baseline: number | null = null; // dashed reference line (e.g. 100 for an indexed chart)
  @Input() shadeFrom = -1;                  // index from which to shade the advertising period; -1 = none
  @Input() shadeTo = -1;                    // index the shade runs TO (inclusive); -1 = to the chart's end
  W = 640; H = 240; pad = 16; ph = 250; hi = -1;
  get shadeX(): number { const n = this.axis.length; return n <= 1 ? 0 : (this.shadeFrom / (n - 1)) * this.W; }
  get shadeX2(): number { const n = this.axis.length; const t = this.shadeTo >= 0 ? this.shadeTo : n - 1; return n <= 1 ? this.W : (t / (n - 1)) * this.W; }
  get baselineY(): number { return this.H - ((this.baseline || 0) / this.max) * (this.H - this.pad); }
  @ViewChild("plot") plot?: ElementRef<HTMLElement>;
  ngAfterViewInit(): void { setTimeout(() => this.measure()); }
  @HostListener("window:resize") measure(): void { const el = this.plot?.nativeElement; if (el) { this.W = Math.max(50, el.clientWidth); this.H = Math.max(50, el.clientHeight); } }
  fv(v: number): string { return fmtVal(v == null ? 0 : v, this.valueFormat); }
  get max(): number { return Math.max(1, ...this.series.flatMap((s) => s.values)); }
  line(s: MultiSeries): string { const n = s.values.length; return s.values.map((v, i) => (n <= 1 ? this.W / 2 : (i / (n - 1)) * this.W).toFixed(1) + "," + (this.H - (v / this.max) * (this.H - this.pad)).toFixed(1)).join(" "); }
  pts(s: MultiSeries): { x: number; y: number }[] { const n = s.values.length; return s.values.map((v, i) => ({ x: n <= 1 ? this.W / 2 : (i / (n - 1)) * this.W, y: this.H - (v / this.max) * (this.H - this.pad) })); }
  get gridYs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => this.H - fr * (this.H - this.pad)); }
  get gridXs(): number[] { return [0.2, 0.4, 0.6, 0.8].map((fr) => fr * this.W); }
  get axisLabels(): string[] { const n = this.axis.length; if (n <= 2) return this.axis; return [this.axis[0], this.axis[Math.floor(n / 2)], this.axis[n - 1]]; }
  get guideX(): number { const n = this.axis.length; return n <= 1 ? 0 : (this.hi / (n - 1)) * 100; }
  hover(ev: MouseEvent): void { const n = this.axis.length; if (!n) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const fr = (ev.clientX - r.left) / r.width; this.hi = Math.max(0, Math.min(n - 1, Math.round(fr * (n - 1)))); }
}
