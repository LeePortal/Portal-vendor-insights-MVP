import { PORTAL_REPORTS } from "./reports-catalog";

export interface DashCard { id: string; name: string; description: string; route: string[]; }
export interface DashGroup { id: string; name: string; adminOnly: boolean; cards: DashCard[]; }

/** Every dashboard, grouped. Portal Reports is internal (admin-only). */
export const DASHBOARD_GROUPS: DashGroup[] = [
  {
    id: "market-insights", name: "Market Insights", adminOnly: false,
    cards: [
      { id: "overview", name: "Brand Performance Overview", description: "Your brand's share of category, competitive index, sub-category and item breakdowns, proposal value, and competitive displacement.", route: ["/dashboards", "overview"] },
    ],
  },
  {
    id: "premium-placement", name: "Premium Placement", adminOnly: false,
    cards: [
      { id: "premium-overview", name: "Premium Placement Overview", description: "Advertiser performance and premium placement ROI across the Portal network. Coming soon.", route: ["/premium"] },
    ],
  },
  {
    id: "portal-reports", name: "Portal Reports", adminOnly: true,
    cards: PORTAL_REPORTS.map((r) => ({ id: r.id, name: r.name, description: r.description, route: ["/reports", r.id] })),
  },
];
