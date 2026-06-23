import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { AnalyticsService, MEASURES, DIMS, Measure, Dim } from "../core/analytics.service";
import { CustomDashboardService, BuilderWidget, Viz, Insight, CustomDashboard, DashFilters } from "../core/custom-dashboard.service";
import { BuilderWidgetComponent } from "../components/builder-widget.component";
import { MultiSelectComponent } from "../components/multiselect.component";

@Component({
  selector: "app-dashboard-builder",
  standalone: true,
  imports: [CommonModule, FormsModule, BuilderWidgetComponent, MultiSelectComponent],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-faint)">Market Insights</div>
        <h1 style="margin-top:2px">Dashboard builder <span class="badge-concept" style="vertical-align:middle">Future concept · not in MVP</span></h1>
        <p>Build widgets from measures, dimensions and competitive insights, then drag to arrange and save.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="minput" style="width:220px" placeholder="Dashboard name" [(ngModel)]="dashName" />
        <button class="pbtn primary" (click)="saveDashboard()" [disabled]="!dashName.trim() || !widgets.length">Save dashboard</button>
      </div>
    </div>

    <div class="pcard" style="margin-bottom:14px">
      <div class="hd"><div class="t">Dashboard filters</div><div class="s">Apply to every widget on this dashboard</div></div>
      <div class="bd" style="display:flex;gap:10px;flex-wrap:wrap">
        <app-multiselect label="Parent category" allLabel="All" [options]="parentOptions" [selected]="dashFilter.parents" (selectedChange)="setDash('parents', $event)"></app-multiselect>
        <app-multiselect label="Sub-category" allLabel="All" [options]="dashSubOptions" [selected]="dashFilter.subs" (selectedChange)="setDash('subs', $event)"></app-multiselect>
        <app-multiselect label="Buying group" allLabel="All" [search]="false" [options]="buyingGroupOptions" [selected]="dashFilter.buyingGroups" (selectedChange)="setDash('buyingGroups', $event)"></app-multiselect>
        <app-multiselect label="State" allLabel="All" [options]="stateOptions" [selected]="dashFilter.states" (selectedChange)="setDash('states', $event)"></app-multiselect>
      </div>
    </div>

    <div class="grid c2" style="align-items:start;margin-bottom:8px">
      <div class="pcard"><div class="hd"><div class="t">New widget</div></div>
        <div class="bd">
          <div class="field-lite"><label>Title (optional)</label><input [(ngModel)]="draftTitle" (ngModelChange)="refresh()" [placeholder]="autoTitle()" /></div>

          <div style="font-size:12px;font-weight:700;margin:8px 0 4px">Visualization</div>
          <div class="tgl" style="margin-bottom:10px;flex-wrap:wrap"><button *ngFor="let v of vizes" [class.on]="viz === v" (click)="viz = v; refresh()">{{ vizLabel(v) }}</button></div>

          <ng-container *ngIf="viz === 'insight'">
            <div class="field-lite"><label>Competitive insight</label>
              <select class="minput" [(ngModel)]="insight" (change)="refresh()"><option *ngFor="let i of insights" [value]="i.id">{{ i.label }}</option></select>
            </div>
            <div class="field-lite"><label>Brand</label>
              <select class="minput" [(ngModel)]="brand" (change)="refresh()"><option *ngFor="let b of brands" [value]="b">{{ b }}</option></select>
            </div>
          </ng-container>

          <div *ngIf="viz !== 'table' && viz !== 'insight'" class="field-lite"><label>Measure</label>
            <select class="minput" [(ngModel)]="measureSingle" (change)="refresh()"><option *ngFor="let m of measures" [value]="m.id">{{ m.label }}</option></select>
          </div>
          <div *ngIf="viz === 'table'">
            <div style="font-size:12px;font-weight:700;margin:8px 0 4px">Measures</div>
            <div class="chips" style="margin-bottom:10px"><span class="chip" [class.on]="measuresMulti.includes(m.id)" *ngFor="let m of measures" (click)="toggleMeasure(m.id)" style="cursor:pointer">{{ m.label }}</span></div>
          </div>
          <div *ngIf="viz !== 'kpi' && viz !== 'insight'" class="field-lite"><label>Group by</label>
            <select class="minput" [(ngModel)]="groupBy" (change)="refresh()">
              <option *ngIf="viz === 'line'" value="">Total (no split)</option>
              <option *ngFor="let d of dims" [value]="d.id">{{ d.label }}</option>
            </select>
          </div>

          <div style="font-size:12px;font-weight:700;margin:10px 0 4px">Widget filters <span class="muted" style="font-weight:400">(in addition to dashboard filters)</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
            <app-multiselect label="Parent category" allLabel="All" [options]="parentOptions" [selected]="parents" (selectedChange)="onParents($event)"></app-multiselect>
            <app-multiselect label="Sub-category" allLabel="All" [options]="subOptions" [selected]="subs" (selectedChange)="subs = $event; refresh()"></app-multiselect>
            <app-multiselect label="Buying group" allLabel="All" [search]="false" [options]="buyingGroupOptions" [selected]="buyingGroups" (selectedChange)="buyingGroups = $event; refresh()"></app-multiselect>
            <app-multiselect label="State" allLabel="All" [options]="stateOptions" [selected]="states" (selectedChange)="states = $event; refresh()"></app-multiselect>
          </div>

          <button class="pbtn primary" (click)="addWidget()">+ Add to dashboard</button>
        </div>
      </div>

      <div>
        <div class="dash-group">Live preview</div>
        <app-builder-widget [widget]="preview" [dash]="dashFilter"></app-builder-widget>
      </div>
    </div>

    <div class="dash-group">Widgets in this dashboard ({{ widgets.length }}) <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">— drag to reorder</span></div>
    <div class="grid c2" style="align-items:start">
      <div *ngFor="let w of widgets; let i = index" style="position:relative" draggable="true"
           (dragstart)="dragIndex = i" (dragover)="$event.preventDefault()" (drop)="onDrop(i)" [style.opacity]="dragIndex === i ? 0.4 : 1">
        <div style="position:absolute;top:8px;left:8px;z-index:2;cursor:move;color:var(--text-faint);font-size:13px" title="Drag to reorder">⠿</div>
        <button class="pbtn sm danger" style="position:absolute;top:8px;right:8px;z-index:2" (click)="remove(w.id)">Remove</button>
        <app-builder-widget [widget]="w" [dash]="dashFilter"></app-builder-widget>
      </div>
    </div>
    <div *ngIf="!widgets.length" class="muted" style="font-size:13px">No widgets yet — build one above and click "Add to dashboard".</div>
  `,
})
export class DashboardBuilderComponent {
  private an = inject(AnalyticsService);
  private cds = inject(CustomDashboardService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  vizes: Viz[] = ["kpi", "bar", "line", "table", "insight"];
  measures = MEASURES;
  dims = DIMS;
  insights: { id: Insight; label: string }[] = [
    { id: "new-dealers", label: "New Dealers" },
    { id: "lost-dealers", label: "Dealers Lost (6mo)" },
    { id: "disp-won", label: "Competitive Displacement — Won" },
    { id: "disp-lost", label: "Competitive Displacement — Lost" },
    { id: "substitution", label: "Substitution Detail" },
    { id: "funnel", label: "Proposal Funnel" },
    { id: "geo", label: "Geographic Heatmap" },
  ];
  get brands(): string[] { return this.an.brandList; }
  get parentOptions(): string[] { return this.an.parentCats; }
  buyingGroupOptions = this.an.buyingGroups;
  get stateOptions(): string[] { return this.an.states; }

  id = this.cds.newId();
  dashName = "";
  widgets: BuilderWidget[] = [];
  dashFilter: DashFilters = { parents: [], subs: [], buyingGroups: [], states: [] };
  dragIndex = -1;

  draftTitle = "";
  viz: Viz = "bar";
  measureSingle: Measure = "sales";
  measuresMulti: Measure[] = ["sales", "units"];
  groupBy: Dim | "" = "brand";
  insight: Insight = "new-dealers";
  brand = this.an.brandList[0];
  parents: string[] = [];
  subs: string[] = [];
  buyingGroups: string[] = [];
  states: string[] = [];
  preview!: BuilderWidget;

  constructor() {
    const editId = this.route.snapshot.queryParamMap.get("id");
    if (editId) { const d = this.cds.get(editId); if (d) { this.id = d.id; this.dashName = d.name; this.widgets = d.widgets; if (d.filters) this.dashFilter = d.filters; } }
    this.refresh();
  }

  get subOptions(): string[] { return this.parents.length ? this.an.subsForParents(this.parents) : []; }
  get dashSubOptions(): string[] { return this.dashFilter.parents.length ? this.an.subsForParents(this.dashFilter.parents) : []; }
  vizLabel(v: Viz): string { return v === "kpi" ? "KPI" : v === "bar" ? "Bar" : v === "line" ? "Line" : v === "table" ? "Table" : "Competitive"; }
  toggleMeasure(m: Measure): void { const i = this.measuresMulti.indexOf(m); i >= 0 ? this.measuresMulti.splice(i, 1) : this.measuresMulti.push(m); this.refresh(); }
  onParents(v: string[]): void { this.parents = v; this.subs = this.subs.filter((s) => this.subOptions.includes(s)); this.refresh(); }
  setDash(field: keyof DashFilters, v: string[]): void {
    this.dashFilter = { ...this.dashFilter, [field]: v };
    if (field === "parents") this.dashFilter = { ...this.dashFilter, subs: this.dashFilter.subs.filter((s) => this.dashSubOptions.includes(s)) };
  }
  onDrop(i: number): void { if (this.dragIndex < 0 || this.dragIndex === i) return; const a = [...this.widgets]; const [m] = a.splice(this.dragIndex, 1); a.splice(i, 0, m); this.widgets = a; this.dragIndex = -1; }

  autoTitle(): string {
    if (this.viz === "insight") { const il = (this.insights.find((x) => x.id === this.insight) || this.insights[0]).label; return il + " — " + this.brand; }
    const ml = this.viz === "table" ? (this.measuresMulti.map((m) => this.an.measureMeta(m).label).join(", ") || "Measures") : this.an.measureMeta(this.measureSingle).label;
    if (this.viz === "kpi") return ml;
    const gb = this.effectiveGroup();
    return ml + (gb ? " by " + (DIMS.find((d) => d.id === gb) || DIMS[0]).label : "");
  }
  private effectiveGroup(): Dim | null {
    if (this.viz === "kpi" || this.viz === "insight") return null;
    if (this.viz === "line") return this.groupBy === "" ? null : (this.groupBy as Dim);
    return (this.groupBy || "brand") as Dim;
  }
  refresh(): void {
    const measures = this.viz === "table" ? (this.measuresMulti.length ? [...this.measuresMulti] : [this.measureSingle]) : [this.measureSingle];
    this.preview = {
      id: "preview", title: this.draftTitle.trim() || this.autoTitle(), viz: this.viz,
      measures, groupBy: this.effectiveGroup(),
      insight: this.viz === "insight" ? this.insight : undefined,
      brand: this.viz === "insight" ? this.brand : undefined,
      parents: [...this.parents], subs: [...this.subs], buyingGroups: [...this.buyingGroups], states: [...this.states],
    };
  }
  addWidget(): void { this.widgets = [...this.widgets, { ...this.preview, id: this.cds.newId() }]; }
  remove(id: string): void { this.widgets = this.widgets.filter((w) => w.id !== id); }
  saveDashboard(): void {
    if (!this.dashName.trim() || !this.widgets.length) return;
    const d: CustomDashboard = { id: this.id, name: this.dashName.trim(), widgets: this.widgets, filters: this.dashFilter };
    this.cds.save(d);
    this.router.navigate(["/dashboards/custom", this.id]);
  }
}
