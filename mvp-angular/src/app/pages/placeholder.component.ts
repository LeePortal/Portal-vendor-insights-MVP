import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { findReport } from "../core/reports-catalog";

@Component({
  selector: "app-placeholder",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-faint)">{{ group }}</div>
        <h1 style="margin-top:2px">{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <span class="badge-sample" style="background:#eef0f3;color:#4b4f57">PLACEHOLDER</span>
    </div>

    <div class="pcard" style="margin-bottom:16px;border-left:3px solid var(--accent)">
      <div class="bd">
        <div style="font-weight:700;margin-bottom:2px">This report is a placeholder</div>
        <div class="muted" style="font-size:13px">We're recreating this Periscope report faithfully on Portal. The shell below previews the layout — we'll wire up the real data when we build this one out.</div>
      </div>
    </div>

    <div class="grid c4" style="margin-bottom:16px">
      <div class="pcard kpi" *ngFor="let i of four"><div class="skl skl-sm"></div><div class="skl skl-lg" style="margin-top:10px"></div></div>
    </div>

    <div class="pcard" style="margin-bottom:16px"><div class="hd"><div class="t">Trend</div><div class="s">Preview</div></div><div class="bd"><div class="skl skl-chart"></div></div></div>

    <div class="pcard"><div class="hd"><div class="t">Detail</div><div class="s">Preview</div></div>
      <div class="bd"><div class="skl skl-row" *ngFor="let i of rows"></div></div>
    </div>
  `,
})
export class PlaceholderComponent {
  private route = inject(ActivatedRoute);
  title = ""; subtitle = ""; group = "";
  four = [1, 2, 3, 4];
  rows = [1, 2, 3, 4, 5, 6, 7];

  constructor() {
    const upd = () => {
      const id = this.route.snapshot.paramMap.get("id");
      const d = this.route.snapshot.data as { title?: string; subtitle?: string; group?: string };
      if (id) {
        const r = findReport(id);
        this.title = r?.name || "Report";
        this.subtitle = r?.description || "";
        this.group = "Portal Reports";
      } else {
        this.title = d.title || "";
        this.subtitle = d.subtitle || "";
        this.group = d.group || "";
      }
    };
    upd();
    this.route.paramMap.subscribe(upd);
    this.route.data.subscribe(upd);
  }
}
