import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";

const ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};
// [row, col], 1-indexed, 8 rows x 11 cols tile-grid layout of the US.
const POS: Record<string, [number, number]> = {
  AK: [1, 1], ME: [1, 11], VT: [2, 10], NH: [2, 11],
  WA: [3, 1], ID: [3, 2], MT: [3, 3], ND: [3, 4], MN: [3, 5], WI: [3, 6], MI: [3, 7], NY: [3, 9], MA: [3, 10], RI: [3, 11],
  OR: [4, 1], NV: [4, 2], WY: [4, 3], SD: [4, 4], IA: [4, 5], IL: [4, 6], IN: [4, 7], OH: [4, 8], PA: [4, 9], NJ: [4, 10], CT: [4, 11],
  CA: [5, 1], UT: [5, 2], CO: [5, 3], NE: [5, 4], MO: [5, 5], KY: [5, 6], WV: [5, 7], VA: [5, 8], MD: [5, 9], DE: [5, 10],
  AZ: [6, 2], NM: [6, 3], KS: [6, 4], AR: [6, 5], TN: [6, 6], NC: [6, 7], SC: [6, 8], DC: [6, 9],
  OK: [7, 4], LA: [7, 5], MS: [7, 6], AL: [7, 7], GA: [7, 8],
  HI: [8, 1], TX: [8, 4], FL: [8, 9],
};

@Component({
  selector: "app-geoheat",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="geo-grid">
      <div *ngFor="let t of tiles" class="geo-tile" [style.grid-row]="t.row" [style.grid-column]="t.col"
           [style.background]="t.bg" [style.color]="t.fg" [title]="t.title">{{ t.abbr }}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:10px;color:var(--text-muted)">
      <span>Low</span>
      <span style="flex:1;max-width:160px;height:8px;border-radius:4px;background:linear-gradient(90deg, rgba(255,80,0,0.10), rgba(255,80,0,1))"></span>
      <span>High</span>
    </div>
  `,
  styles: [`
    .geo-grid { display: grid; grid-template-columns: repeat(11, 1fr); gap: 4px; max-width: 560px; }
    .geo-tile { aspect-ratio: 1 / 1; border-radius: 4px; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; border: 1px solid var(--border); }
  `],
})
export class GeoHeatComponent implements OnChanges {
  @Input() data: { label: string; value: number }[] = [];
  tiles: { abbr: string; row: number; col: number; bg: string; fg: string; title: string }[] = [];

  ngOnChanges(): void {
    const max = Math.max(1, ...this.data.map((d) => d.value));
    const byAbbr = new Map<string, number>();
    for (const d of this.data) { const a = ABBR[d.label]; if (a) byAbbr.set(a, d.value); }
    this.tiles = Object.keys(POS).map((abbr) => {
      const v = byAbbr.get(abbr) || 0;
      const a = abbr === "DC" ? (byAbbr.get("DC") || 0) : v;
      const alpha = 0.08 + 0.92 * (a / max);
      return {
        abbr, row: POS[abbr][0], col: POS[abbr][1],
        bg: "rgba(255,80,0," + alpha.toFixed(2) + ")",
        fg: alpha > 0.55 ? "#fff" : "var(--text)",
        title: abbr + ": $" + Math.round(a).toLocaleString("en-US"),
      };
    });
  }
}
