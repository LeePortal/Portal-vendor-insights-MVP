import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PORTAL_REPORTS } from "../core/reports-catalog";

@Component({
  selector: "app-reports",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div><h1>Portal Reports</h1><p>Internal Periscope reports, recreated on Portal — view our data without touching SQL directly.</p></div>
      <span class="badge-sample" style="background:#eef0f3;color:#4b4f57">PLACEHOLDERS</span>
    </div>
    <div class="grid c3">
      <a *ngFor="let r of reports" class="pcard report-card" [routerLink]="['/reports', r.id]">
        <div class="bd">
          <div style="font-weight:700;font-size:14px">{{ r.name }}</div>
          <p class="muted" style="margin:8px 0 12px;font-size:13px">{{ r.description }}</p>
          <span style="color:var(--accent);font-weight:600;font-size:13px">Open report →</span>
        </div>
      </a>
    </div>
  `,
})
export class ReportsComponent {
  reports = PORTAL_REPORTS;
}
