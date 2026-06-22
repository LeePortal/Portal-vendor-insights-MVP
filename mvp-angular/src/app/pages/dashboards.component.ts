import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { DataService } from "../core/data.service";
import { DASHBOARD_GROUPS, DashGroup, DashCard } from "../core/dashboard-catalog";
import { CustomDashboardService } from "../core/custom-dashboard.service";
import { SubscriptionService } from "../core/subscription.service";

@Component({
  selector: "app-dashboards",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div><h1>Dashboards</h1><p>All your Portal dashboards in one place. <span class="muted">Toggle the switch to receive a dashboard by scheduled email.</span></p></div>
      <span class="badge-sample">SAMPLE DATA</span>
    </div>
    <p class="muted" style="font-size:12px;margin:-4px 0 14px">Subscriptions are saved to your account. <b>Note:</b> the scheduled-email delivery itself is not wired up yet — flagged for the dev team.</p>

    <ng-container *ngFor="let g of groups">
      <h2 class="dash-group">{{ g.name }}</h2>
      <div class="grid c3" style="margin-bottom:6px">
        <div *ngFor="let c of g.cards" class="pcard">
          <div class="bd">
            <div style="font-weight:700;font-size:14px">{{ c.name }}</div>
            <p class="muted" style="margin:8px 0 12px;font-size:13px">{{ c.description }}</p>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <a style="color:var(--accent);font-weight:600;font-size:13px" [routerLink]="c.route" [queryParams]="qp(c)">Open dashboard →</a>
              <label class="switch" *ngIf="!g.adminOnly" title="Subscribe to email delivery"><input type="checkbox" [checked]="subSvc.isSubscribed(c.id)" (change)="subSvc.toggle(c.id)" /><span class="track"></span></label>
            </div>
          </div>
        </div>
        <ng-container *ngIf="g.id === 'market-insights' && isAdmin">
          <a *ngFor="let cd of custom" class="pcard report-card" [routerLink]="['/dashboards/custom', cd.id]">
            <div class="bd">
              <div style="font-weight:700;font-size:14px">{{ cd.name }}</div>
              <div style="margin:4px 0 6px"><span class="badge-concept">Not in MVP</span></div>
              <div class="muted" style="font-size:12px;margin:2px 0 10px">Custom · {{ cd.widgets.length }} widgets</div>
              <span style="color:var(--accent);font-weight:600;font-size:13px">Open dashboard →</span>
            </div>
          </a>
          <a class="pcard report-card" routerLink="/dashboards/builder" style="border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:120px">
            <div style="text-align:center"><div style="font-size:22px;color:var(--accent);font-weight:700">+</div><div style="font-weight:600;font-size:13px">Build a dashboard</div><div style="margin-top:6px"><span class="badge-concept">Future concept</span></div></div>
          </a>
        </ng-container>
      </div>
    </ng-container>
  `,
})
export class DashboardsComponent {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private cds = inject(CustomDashboardService);
  subSvc = inject(SubscriptionService);
  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  vendorId = this.isAdmin ? this.data.listVendors()[0].id : this.session.vendorId!;
  groups: DashGroup[] = DASHBOARD_GROUPS.filter((g) => !g.adminOnly || this.isAdmin);
  custom = this.cds.list();

  qp(c: DashCard): Record<string, string> { return this.isAdmin && c.id === "overview" ? { view: this.vendorId } : {}; }
}
