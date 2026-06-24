import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PremiumPlacementSource, PpAdvertiser } from "../core/premium-placement.source";
import { AnalyticsService } from "../core/analytics.service";

/**
 * Admin Brand mapping screen (/admin/premium/mapping). Maps each AdButler advertiser to the Portal/Redshift
 * brand(s) it represents — the explicit link that replaces AdButler-name↔brand guessing. Read by the
 * /premium admin Brand picker and by the vendor scoping in /api/adbutler?action=overview. Advertisers come
 * live from AdButler (with ad-item counts); the brand options are the live Redshift brands. Saves per row.
 */
@Component({
  selector: "app-premium-mapping",
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .bm-row { display:grid; grid-template-columns:1.5fr 0.5fr 2.2fr; gap:14px; padding:13px 14px; border-bottom:1px solid var(--border); align-items:center; }
    .bm-row:last-child { border-bottom:none; }
    .bm-head { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); font-weight:700; }
    .bm-adv { font-size:14px; font-weight:600; color:var(--text); }
    .bm-id { font-size:11px; color:var(--text-faint); margin-top:1px; }
    .chip { display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:4px 10px; border-radius:999px; background:var(--surface-2); border:1px solid var(--border-strong); color:var(--text); }
    .chip button { border:0; background:transparent; color:var(--text-muted); cursor:pointer; font-size:14px; line-height:1; padding:0; }
    .bm-add { font:inherit; font-size:12px; padding:6px 9px; border-radius:8px; border:1px dashed var(--border-strong); background:#fff; color:var(--text-muted); min-width:150px; }
    .sugg { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:4px 10px; border-radius:999px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); }
    .accept { font:inherit; font-size:12px; padding:5px 11px; border-radius:8px; border:1px solid var(--accent); background:#fff; color:var(--accent); cursor:pointer; }
    .warn { font-size:12px; color:#b3243a; }
  `],
  template: `
    <a [routerLink]="['/admin']" [queryParams]="{ view: 'pp' }" class="muted" style="font-size:12px">&larr; Back to Premium Placement</a>

    <div class="page-head" style="margin-top:10px">
      <h1>Brand mapping</h1>
      <p>Map each AdButler advertiser to the Portal brand(s) it represents. Scopes Spotlight and Market Insights for admins and vendors.</p>
    </div>

    <div *ngIf="!loading && !configured" class="pcard" style="border:1px solid #ff5000;background:var(--accent-soft);margin-bottom:16px"><div class="bd" style="font-size:13px;color:#ff5000">The vendor store isn't connected, so mappings can't be saved yet.</div></div>

    <div class="pcard">
      <div class="hd"><div class="t">Advertisers</div><div class="s">{{ mappedCount }} of {{ advertisers.length }} mapped · changes save automatically</div></div>
      <div class="bd">
        <div *ngIf="loading" class="muted" style="font-size:13px">Loading…</div>
        <div *ngIf="!loading && !advertisers.length" class="muted" style="font-size:13px">No AdButler advertisers found.</div>
        <ng-container *ngIf="!loading && advertisers.length">
          <div class="bm-row bm-head"><div>AdButler advertiser</div><div>Ad items</div><div>Portal brand(s)</div></div>
          <div class="bm-row" *ngFor="let a of advertisers">
            <div><div class="bm-adv">{{ a.name }}</div><div class="bm-id">#{{ a.id }}</div></div>
            <div style="font-size:14px;color:var(--text)">{{ a.adItems || 0 }}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <span class="chip" *ngFor="let b of brandsFor(a.id)">{{ b }} <button (click)="removeBrand(a.id, b)" attr.aria-label="Remove {{ b }}">&times;</button></span>
              <ng-container *ngIf="!brandsFor(a.id).length && suggestion(a.name) as sg">
                <span class="muted" style="font-size:12px">Suggested</span>
                <span class="sugg">{{ sg }}</span>
                <button class="accept" (click)="addBrand(a.id, sg)">Accept</button>
              </ng-container>
              <span *ngIf="!brandsFor(a.id).length && !suggestion(a.name)" class="warn">unmapped</span>
              <select class="bm-add" (change)="onAdd(a.id, $event)">
                <option value="">+ Add brand…</option>
                <option *ngFor="let b of availableBrands(a.id)" [value]="b">{{ b }}</option>
              </select>
              <span *ngIf="saving === a.id" class="muted" style="font-size:12px">saving…</span>
            </div>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class PremiumMappingComponent implements OnInit {
  private pp = inject(PremiumPlacementSource);
  private an = inject(AnalyticsService);
  loading = true;
  configured = true;
  advertisers: PpAdvertiser[] = [];
  brands: string[] = [];
  map: Record<string, string[]> = {};
  saving = "";

  get mappedCount(): number { return this.advertisers.filter((a) => (this.map[a.id] || []).length > 0).length; }
  brandsFor(id: string): string[] { return this.map[id] || []; }
  availableBrands(id: string): string[] { const have = this.brandsFor(id); return this.brands.filter((b) => !have.includes(b)); }

  /** Prefix-match the advertiser name to a live brand (e.g. "Origin" -> "Origin Acoustics"); "" if none. */
  suggestion(advName: string): string {
    const a = advName.trim().toLowerCase();
    if (!a) return "";
    const lc = (b: string) => b.trim().toLowerCase();
    return this.brands.find((b) => lc(b) === a) || this.brands.find((b) => lc(b).startsWith(a) || a.startsWith(lc(b))) || "";
  }

  onAdd(id: string, ev: Event): void {
    const sel = ev.target as HTMLSelectElement;
    const b = sel.value; sel.value = "";
    if (b) this.addBrand(id, b);
  }
  addBrand(id: string, brand: string): void {
    const list = [...this.brandsFor(id)];
    if (!list.includes(brand)) list.push(brand);
    this.save(id, list);
  }
  removeBrand(id: string, brand: string): void {
    this.save(id, this.brandsFor(id).filter((b) => b !== brand));
  }
  private async save(id: string, list: string[]): Promise<void> {
    this.map = { ...this.map, [id]: list };  // optimistic
    this.saving = id;
    try { this.map = await this.pp.saveBrandMap(id, list); }
    finally { this.saving = ""; }
  }

  async ngOnInit(): Promise<void> {
    await this.an.ready();
    this.brands = [...(this.an.brandList || [])].sort((a, b) => a.localeCompare(b));
    const [advs, mp] = await Promise.all([
      this.pp.advertisers().catch(() => ({ configured: false, advertisers: [] as PpAdvertiser[] })),
      this.pp.getBrandMap().catch(() => ({ configured: false, map: {} as Record<string, string[]> })),
    ]);
    this.advertisers = [...advs.advertisers].sort((a, b) => (b.adItems || 0) - (a.adItems || 0) || a.name.localeCompare(b.name));
    this.configured = mp.configured;
    this.map = mp.map;
    this.loading = false;
  }
}
