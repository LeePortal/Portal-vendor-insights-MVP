import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MultiSelectComponent } from "../components/multiselect.component";
import { PremiumPlacementSource, PpCreative, PpAdvertiser } from "../core/premium-placement.source";
import { BrandPerformanceSource } from "../core/brand-performance.source";
import { AuthService } from "../core/auth.service";
import { AFilter, BrandKpis, AnalyticsService } from "../core/analytics.service";
import { fmtNumber } from "../core/format";

type Period = "MTD" | "QTD" | "YTD" | "Custom";
type Status = "all" | "active" | "expired";

/**
 * Premium Placement Overview — the vendor-facing Spotlight dashboard at /premium.
 *  - Vendors: locked to their own advertiser (matched by company name server-side); no Brand filter.
 *  - Admins: get a Brand picker listing the advertisers that exist in Premium Placement ("matched brands");
 *    nothing loads until one is chosen, so an admin never sees an un-scoped whole-market total.
 * Filters: Period (MTD/QTD/YTD/Custom) + Status (All/Active/Expired). Five KPI widgets: Impressions and Clicks
 * (live AdButler Spotlight) + YoY Proposals / Dealers / Revenue (Market Insights Redshift, selected period vs the
 * same period a year earlier, scoped to the brand). Below: the ad-item creative cards (image opens full-size),
 * filtered by Status.
 */
