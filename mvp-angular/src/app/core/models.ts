export type Aggregation = "monthly" | "quarterly";
export type Role = "vendor" | "admin";

export interface Session {
  email: string;
  name: string;
  role: Role;
  vendorId?: string;
  allowedParents?: string[];   // token scope (api mode): parent categories this user may see; [] == all
  allowedSubs?: string[];      // token scope: sub-categories; [] == all
  allowedStates?: string[];    // token scope: states; [] == all
  allowedBrands?: string[];    // token scope: brands this user may focus (visible-brands allow-list); [] == any
  perms?: Record<string, boolean>;  // control-visibility toggles (USER_PERMISSIONS); a key === false hides that control
  logo?: string;               // brand logo data-URL (vendor only), delivered at login for the shell + PDF header
}

export interface Vendor {
  id: string;
  name: string;
  primaryCategory: string;
  contactEmail: string;
}

export interface Filters {
  vendorId: string;
  start?: string;
  end?: string;
  regions?: string[];
  categories?: string[];
  aggregation?: Aggregation;
}

export interface Kpis {
  revenue: number;
  units: number;
  proposals: number;
  activeDealers: number;
  avgDealSize: number;
  revenueDeltaPct: number;
  categoryIndex: number;
}

export interface TrendPoint {
  period: string;
  label: string;
  revenue: number;
  units: number;
  proposals: number;
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
  index: number;
}

export type WidgetType =
  | "kpis"
  | "revenueTrend"
  | "categoryBreakdown"
  | "regionBreakdown"
  | "topDealers"
  | "shareVsCategory";

export interface DashboardDef {
  id: string;
  name: string;
  description: string;
  widgets: WidgetType[];
}

export type ActivityType = "login" | "dashboard_view" | "report_pull" | "csv_export";

export interface ActivityEvent {
  id: string;
  ts: number;
  vendorId: string;
  vendorName: string;
  userEmail: string;
  type: ActivityType;
  target?: string;
  durationSec?: number;
}

export const DASHBOARDS: DashboardDef[] = [
  {
    id: "overview",
    name: "Brand Performance Overview",
    description: "Your brand's share of category, competitive index, sub-category and item breakdowns, proposal value, and competitive displacement across the Portal network.",
    widgets: ["kpis", "shareVsCategory", "categoryBreakdown", "revenueTrend"],
  },
];
