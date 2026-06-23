import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PremiumPlacementSource, PpCreative, PpCampaignDetail } from "../core/premium-placement.source";
import { fmtNumber } from "../core/format";

/**
 * Admin campaign landing page (Premium Placement / Spotlight). Shows one campaign's meta + period
 * impressions/clicks + its AdButler creative image(s). Reached from the admin Campaigns accordion;
 * period flows in via ?from=&to= query params (defaults to MTD on a direct hit).
 */
@Component({
  selector: "app-campaign-landing",
  standalone: true,
  imports: [CommonModule, RouterLink],
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
        <div class="pcard kpi"><div class="label">Creatives</div><div class="value">{{ creatives.length }}</div><div class="delta flat">banners in campaign</div></div>
      </div>

      <div class="pcard">
        <div class="hd"><div class="t">Creative{{ creatives.length === 1 ? "" : "s" }}</div><div class="s">The ad image{{ creatives.length === 1 ? "" : "s" }} served for this campaign (from AdButler)</div></div>
        <div class="bd">
          <div *ngIf="!creatives.length" class="muted" style="font-size:13px">No creatives found for this campaign.</div>
          <div style="display:flex;flex-wrap:wrap;gap:16px">
            <div *ngFor="let cr of creatives" style="border:1px solid var(--border);border-radius:8px;padding:10px">
              <img *ngIf="cr.imageUrl" [src]="cr.imageUrl" [alt]="cr.name" style="max-width:320px;max-height:260px;display:block;border-radius:4px" />
              <div *ngIf="!cr.imageUrl" class="muted" style="width:300px;height:120px;display:grid;place-items:center;background:var(--surface-2);border-radius:4px;font-size:12px">No image URL</div>
              <div style="font-size:12px;font-weight:600;margin-top:6px">{{ cr.name }}</div>
              <div class="muted" style="font-size:11px">{{ cr.width }}&times;{{ cr.height }}</div>
            </div>
          </div>
          <div *ngIf="debug">
            <div class="muted" style="font-size:11px;margin:12px 0 4px">No creatives matched this advertiser — diagnostic:</div>
            <pre style="background:var(--surface-2);padding:10px;border-radius:6px;font-size:11px;overflow:auto;max-height:260px">{{ debug | json }}</pre>
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
  debug: unknown = null;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("id") || "";
    const qp = this.route.snapshot.queryParamMap;
    const now = new Date(); const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
    const from = qp.get("from") || ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = qp.get("to") || ymd(now);
    try {
      const r = await this.pp.campaign(id, from, to);
      this.configured = r.configured; this.detail = r.campaign; this.creatives = r.creatives; this.debug = r.debug || null;
    } finally {
      this.loading = false;
    }
  }
}