@Component({
  selector: "app-premium-overview",
  standalone: true,
  imports: [CommonModule, RouterLink, MultiSelectComponent],
  styles: [`
    .kgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-bottom:16px; }
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
    <div class="page-head">
      <h1>Premium Placement</h1>
      <p>{{ advertiserName || (isAdmin ? "Admin preview — pick a brand to scope this view" : "Your Spotlight advertising performance") }}</p>
    </div>

    <div class="filterbar" style="align-items:flex-end">
      <div class="filt" *ngIf="isAdmin"><label>Brand</label>
        <select class="minput" (change)="onBrand($any($event.target).value)">
          <option value="">Select a brand…</option>
          <option *ngFor="let a of mappedAdvertisers" [value]="a.id" [selected]="a.id === brandId">{{ a.name }}</option>
        </select>
      </div>
      <div class="filt"><label>Period</label>
        <div class="tgl">
          <button [class.on]="period === 'MTD'" (click)="setPeriod('MTD')">MTD</button>
          <button [class.on]="period === 'QTD'" (click)="setPeriod('QTD')">QTD</button>
          <button [class.on]="period === 'YTD'" (click)="setPeriod('YTD')">YTD</button>
          <button [class.on]="period === 'Custom'" (click)="setPeriod('Custom')">Custom</button>
        </div>
      </div>
      <div class="filt" *ngIf="period === 'Custom'"><label>From</label><input class="minput" type="date" [value]="cFrom" (change)="onCustom($event, 's')" /></div>
      <div class="filt" *ngIf="period === 'Custom'"><label>To</label><input class="minput" type="date" [value]="cTo" (change)="onCustom($event, 'e')" /></div>
      <div class="filt"><label>Status</label>
        <div class="tgl">
          <button [class.on]="status === 'all'" (click)="status = 'all'">All ({{ adItems.length }})</button>
          <button [class.on]="status === 'active'" (click)="status = 'active'">Active ({{ activeCount }})</button>
          <button [class.on]="status === 'expired'" (click)="status = 'expired'">Expired ({{ adItems.length - activeCount }})</button>
        </div>
      </div>
      <app-multiselect label="Proposal status" allLabel="All statuses" [search]="false" [sort]="false" [options]="statusOptions" [selected]="statuses" (selectedChange)="onStatuses($event)"></app-multiselect>
      <a *ngIf="isAdmin" class="pbtn" [routerLink]="['/admin/premium/mapping']" style="margin-left:auto;align-self:center">Brand mapping</a>
    </div>

    <div *ngIf="isAdmin && !loading && !mappedAdvertisers.length" class="muted" style="font-size:12px;margin:-4px 0 12px">No brands are mapped yet — set advertiser↔brand links in <a [routerLink]="['/admin/premium/mapping']">Brand mapping</a>.</div>

    <div *ngIf="!ppConfigured && !loading && hasScope" class="pcard" style="border:1px solid #ff5000;background:var(--accent-soft);margin-bottom:16px"><div class="bd" style="font-size:13px;color:#ff5000">AdButler isn't connected yet — Spotlight impressions and clicks will populate once it is.</div></div>

    <div class="dash-wrap">
      <div *ngIf="loading && firstLoad">
        <div class="kgrid">
          <div class="pcard kpi" *ngFor="let s of [1,2,3,4,5]"><div class="sk" style="height:12px;width:55%;margin-bottom:14px"></div><div class="sk" style="height:24px;width:70%"></div></div>
        </div>
        <div class="pcard"><div class="sk" style="height:14px;width:30%;margin-bottom:18px"></div><div class="sk" style="height:120px"></div></div>
      </div>
      <ng-container *ngIf="!(loading && firstLoad)">
        <div *ngIf="loading" class="upd-pill"><span class="upd-dot"></span> Updating…</div>
        <div *ngIf="loading" class="upd-overlay"><div class="upd-spinner"></div></div>
        <div class="dash-body" [class.updating]="loading">

    <div class="kgrid">
      <div class="pcard kpi"><div class="label">Impressions</div><div class="value">{{ hasScope && ppConfigured ? n(impressions) : "—" }}</div><div class="delta flat">Spotlight · selected period</div></div>
      <div class="pcard kpi"><div class="label">Clicks</div><div class="value">{{ hasScope && ppConfigured ? n(clicks) : "—" }}</div><div class="delta flat">Spotlight · selected period</div></div>
      <div class="pcard kpi"><div class="label">YoY Proposals</div><div class="value">{{ kpis ? n(kpis.proposals) : "—" }}</div><div class="delta" [ngClass]="dcls(kpis?.proposalsYoY)">{{ dtxt(kpis?.proposalsYoY) }}</div></div>
      <div class="pcard kpi"><div class="label">YoY Dealers</div><div class="value">{{ kpis ? n(kpis.dealers) : "—" }}</div><div class="delta" [ngClass]="dcls(kpis?.dealersYoY)">{{ dtxt(kpis?.dealersYoY) }}</div></div>
      <div class="pcard kpi"><div class="label">YoY Revenue</div><div class="value">{{ kpis ? ("$" + n(kpis.revenue)) : "—" }}</div><div class="delta" [ngClass]="dcls(kpis?.revenueYoY)">{{ dtxt(kpis?.revenueYoY) }}</div></div>
    </div>

    <div class="pcard">
      <div class="hd"><div class="t">Ad items</div><div class="s">Your Spotlight creatives · each one's impressions &amp; clicks for the selected period · newest uploaded first</div></div>
      <div class="bd">
        <div *ngIf="isAdmin && !brandId" class="muted" style="font-size:13px">Select a brand to view its Premium Placement performance.</div>
        <ng-container *ngIf="hasScope">
          <div *ngIf="!loading && ppConfigured && !advertiserName" class="muted" style="font-size:13px">No Spotlight advertiser is matched to {{ isAdmin ? "that brand" : "your company" }} yet.</div>
          <div *ngIf="!loading && advertiserName && !shown.length" class="muted" style="font-size:13px">No {{ status === 'all' ? '' : status }} ad items for this period.</div>
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
        </ng-container>
      </div>
    </div>
        </div>
      </ng-container>
    </div>

    <div *ngIf="lightbox" class="lbx" (click)="lightbox = null" title="Click to close">
      <img [src]="lightbox" alt="Ad creative, full size" />
    </div>
  `,
})
export class PremiumOverviewComponent implements OnInit {
  private pp = inject(PremiumPlacementSource);
  private brandPerf = inject(BrandPerformanceSource);
  private auth = inject(AuthService);
  private an = inject(AnalyticsService);
  n = fmtNumber;
  session = this.auth.session();
  isAdmin = this.session?.role === "admin";
  loading = true;
  firstLoad = true;
  ppConfigured = true;
  advertiserName = "";
  impressions = 0;
  clicks = 0;
  adItems: PpCreative[] = [];
  kpis: BrandKpis | null = null;
  period: Period = "MTD";
  status: Status = "active";
  readonly statusOptions = ["Submitted", "Accepted", "Completed"]; // capped — vendors/admins never see more than these
  statuses: string[] = [...this.statusOptions];                    // proposal-status filter (YoY widgets); default all three
  cFrom = "";
  cTo = "";
  lightbox: string | null = null;
  // Admin Brand picker (vendors are locked, so these stay unused for them)
  advertisers: PpAdvertiser[] = [];
  brandId = "";
  brandName = "";       // the AdButler advertiser name (for display + Spotlight scope)
  redshiftBrand = "";   // resolved live Portal/Redshift brand (for the YoY widgets)
  brandMap: Record<string, string[]> = {};  // advertiserId -> Portal brand(s), from the admin Brand mapping screen

  get mappedAdvertisers(): PpAdvertiser[] { return this.advertisers.filter((a) => (this.brandMap[a.id] || []).length > 0); }

  /** Whether the view is scoped to a single brand yet (always true for vendors; true for admins once they pick). */
  get hasScope(): boolean { return !this.isAdmin || !!this.brandId; }
  get activeCount(): number { return this.adItems.filter((c) => c.active).length; }
  get shown(): PpCreative[] {
    return this.adItems.filter((c) => (this.status === "all" ? true : this.status === "active" ? c.active : !c.active));
  }

  openLightbox(url: string): void { this.lightbox = url; }
  onStatuses(s: string[]): void { this.statuses = s; this.load(); }  // proposal-status change → re-pull the YoY widgets
  setPeriod(p: Period): void { this.period = p; if (p !== "Custom") this.load(); }
  onCustom(ev: Event, which: "s" | "e"): void {
    const v = (ev.target as HTMLInputElement).value;
    if (which === "s") this.cFrom = v; else this.cTo = v;
    if (this.period === "Custom" && this.cFrom && this.cTo) this.load();
  }
  onBrand(id: string): void {
    this.brandId = id;
    this.brandName = (this.advertisers.find((a) => a.id === id) || { name: "" }).name;
    this.redshiftBrand = (this.brandMap[id] || [])[0] || this.resolveBrand(this.brandName); // explicit map wins; heuristic is the fallback
    this.status = "active"; // default to Active whenever a brand is picked
    this.load();
  }

  /** AdButler advertiser names are often shorter than the Redshift brand (e.g. "Origin" vs "Origin Acoustics").
   *  Resolve the picked advertiser name to the matching live Portal/Redshift brand so the YoY widgets scope right. */
  private resolveBrand(advName: string): string {
    const a = advName.trim().toLowerCase();
    if (!a) return advName;
    const brands = this.an.brandList || [];
    const lc = (b: string) => b.trim().toLowerCase();
    return brands.find((b) => lc(b) === a)
      || brands.find((b) => lc(b).startsWith(a) || a.startsWith(lc(b)))
      || advName;
  }

  dcls(v?: number): string { return v == null ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat"; }
  dtxt(v?: number): string { if (v == null) return ""; const a = Math.abs(Math.round(v)); return (v > 0 ? "▲ " : v < 0 ? "▼ " : "") + a + "% vs last year"; }

  private ymd(d: Date): string { return d.toISOString().slice(0, 10); }
  private range(): { from: string; to: string } {
    const now = new Date();
    if (this.period === "Custom") return { from: this.cFrom, to: this.cTo };
    if (this.period === "MTD") return { from: this.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: this.ymd(now) };
    if (this.period === "QTD") { const q = Math.floor(now.getMonth() / 3) * 3; return { from: this.ymd(new Date(now.getFullYear(), q, 1)), to: this.ymd(now) }; }
    return { from: this.ymd(new Date(now.getFullYear(), 0, 1)), to: this.ymd(now) }; // YTD
  }
  private perfFilter(from: string, to: string): AFilter {
    return {
      brand: this.isAdmin ? this.redshiftBrand : "admin", parents: [], subs: [], buyingGroups: [], suppliers: [], states: [],
      statuses: this.statuses.length ? this.statuses : [...this.statusOptions], // never empty → never leaks statuses beyond the capped three
      normalize: false, agg: "monthly", horizon: this.period, from: this.period === "Custom" ? from : "", to: this.period === "Custom" ? to : "",
    };
  }

  async ngOnInit(): Promise<void> {
    await this.an.ready(); // ensure the live Redshift brand list is loaded so resolveBrand() can map names
    if (this.isAdmin) {
      const [r, mp] = await Promise.all([
        this.pp.advertisers().catch(() => ({ configured: false, advertisers: [] as PpAdvertiser[] })),
        this.pp.getBrandMap().catch(() => ({ configured: false, map: {} as Record<string, string[]> })),
      ]);
      this.ppConfigured = r.configured; this.advertisers = r.advertisers; this.brandMap = mp.map;
      this.loading = false; // nothing loads until a brand is picked
    } else {
      this.load();
    }
  }

  async load(): Promise<void> {
    if (this.isAdmin && !this.brandId) {
      this.impressions = 0; this.clicks = 0; this.adItems = []; this.kpis = null; this.advertiserName = ""; this.loading = false;
      return;
    }
    const { from, to } = this.range();
    if (!from || !to) return;
    this.loading = true;
    try {
      const [ov, perf] = await Promise.all([
        this.pp.overview(from, to, this.isAdmin ? this.brandId : "").catch(() => ({ configured: false, advertiserName: "", impressions: 0, clicks: 0, adItems: [] as PpCreative[] })),
        this.brandPerf.get(this.perfFilter(from, to)).catch(() => null),
      ]);
      this.ppConfigured = ov.configured;
      this.advertiserName = ov.advertiserName;
      this.impressions = ov.impressions;
      this.clicks = ov.clicks;
      this.adItems = ov.adItems;
      this.kpis = perf ? perf.kpis : null;
    } finally {
      this.loading = false;
      this.firstLoad = false;
    }
  }
}
