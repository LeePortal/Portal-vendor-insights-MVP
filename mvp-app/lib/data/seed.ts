/**
 * Synthetic, deterministic A/V-industry dataset.
 *
 * This stands in for Portal's real sales warehouse (Redshift) during the MVP.
 * Every number is generated from a fixed seed so the demo is stable across
 * reloads and deploys. Swap this out by implementing the DataConnector
 * interface against Redshift (see lib/data/redshift-connector.ts).
 *
 * Grain of the fact table: one row per (month, vendor, category, region).
 */

export type Aggregation = "monthly" | "quarterly";

export interface Vendor {
  id: string;
  name: string;
  primaryCategory: string;
  /** demo login that is scoped to this vendor */
  contactEmail: string;
}

export interface Filters {
  vendorId: string;
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
  regions?: string[];
  categories?: string[];
  aggregation?: Aggregation;
}

export interface Fact {
  ym: string; // YYYY-MM
  vendorId: string;
  category: string;
  region: string;
  revenue: number;
  units: number;
  proposals: number;
}

export const CATEGORIES = [
  "Audio",
  "Video & Displays",
  "Control & Automation",
  "Networking",
  "Security & Surveillance",
  "Power & Infrastructure",
  "Wire & Cable",
];

export const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];

export const VENDORS: Vendor[] = [
  { id: "sonos", name: "Sonos", primaryCategory: "Audio", contactEmail: "vendor@sonos.com" },
  { id: "lutron", name: "Lutron", primaryCategory: "Control & Automation", contactEmail: "vendor@lutron.com" },
  { id: "sony", name: "Sony Professional", primaryCategory: "Video & Displays", contactEmail: "vendor@sony.com" },
  { id: "samsung", name: "Samsung VXT", primaryCategory: "Video & Displays", contactEmail: "vendor@samsung.com" },
  { id: "denon", name: "Denon", primaryCategory: "Audio", contactEmail: "vendor@denon.com" },
  { id: "control4", name: "Control4", primaryCategory: "Control & Automation", contactEmail: "vendor@control4.com" },
  { id: "ubiquiti", name: "Ubiquiti", primaryCategory: "Networking", contactEmail: "vendor@ubiquiti.com" },
  { id: "klipsch", name: "Klipsch", primaryCategory: "Audio", contactEmail: "vendor@klipsch.com" },
  { id: "araknis", name: "Araknis Networks", primaryCategory: "Networking", contactEmail: "vendor@araknis.com" },
  { id: "luma", name: "Luma Surveillance", primaryCategory: "Security & Surveillance", contactEmail: "vendor@luma.com" },
];

export const DEALERS = [
  "Galaxy Custom AV", "ZOME Smart Home", "Simply Automated", "Malibu Wired",
  "Tomorrow Entertainment", "MGi Systems", "Elite Media Solutions", "Connect IT",
  "Summit Integration", "Cedar Park AV", "BlueWave Systems", "Harbor Smart Homes",
  "Apex Automation", "Northstar AV", "Pinnacle Integrators", "Coastal Control",
  "Vertex Media", "Lakeside Tech", "Ironwood AV", "Brightline Systems",
  "Meridian Smart", "Cascade Integration", "Highland AV", "Riverside Controls",
];

/* ------------------------------------------------------------------ */
/* deterministic generation                                            */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Build the inclusive list of YYYY-MM strings from start..end. */
export function monthRange(startYM: string, endYM: string): string[] {
  const out: string[] = [];
  let [y, m] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// 24 months ending June 2026 (the project "today").
export const ALL_MONTHS = monthRange("2024-07", "2026-06");

// Relative scale per vendor (bigger brands move more volume).
const VENDOR_SCALE: Record<string, number> = {
  sonos: 1.0, lutron: 0.95, sony: 1.15, samsung: 1.2, denon: 0.6,
  control4: 0.85, ubiquiti: 0.9, klipsch: 0.5, araknis: 0.7, luma: 0.55,
};

const REGION_WEIGHT: Record<string, number> = {
  Northeast: 0.24, Southeast: 0.22, Midwest: 0.18, Southwest: 0.16, West: 0.2,
};

function categoryWeight(vendor: Vendor, category: string): number {
  if (category === vendor.primaryCategory) return 0.5;
  // Adjacent spread, deterministic per vendor+category.
  const r = mulberry32(hashStr(vendor.id + "|" + category))();
  return 0.04 + r * 0.12;
}

let _facts: Fact[] | null = null;

export function getFacts(): Fact[] {
  if (_facts) return _facts;
  const facts: Fact[] = [];
  ALL_MONTHS.forEach((ym, monthIdx) => {
    const [, mm] = ym.split("-").map(Number);
    // Seasonality: Q4 lift, slight summer dip.
    const seasonal = 1 + 0.22 * Math.sin(((mm - 3) / 12) * 2 * Math.PI) + (mm >= 10 ? 0.12 : 0);
    // Gentle market growth over the 24 months.
    const trend = 1 + monthIdx * 0.012;
    for (const v of VENDORS) {
      for (const category of CATEGORIES) {
        const cw = categoryWeight(v, category);
        for (const region of REGIONS) {
          const rng = mulberry32(hashStr(`${ym}|${v.id}|${category}|${region}`));
          const noise = 0.8 + rng() * 0.45;
          const base = 120_000 * VENDOR_SCALE[v.id] * cw * REGION_WEIGHT[region];
          const revenue = Math.round(base * seasonal * trend * noise);
          if (revenue <= 0) continue;
          const avgPrice = 180 + rng() * 1400;
          const units = Math.max(1, Math.round(revenue / avgPrice));
          const proposals = Math.max(1, Math.round(units / (3 + rng() * 6)));
          facts.push({ ym, vendorId: v.id, category, region, revenue, units, proposals });
        }
      }
    }
  });
  _facts = facts;
  return facts;
}

/** Default reporting window = trailing 12 months of the dataset. */
export function defaultRange(): { start: string; end: string } {
  return { start: "2025-07-01", end: "2026-06-30" };
}

export function ymFromDate(d?: string): string | undefined {
  if (!d) return undefined;
  return d.slice(0, 7);
}
