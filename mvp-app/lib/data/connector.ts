/**
 * The single seam between the app and its data source.
 *
 * The whole app talks to a DataConnector and never to the warehouse directly.
 * Today the factory returns the MockConnector (synthetic data). To go live,
 * implement these same methods against Redshift in redshift-connector.ts and
 * set DATA_SOURCE=redshift. Nothing else in the app needs to change.
 */
import type { Filters, Vendor } from "./seed";
import { MockConnector } from "./mock-connector";
import { RedshiftConnector } from "./redshift-connector";

export interface TrendPoint {
  period: string; // sort key, e.g. "2025-01" or "2025-Q1"
  label: string; // display label, e.g. "Jan '25"
  revenue: number;
  units: number;
  proposals: number;
}

export interface KpiSet {
  revenue: number;
  units: number;
  proposals: number;
  activeDealers: number;
  avgDealSize: number;
  revenueDeltaPct: number; // vs the immediately-preceding window of equal length
  categoryIndex: number; // brand revenue indexed to category average (100 = parity)
}

export interface CategoryRow {
  category: string;
  revenue: number;
  units: number;
  proposals: number;
}

export interface RegionRow {
  region: string;
  revenue: number;
}

export interface DealerRow {
  dealer: string;
  region: string;
  revenue: number;
  proposals: number;
}

export interface SharePoint {
  period: string;
  label: string;
  brandRevenue: number;
  categoryAvg: number;
  index: number; // brandRevenue / categoryAvg * 100
}

export interface DataConnector {
  listVendors(): Vendor[];
  getVendor(id: string): Vendor | undefined;
  getKpis(f: Filters): KpiSet;
  getRevenueTrend(f: Filters): TrendPoint[];
  getCategoryBreakdown(f: Filters): CategoryRow[];
  getRegionBreakdown(f: Filters): RegionRow[];
  getTopDealers(f: Filters, limit?: number): DealerRow[];
  getShareVsCategory(f: Filters): SharePoint[];
}

let _connector: DataConnector | null = null;

export function getConnector(): DataConnector {
  if (_connector) return _connector;
  const source = (process.env.DATA_SOURCE || "mock").toLowerCase();
  _connector = source === "redshift" ? new RedshiftConnector() : new MockConnector();
  return _connector;
}
