import { Injectable } from "@angular/core";
import {
  Aggregation,
  CategoryRow,
  DealerRow,
  Filters,
  Kpis,
  RegionRow,
  SharePoint,
  TrendPoint,
  Vendor,
} from "./models";

/**
 * DataService — the single seam between the UI and its data source.
 *
 * Today it computes everything from a deterministic synthetic A/V dataset
 * (stands in for Portal's Redshift warehouse). To go live, replace the method
 * bodies with HttpClient calls to a backend that runs the equivalent SQL
 * against Redshift — the return shapes stay identical, so the UI is unchanged.
 * Every query is scoped by vendorId (the tenant) derived from the session.
 */

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

interface Fact {
  ym: string;
  vendorId: string;
  category: string;
  region: string;
  revenue: number;
  units: number;
  proposals: number;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngOf(s: string): number {
  let seed = hashStr(s) | 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function monthRange(startYM: string, endYM: string): string[] {
  const out: string[] = [];
  let y = Number(startYM.split("-")[0]);
  let m = Number(startYM.split("-")[1]);
  const ey = Number(endYM.split("-")[0]);
  const em = Number(endYM.split("-")[1]);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const ALL_MONTHS = monthRange("2024-07", "2026-06");
const VENDOR_SCALE: Record<string, number> = {
  sonos: 1.0, lutron: 0.95, sony: 1.15, samsung: 1.2, denon: 0.6,
  control4: 0.85, ubiquiti: 0.9, klipsch: 0.5, araknis: 0.7, luma: 0.55,
};
const REGION_WEIGHT: Record<string, number> = {
  Northeast: 0.24, Southeast: 0.22, Midwest: 0.18, Southwest: 0.16, West: 0.2,
};

function categoryWeight(v: Vendor, category: string): number {
  if (category === v.primaryCategory) return 0.5;
  return 0.04 + rngOf(v.id + "|" + category) * 0.12;
}

function ym(d?: string): string | undefined {
  return d ? d.slice(0, 7) : undefined;
}

@Injectable({ providedIn: "root" })
export class DataService {
  readonly categories = CATEGORIES;
  readonly regions = REGIONS;
  private facts: Fact[] = this.build();

  private build(): Fact[] {
    const facts: Fact[] = [];
    ALL_MONTHS.forEach((m, idx) => {
      const mm = Number(m.split("-")[1]);
      const seasonal = 1 + 0.22 * Math.sin(((mm - 3) / 12) * 2 * Math.PI) + (mm >= 10 ? 0.12 : 0);
      const trend = 1 + idx * 0.012;
      for (const v of VENDORS) {
        for (const category of CATEGORIES) {
          const cw = categoryWeight(v, category);
          for (const region of REGIONS) {
            const noise = 0.8 + rngOf(`${m}|${v.id}|${category}|${region}`) * 0.45;
            const base = 120000 * VENDOR_SCALE[v.id] * cw * REGION_WEIGHT[region];
            const revenue = Math.round(base * seasonal * trend * noise);
            if (revenue <= 0) continue;
            const avgPrice = 180 + rngOf(`${m}|${v.id}|${category}|${region}|p`) * 1400;
            const units = Math.max(1, Math.round(revenue / avgPrice));
            const proposals = Math.max(1, Math.round(units / (3 + rngOf(`${m}|${v.id}|${region}|q`) * 6)));
            facts.push({ ym: m, vendorId: v.id, category, region, revenue, units, proposals });
          }
        }
      }
    });
    return facts;
  }

  listVendors(): Vendor[] { return VENDORS; }
  getVendor(id: string): Vendor | undefined { return VENDORS.find((v) => v.id === id); }

  private windowMonths(f: Filters): string[] {
    const start = ym(f.start) || "2025-07";
    const end = ym(f.end) || "2026-06";
    return ALL_MONTHS.filter((m) => m >= start && m <= end);
  }
  private priorWindow(months: string[]): string[] {
    if (!months.length) return [];
    const startIdx = ALL_MONTHS.indexOf(months[0]);
    const from = Math.max(0, startIdx - months.length);
    return ALL_MONTHS.slice(from, startIdx);
  }
  private filtered(f: Filters, months = this.windowMonths(f)): Fact[] {
    const ms = new Set(months);
    const rs = f.regions && f.regions.length ? new Set(f.regions) : null;
    const cs = f.categories && f.categories.length ? new Set(f.categories) : null;
    return this.facts.filter(
      (r) => r.vendorId === f.vendorId && ms.has(r.ym) && (!rs || rs.has(r.region)) && (!cs || cs.has(r.category)),
    );
  }
  private sum(rows: Fact[], key: "revenue" | "units" | "proposals"): number {
    let s = 0;
    for (const r of rows) s += r[key];
    return s;
  }

  private quarter(ymv: string): { key: string; label: string } {
    const y = Number(ymv.split("-")[0]);
    const m = Number(ymv.split("-")[1]);
    const q = Math.floor((m - 1) / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} '${String(y).slice(2)}` };
  }
  private mLabel(ymv: string): string {
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[Number(ymv.split("-")[1]) - 1]} '${ymv.slice(2, 4)}`;
  }
  private dealerRegion(d: string): string { return REGIONS[hashStr(d) % REGIONS.length]; }

  getKpis(f: Filters): Kpis {
    const months = this.windowMonths(f);
    const rows = this.filtered(f, months);
    const revenue = this.sum(rows, "revenue");
    const units = this.sum(rows, "units");
    const proposals = this.sum(rows, "proposals");
    const prior = this.filtered(f, this.priorWindow(months));
    const priorRev = this.sum(prior, "revenue");
    const revenueDeltaPct = priorRev > 0 ? ((revenue - priorRev) / priorRev) * 100 : 0;
    const dealers = this.getTopDealers(f, 999);
    const activeDealers = dealers.filter((d) => d.revenue > revenue * 0.005).length;

    const cats = f.categories && f.categories.length ? f.categories : [this.getVendor(f.vendorId)!.primaryCategory];
    const ms = new Set(months);
    const rs = f.regions && f.regions.length ? new Set(f.regions) : null;
    const cs = new Set(cats);
    const peer = this.facts.filter((r) => ms.has(r.ym) && cs.has(r.category) && (!rs || rs.has(r.region)));
    const brandRev = this.sum(peer.filter((r) => r.vendorId === f.vendorId), "revenue");
    const vendorsInCat = new Set(peer.map((r) => r.vendorId)).size || 1;
    const categoryAvg = this.sum(peer, "revenue") / vendorsInCat;
    const categoryIndex = categoryAvg > 0 ? (brandRev / categoryAvg) * 100 : 100;

    return {
      revenue, units, proposals, activeDealers,
      avgDealSize: proposals > 0 ? revenue / proposals : 0,
      revenueDeltaPct, categoryIndex,
    };
  }

  getRevenueTrend(f: Filters): TrendPoint[] {
    const agg: Aggregation = f.aggregation || "monthly";
    const buckets = new Map<string, TrendPoint>();
    for (const r of this.filtered(f)) {
      const { key, label } = agg === "quarterly" ? this.quarter(r.ym) : { key: r.ym, label: this.mLabel(r.ym) };
      const b = buckets.get(key) || { period: key, label, revenue: 0, units: 0, proposals: 0 };
      b.revenue += r.revenue; b.units += r.units; b.proposals += r.proposals;
      buckets.set(key, b);
    }
    return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  }

  getCategoryBreakdown(f: Filters): CategoryRow[] {
    const m = new Map<string, CategoryRow>();
    for (const r of this.filtered(f)) {
      const c = m.get(r.category) || { category: r.category, revenue: 0, units: 0, proposals: 0 };
      c.revenue += r.revenue; c.units += r.units; c.proposals += r.proposals;
      m.set(r.category, c);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }

  getRegionBreakdown(f: Filters): RegionRow[] {
    const m = new Map<string, number>();
    for (const r of this.filtered(f)) m.set(r.region, (m.get(r.region) || 0) + r.revenue);
    return REGIONS.map((region) => ({ region, revenue: m.get(region) || 0 })).sort((a, b) => b.revenue - a.revenue);
  }

  getTopDealers(f: Filters, limit = 10): DealerRow[] {
    const totalRevenue = this.sum(this.filtered(f), "revenue");
    const totalProposals = this.sum(this.filtered(f), "proposals");
    const inc = f.regions && f.regions.length ? new Set(f.regions) : new Set(REGIONS);
    const included = DEALERS.filter((d) => inc.has(this.dealerRegion(d)));
    const weights = included.map((d) => ({ d, w: 0.3 + rngOf(f.vendorId + "|" + d) }));
    const sumW = weights.reduce((s, x) => s + x.w, 0) || 1;
    return weights
      .map(({ d, w }) => ({
        dealer: d,
        region: this.dealerRegion(d),
        revenue: Math.round((totalRevenue * w) / sumW),
        proposals: Math.max(1, Math.round((totalProposals * w) / sumW)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  getShareVsCategory(f: Filters): SharePoint[] {
    const months = this.windowMonths(f);
    const agg: Aggregation = f.aggregation || "monthly";
    const cats = f.categories && f.categories.length ? f.categories : [this.getVendor(f.vendorId)!.primaryCategory];
    const cs = new Set(cats);
    const rs = f.regions && f.regions.length ? new Set(f.regions) : null;
    const ms = new Set(months);
    const peer = this.facts.filter((r) => ms.has(r.ym) && cs.has(r.category) && (!rs || rs.has(r.region)));
    const vendorsInCat = new Set(peer.map((r) => r.vendorId)).size || 1;
    const buckets = new Map<string, { period: string; label: string; brand: number; cat: number }>();
    for (const r of peer) {
      const { key, label } = agg === "quarterly" ? this.quarter(r.ym) : { key: r.ym, label: this.mLabel(r.ym) };
      const b = buckets.get(key) || { period: key, label, brand: 0, cat: 0 };
      if (r.vendorId === f.vendorId) b.brand += r.revenue;
      b.cat += r.revenue;
      buckets.set(key, b);
    }
    return [...buckets.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => {
        const categoryAvg = b.cat / vendorsInCat;
        return {
          period: b.period,
          label: b.label,
          brandRevenue: b.brand,
          categoryAvg: Math.round(categoryAvg),
          index: categoryAvg > 0 ? Math.round((b.brand / categoryAvg) * 100) : 100,
        };
      });
  }
}
