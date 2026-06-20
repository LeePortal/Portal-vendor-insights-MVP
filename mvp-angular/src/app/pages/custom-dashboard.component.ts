import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { CustomDashboardService, CustomDashboard, DashFilters } from "../core/custom-dashboard.service";
import { AnalyticsService } from "../core/analytics.service";
import { BuilderWidgetComponent } from "../components/builder-widget.component";
import { MultiSelectComponent } from "../components/multiselect.component";

@Component({
  selector: "app-custom-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink, BuilderWidgetComponent, MultiSelectComponent],
  template: `
    <a routerLink="/dashboards" class="muted" style="font-size:12px">&larr; Back to Dashboards</a>
    <div *ngIf="!dash" class="pcard" style="margin-top:12px"><div class="bd muted">Dashboard not found.</div></div>
    <ng-container *ngIf="dash as d">
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:10px">
        <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-faint)">Market Insights · Custom</div><h1 style="margin-top:2px">{{ d.name }} <span class="badge-concept" style="vertical-align:middle">Not in MVP</span></h1></div>
        <div style="display:flex;gap:8px">
          <button class="pbtn" (click)="edit()">Edit</button>
          <button class="pbtn sm danger" (click)="del()">Delete</button>
        </div>
      </div>

      <div class="filterbar" style="align-items:flex-end">
        <app-multiselect label="Parent category" allLabel="All" [options]="parentOptions" [selected]="filters.parents" (selectedChange)="setF('parents', $event)"></app-multiselect>
        <app-multiselect label="Sub-category" allLabel="All" [options]="subOptions" [selected]="filters.subs" (selectedChange)="setF('subs', $event)"></app-multiselect>
        <app-multiselect label="Buying group" allLabel="All" [search]="false" [options]="buyingGroupOptions" [selected]="filters.buyingGroups" (selectedChange)="setF('buyingGroups', $event)"></app-multiselect>
        <app-multiselect label="State" allLabel="All" [options]="stateOptions" [selected]="filters.states" (selectedChange)="setF('states', $event)"></app-multiselect>
        <div style="flex:1"></div>
        <button class="pbtn" (click)="reset()">Reset filters</button>
      </div>

      <div class="grid c2" style="align-items:start">
        <app-builder-widget *ngFor="let w of d.widgets" [widget]="w" [dash]="filters"></app-builder-widget>
      </div>
    </ng-container>
  `,
})
export class CustomDashboardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cds = inject(CustomDashboardService);
  private an = inject(AnalyticsService);

  id = this.route.snapshot.paramMap.get("id") || "";
  dash: CustomDashboard | undefined = this.cds.get(this.id);
  filters: DashFilters = this.dash?.filters ? { ...this.dash.filters } : { parents: [], subs: [], buyingGroups: [], states: [] };

  parentOptions = this.an.parentCats;
  buyingGroupOptions = this.an.buyingGroups;
  stateOptions = this.an.states;
  get subOptions(): string[] { return this.filters.parents.length ? this.an.subsForParents(this.filters.parents) : []; }

  setF(field: keyof DashFilters, v: string[]): void {
    this.filters = { ...this.filters, [field]: v };
    if (field === "parents") this.filters = { ...this.filters, subs: this.filters.subs.filter((s) => this.subOptions.includes(s)) };
  }
  reset(): void { this.filters = { parents: [], subs: [], buyingGroups: [], states: [] }; }
  edit(): void { this.router.navigate(["/dashboards/builder"], { queryParams: { id: this.id } }); }
  del(): void { this.cds.remove(this.id); this.router.navigate(["/dashboards"]); }
}
