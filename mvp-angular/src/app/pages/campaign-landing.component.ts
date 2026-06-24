import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PremiumPlacementSource, PpCreative, PpCampaignDetail } from "../core/premium-placement.source";
import { fmtNumber } from "../core/format";

type ItemFilter = "active" | "inactive" | "all";
type Period = "mtd" | "lastmonth" | "custom";

/**
 * Admin campaign landing page (Premium Placement / Spotlight). Shows one campaign's meta + period
 * impressions/clicks, and its AD ITEMS (creatives) as individual metric cards — each ad-item's image
 * anchors its own impressions/clicks. Reached from the admin Campaigns accordion; the period flows in via
 * ?from=&to= (defaults to MTD on a direct hit) and can be changed in-page via the Period filter (MTD /
 * Last month / Custom). Ad items are pre-sorted newest-uploaded first by the proxy; an Active / Inactive /
 * All filter (default Active) narrows the grid. Active = served impressions this month.
 */
@Component({
  selector: "app-campaign-landing",
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .aigrid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
    @media (max-width:820px) { .aigrid { grid-template-columns:1fr; } }
    .aicard { display:flex; gap:16px; align-items:stretch; border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--surface); }
    .aithumb { flex:0 0 200px; width:200px; min-height:200px; display:grid; place-items:center; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
    .aithumb.zoom { cursor:zoom-in; }
    .aithumb img { max-width:100%; max-height:300px; display:block; }
    .noimg { color:var(--text-muted); font-size:12px; padding:24px; text-align:center; }
    .aibody { flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:12px; }
    .aihead { display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .ainame { font-size:16px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text); }
    .aimetrics { display:flex; flex-direction:column; gap:10px; }
    .stat { background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:10px 13px; }
    .stat .v { font-size:22px; font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums; color:var(--text); }
    .stat .l { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); font-weight:700; margin-top:3px; }
    .lbx { position:fixed; inset:0; background:rgba(0,0,0,.82); z-index:1000; display:grid; place-items:center; padding:24px; cursor:zoom-out; }
    .lbx img { max-width:92vw; max-height:92vh; border-radius:6px; }
  `],
  template: `
    <a [routerLink]="['/admin']" [queryParams]="{ view: 'pp' }" class="muted" style="font-size:12px">&larr; Back to Premium Placement</a>

    <div *ngIf="loading && !detail" class="pcard" style="margin-top:12px"><div class="bd muted" style="font-size:13px">Loading campaign…</div></div>
    <div *ngIf="!loading && !configured" class="pcard" style="margin-top:12px;border:1px solid #ff5000"><div class="bd" style="color:#ff5000;font-size:13px">AdButler isn't connected.</div></div>
    <div *ngIf="!loading && configured && !detail" class="pcard" style="margin-top:12px"><div class="bd muted" style="font-size:13px">Campaign not found.</div></div>

    <ng-container *ngIf="detail as d">
      <div class="page-head" style="margin-top:10px">
        <h1>{{ d.name }}</h1>
        <p>{{ d.advertiserName || "Unknown company" }} &middot; <span class="sub-badge" [ngClass]="d.active ? 'active' : 'expired'">{{ d.active ? "Active" : "Expired" }}</span></p>
      </div>

      <div class="filterbar" style="align-items:flex-end">
        <div class="filt"><label>Period</label>
          <div class="tgl">
            <button [class.on]="period === 'mtd'" (click)="setPeriod('mtd')">MTD</button>
            <button [class.on]="period === 'lastmonth'" (click)="setPeriod('lastmonth')">Last month</button>
            <button [class.on]="period === 'custom'" (click)="setPeriod('custom')">Custom</button>
          </div>
        </div>
        <div class="filt" *ngIf="period === 'custom'"><label>From</label><input class="minput" type="date" [value]="cFrom" (change)="onCustom($event, 's')" /></div>
        <div class="filt" *ngIf="period === 'custom'"><label>To</label><input class="minput" type="date" [value]="cTo" (change)="onCustom($event, 'e')" /></div>
      </div>

      <div class="grid c4" style="margin-bottom:16px">
        <div class="pcard kpi"><div class="label">Impressions</div><div class="value">{{ n(d.impressions) }}</div><div class="delta flat">selected period</div></div>
        <div class="pcard kpi"><div class="label">Clicks</div><div class="value">{{ n(d.clicks) }}</div><div class="delta flat">selected period</div></div>
        <div class="pcard kpi"><div class="label">Ad items</div><div class="value">{{ creatives.length }}</div><div class="delta flat">{{ activeCount }} active now</div></div>
      </div>

      <div class="pcard">
        <div class="hd" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div><div class="t">Ad items</div><div class="s">Each creative's own impressions &amp; clicks for the selected period &middot; newest uploaded first</div></div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="tgl">
              <button *ngFor="let f of filters" [class.on]="itemFilter === f.key" (click)="itemFilter = f.key">{{ f.label }} ({{ f.count }})</button>
            </div>
            <button class="pbtn" style="padding:4px 11px;font-size:12px" (click)="adItemsOpen = !adItemsOpen">{{ adItemsOpen ? 'Collapse' : 'Expand' }}</button>
          </div>
        </div>
        <div class="bd" *ngIf="adItemsOpen">
          <div *ngIf="!shown.length" class="muted" style="font-size:13px">No {{ itemFilter === 'all' ? '' : itemFilter }} ad items for this period.</div>
          <div class="aigrid">
            <div *ngFor="let cr of shown" class="aicard">
              <div class="aithumb" [class.zoom]="!!cr.imageUrl" (click)="cr.imageUrl && openLightbox(cr.imageUrl)" [title]="cr.imageUrl ? 'Click to enlarge' : ''">
                <img *ngIf="cr.imageUrl" [src]="cr.imageUrl" [alt]="cr.name" />
                <div *ngIf="!cr.imageUrl" class="noimg">No image</div>
              </div>
              <div class="aibody">
                <div class="aihead">
                  <span class="ainame" [title]="cr.name">{{ cr.name }}</span>
                  <span class="sub-badge" [ngClass]="cr.active ? 'active' : 'none'">{{ cr.active ? 'Active' : 'Inactive' }}</span>
                </div>
                <div class="aimetrics">
                  <div class="stat"><div class="v">{{ n(cr.impressions) }}</div><div class="l">Impressions</div></div>
                  <div class="stat"><div class="v">{{ n(cr.clicks) }}</div><div class="l">Clicks</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <div *ngIf="lightbox" class="lbx" (click)="lightbox = null" title="Click to close">
      <img [src]="lightbox" alt="Ad creative, full size" />
    </div>
  `,
})
export class CampaignLandingComponent implements OnInit {
  lightbox: string | null = null;
  openLightbox(url: string): void { this.lightbox = url; }

  private route = inject(ActivatedRoute);
  private pp = inject(PremiumPlacementSource);
  n = fmtNumber;
  loading = true;
  configured = true;
  detail: PpCampaignDetail | null = null;
  creatives: PpCreative[] = [];
  itemFilter: ItemFilter = "active";
  adItemsOpen = true;  // collapse toggle for the ad-items section
  period: Period = "mtd";
  cFrom = "";
  cTo = "";
  private id = "";

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

  private ymd(d: Date): string { return d.toISOString().slice(0, 10); }
  private presetRange(p: Period): { from: string; to: string } {
    const now = new Date();
    if (p === "lastmonth") return { from: this.ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: this.ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    return { from: this.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: this.ymd(now) }; // mtd
  }
  private range(): { from: string; to: string } {
    return this.period === "custom" ? { from: this.cFrom, to: this.cTo } : this.presetRange(this.period);
  }

  setPeriod(p: Period): void { this.period = p; if (p !== "custom") this.load(); }
  onCustom(ev: Event, which: "s" | "e"): void {
    const v = (ev.target as HTMLInputElement).value;
    if (which === "s") this.cFrom = v; else this.cTo = v;
    if (this.period === "custom" && this.cFrom && this.cTo) this.load();
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") || "";
    const qp = this.route.snapshot.queryParamMap;
    const qf = qp.get("from") || "", qt = qp.get("to") || "";
    const mtd = this.presetRange("mtd"), lm = this.presetRange("lastmonth");
    if (qf && qt) {
      if (qf === mtd.from && qt === mtd.to) this.period = "mtd";
      else if (qf === lm.from && qt === lm.to) this.period = "lastmonth";
      else { this.period = "custom"; this.cFrom = qf; this.cTo = qt; }
    }
    this.load();
  }

  async load(): Promise<void> {
    const { from, to } = this.range();
    if (!from || !to) return;
    this.loading = true;
    try {
      const r = await this.pp.campaign(this.id, from, to);
      this.configured = r.configured; this.detail = r.campaign; this.creatives = r.creatives;
    } finally {
      this.loading = false;
    }
  }
}
