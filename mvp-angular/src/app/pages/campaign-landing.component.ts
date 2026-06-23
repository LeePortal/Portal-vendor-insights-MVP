import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PremiumPlacementSource, PpCreative, PpCampaignDetail } from "../core/premium-placement.source";
import { fmtNumber } from "../core/format";

type ItemFilter = "active" | "inactive" | "all";

/**
 * Admin campaign landing page (Premium Placement / Spotlight). Shows one campaign's meta + period
 * impressions/clicks, and its AD ITEMS (creatives) as individual metric widgets — each ad-item's image
 * anchors its own impressions/clicks. Reached from the admin Campaigns accordion; the period flows in via
 * ?from=&to= (defaults to MTD on a direct hit). Ad items are pre-sorted newest-uploaded first by the proxy;
 * an Active / Inactive / All filter (default Active) narrows the grid. Active = served impressions this month.
 */
@Component({
  selector: "app-campaign-landing",
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .seg { display:flex; gap:4px; background:var(--surface-2); border-radius:8px; padding:3px; }
    .seg-btn { border:0; background:transparent; color:var(--muted); font-size:12px; padding:5px 10px; border-radius:6px; cursor:pointer; }
    .seg-btn.on { background:var(--surface); color:var(--text); font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.08); }
    .aigrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
    .aicard { border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px; }
    .aithumb { display:grid; place-items:center; background:var(--surface-2); border-radius:6px; overflow:hidden; min-height:120px; }
    .aithumb img { max-width:100%; max-height:220px; display:block; }
    .noimg { color:var(--muted); font-size:12px; padding:30px; }
    .aihead { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .ainame { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .aimetrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding-top:8px; border-top:1px solid var(--border); }
    .m-v { font-size:18px; font-weight:700; line-height:1.1 }
    .m-l { font-size:11px; color:var(--muted) }
  `],
  template: `
    <a routerLink="/admin" class="muted" style="font-size:12px">&larr; Back to Premium Placement</a>

    <div *ngIf="loading" class="pcard" style="margin-top:12px"><div class="bd muted" style="font-size:13px">Loading campaign…</div></div>
    <div *ngIf="!loading && !configured" class="pcard" style="margin-top:12px;border:1px solid #ff5000"><div class="bd" style="color:#ff5000;font-size:13px">AdButler isn't connected.</div></div>
    <div *ngIf="!loading && configured && !detail" class="pcard" style="margin-top:12px"><div class="bd muted" style="font-size:13px">Campaign not found.</div></div>

    <ng-container *ngIf="!loading && configured && detail as d">
      <div class="page-head" style="margin-top:10px">
        <h1>{{ d.name }}</h1>
        <p>{{ d.advertiserName || "Unknown company" }} &middot; <span class="sub-badge" [ngClass]="d.active ? 'active' : 'expired'">{{ d.active ? "Active" : "Expired" }}</span></p>
      </div>

      <div class="grid c4" style="margin-bottom:16px">
        <div class="pcard kpi"><div class="label">Impressions</div><div class="value">{{ n(d.impressions) }}</div><div class="delta flat">selected period</div></div>
        <div class="pcard kpi"><div class="label">Clicks</div><div class="value">{{ n(d.clicks) }}</div><div class="delta flat">selected period</div></div>
        <div class="pcard kpi"><div class="label">Ad items</div><div class="value">{{ creatives.length }}</div><div class="delta flat">{{ activeCount }} active now</div></div>
      </div>

      <div class="pcard">
        <div class="hd" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div><div class="t">Ad items</div><div class="s">Each creative's own impressions &amp; clicks for the selected period &middot; newest uploaded first</div></div>
          <div class="seg">
            <button *ngFor="let f of filters" class="seg-btn" [class.on]="itemFilter === f.key" (click)="itemFilter = f.key">{{ f.label }} ({{ f.count }})</button>
          </div>
        </div>
        <div class="bd">
          <div *ngIf="!shown.length" class="muted" style="font-size:13px">No {{ itemFilter === 'all' ? '' : itemFilter }} ad items for this period.</div>
          <div class="aigrid">
            <div *ngFor="let cr of shown" class="aicard">
              <a *ngIf="cr.clickUrl" [href]="cr.clickUrl" target="_blank" rel="noopener" class="aithumb" [title]="cr.clickUrl">
                <img *ngIf="cr.imageUrl" [src]="cr.imageUrl" [alt]="cr.name" />
                <div *ngIf="!cr.imageUrl" class="noimg">No image</div>
              </a>
              <div *ngIf="!cr.clickUrl" class="aithumb">
                <img *ngIf="cr.imageUrl" [src]="cr.imageUrl" [alt]="cr.name" />
                <div *ngIf="!cr.imageUrl" class="noimg">No image</div>
              </div>
              <div class="aihead">
                <span class="ainame" [title]="cr.name">{{ cr.name }}</span>
                <span class="sub-badge" [ngClass]="cr.active ? 'active' : 'expired'">{{ cr.active ? 'Active' : 'Inactive' }}</span>
              </div>
              <div class="aimetrics">
                <div><div class="m-v">{{ n(cr.impressions) }}</div><div class="m-l">Impressions</div></div>
                <div><div class="m-v">{{ n(cr.clicks) }}</div><div class="m-l">Clicks</div></div>
              </div>
              <div class="muted" style="font-size:11px">{{ cr.width }}&times;{{ cr.height }}</div>
            </div>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class CampaignLandingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private pp = inject(PremiumPlacementSource);
  n = fmtNumber;
  loading = true;
  configured = true;
  detail: PpCampaignDetail | null = null;
  creatives: PpCreative[] = [];
  itemFilter: ItemFilter = "active";

  get activeCount(): number { return this.creatives.filter((c) => c.active).length; }

  get filters(): { key: ItemFilter; label: string; count: number }[] {
    const a = this.activeCount;
    return [
      { key: "active", label: "Active", count: a },
      { key: "inactive", label: "Inactive", count: this.creatives.length - a },
      { key: "all", label: "All", count: this.creatives.length },
    ];
  }

  get shown(): PpCreative[] {
    return this.creatives.filter((c) => (this.itemFilter === "all" ? true : this.itemFilter === "active" ? c.active : !c.active));
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("id") || "";
    const qp = this.route.snapshot.queryParamMap;
    const now = new Date(); const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
    const from = qp.get("from") || ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = qp.get("to") || ymd(now);
    try {
      const r = await this.pp.campaign(id, from, to);
      this.configured = r.configured; this.detail = r.campaign; this.creatives = r.creatives;
    } finally {
      this.loading = false;
    }
  }
}
