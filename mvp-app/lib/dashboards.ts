/**
 * Dashboard catalog. Each dashboard is a data-driven list of widgets, mirroring
 * how a Periscope dashboard is a collection of charts. Vendors only ever see
 * their own (tenant-scoped) data inside these.
 */
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

export const DASHBOARDS: DashboardDef[] = [
  {
    id: "overview",
    name: "Brand Performance Overview",
    description: "Headline KPIs, revenue trend, category and regional mix, top dealers, and category index.",
    widgets: ["kpis", "revenueTrend", "categoryBreakdown", "regionBreakdown", "topDealers", "shareVsCategory"],
  },
  {
    id: "category",
    name: "Category & Product Mix",
    description: "Where your revenue concentrates across product categories over time.",
    widgets: ["kpis", "categoryBreakdown", "revenueTrend"],
  },
  {
    id: "dealers",
    name: "Dealer & Channel",
    description: "Your strongest integrators and regional distribution of sales.",
    widgets: ["kpis", "topDealers", "regionBreakdown"],
  },
  {
    id: "competitive",
    name: "Competitive Index",
    description: "How your brand performs versus the category average across the period.",
    widgets: ["kpis", "shareVsCategory", "revenueTrend"],
  },
];

export function getDashboard(id: string): DashboardDef | undefined {
  return DASHBOARDS.find((d) => d.id === id);
}
