/**
 * MockConnector — computes every metric from the synthetic fact table in
 * seed.ts. It mirrors what the Redshift queries will eventually return, so the
 * UI is built against the final shape from day one.
 */
import {
  ALL_MONTHS,
  CATEGORIES,
  DEALERS,
  Fact,
  Filters,
  REGIONS,
  VENDORS,
  Vendor,
  defaultRange,
  getFacts,
  ymFromDate,
} from "./seed";
import type {
  CategoryRow,
  DataConnector,
  DealerRow,
  KpiSet,
  RegionRow,
  SharePoint,
  TrendPoint,
} from "./connector";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(s: string): number {
  let seed = hashStr(s) | 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function windowMonths(f: Filters): string[] {
  const def = defaultRange();
  const start = ymFromDate(f.start) || ymFromDate(def.start)!;
  const end = ymFromDate(f.end) || ymFromDate(def.end)!;
  return ALL_MONTHS.filter((m) => m >= start && m <= end);
}

function priorWindow(months: string[]): string[] {
  if (months.length === 0) return [];
  const startIdx = ALL_MONTHS.indexOf(months[0]);
  const len = months.length;
  const from = Math.max(0, startIdx - len);
  return ALL_MONTHS.slice(from, startIdx);
}

function quarterOf(ym: string): { key: string; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return { key: `${y}-Q${q}`, label: `Q${q} '${String(y).slice(2)}` };
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} '${String(y).slice(2)}`;
}

function dealerRegion(d: string): string {
  return REGIONS[hashStr(d) % REGIONS.length];
}

export class MockConnector implements DataConnector {
  private facts: Fact[] = getFacts();

  listVendors(): Vendor[] {
    return VENDORS;
  }

  getVendor(id: string): Vendor | undefined {
    return VENDORS.find((v) => v.id === id);
  }

  private filtered(f: Filters, months = windowMonths(f)): Fact[] {
    const monthSet = new Set(months);
    const regionSet = f.regions && f.regions.length ? new Set(f.regions) : null;
    const catSet = f.categories && f.categories.length ? new Set(f.categories) : null;
    return this.facts.filter(
      (r) =>
        r.vendorId === f.vendorId &&
        monthSet.has(r.ym) &&
        (!regionSet || regionSet.has(r.region)) &&
        (!catSet || catSet.has(r.category)),
    );
  }

  getKpis(f: Filters): KpiSet {
    const months = windowMonths(f);
    const rows = this.filtered(f, months);
    const revenue = sum(rows, "revenue");
    const units = sum(rows, "units");
    const proposals = sum(rows, "proposals");

    const prior = this.filtered(f, priorWindow(months));
    const priorRev = sum(prior, "revenue");
    const revenueDeltaPct = priorRev > 0 ? ((revenue - priorRev) / priorRev) * 100 : 0;

    const dealers = this.getTopDealers(f, 999);
    const activeDealers = dealers.filter((d) => d.revenue > revenue * 0.005).length;

    // Category index: this brand vs the average brand in the same categories/period.
    const cats = f.categories && f.categories.length ? f.categories : [this.getVendor(f.vendorId)!.primaryCategory];
    const monthSet = new Set(months);
    const regionSet = f.regions && f.regions.length ? new Set(f.regions) : null;
    const catSet = new Set(cats);
    const peerRows = this.facts.filter(
      (r) => monthSet.has(r.ym) && catSet.has(r.category) && (!regionSet || regionSet.has(r.region)),
    );
    const brandRev = sum(peerRows.filter((r) => r.vendorId === f.vendorId), "revenue");
    const vendorsInCat = new Set(peerRows.map((r) => r.vendorId)).size || 1;
    const categoryAvg = sum(peerRows, "revenue") / vendorsInCat;
    const categoryIndex = categoryAvg > 0 ? (brandRev / categoryAvg) * 100 : 100;

    return {
      revenue,
      units,
      proposals,
      activeDealers,
      avgDealSize: proposals > 0 ? revenue / proposals : 0,
      revenueDeltaPct,
      categoryIndex,
    };
  }

  getRevenueTrend(f: Filters): TrendPoint[] {
    const rows = this.filtered(f);
    const agg = f.aggregation || "monthly";
    const buckets = new Map<string, TrendPoint>();
    for (const r of rows) {
      const { key, label } = agg === "quarterly" ? quarterOf(r.ym) : { key: r.ym, label: monthLabel(r.ym) };
      const b = buckets.get(key) || { period: key, label, revenue: 0, units: 0, proposals: 0 };
      b.revenue += r.revenue;
      b.units += r.units;
      b.proposals += r.proposals;
      buckets.set(key, b);
    }
    return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  }

  getCategoryBreakdown(f: Filters): CategoryRow[] {
    const rows = this.filtered(f);
    const m = new Map<string, CategoryRow>();
    for (const r of rows) {
      const c = m.get(r.category) || { category: r.category, revenue: 0, units: 0, proposals: 0 };
      c.revenue += r.revenue;
      c.units += r.units;
      c.proposals += r.proposals;
      m.set(r.category, c);
    }
    return CATEGORIES.map((c) => m.get(c)).filter(Boolean).sort((a, b) => b!.revenue - a!.revenue) as CategoryRow[];
  }

  getRegionBreakdown(f: Filters): RegionRow[] {
    const rows = this.filtered(f);
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.region, (m.get(r.region) || 0) + r.revenue);
    return REGIONS.map((region) => ({ region, revenue: m.get(region) || 0 })).sort((a, b) => b.revenue - a.revenue);
  }

  getTopDealers(f: Filters, limit = 10): DealerRow[] {
    const totalRevenue = sum(this.filtered(f), "revenue");
    const totalProposals = sum(this.filtered(f), "proposals");
    const includedRegions = f.regions && f.regions.length ? new Set(f.regions) : new Set(REGIONS);
    const included = DEALERS.filter((d) => includedRegions.has(dealerRegion(d)));
    const weights = included.map((d) => ({ d, w: 0.3 + rng(f.vendorId + "|" + d) }));
    const sumW = weights.reduce((s, x) => s + x.w, 0) || 1;
    return weights
      .map(({ d, w }) => ({
        dealer: d,
        region: dealerRegion(d),
        revenue: Math.round((totalRevenue * w) / sumW),
        proposals: Math.max(1, Math.round((totalProposals * w) / sumW)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  getShareVsCategory(f: Filters): SharePoint[] {
    const months = windowMonths(f);
    const agg = f.aggregation || "monthly";
    const cats = f.categories && f.categories.length ? f.categories : [this.getVendor(f.vendorId)!.primaryCategory];
    const catSet = new Set(cats);
    const regionSet = f.regions && f.regions.length ? new Set(f.regions) : null;
    const monthSet = new Set(months);

    const peer = this.facts.filter(
      (r) => monthSet.has(r.ym) && catSet.has(r.category) && (!regionSet || regionSet.has(r.region)),
    );
    const vendorsInCat = new Set(peer.map((r) => r.vendorId)).size || 1;

    const buckets = new Map<string, { period: string; label: string; brand: number; cat: number }>();
    for (const r of peer) {
      const { key, label } = agg === "quarterly" ? quarterOf(r.ym) : { key: r.ym, label: monthLabel(r.ym) };
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

function sum<T extends Record<K, number>, K extends string>(rows: T[], key: K): number {
  let s = 0;
  for (const r of rows) s += r[key];
  return s;
}
