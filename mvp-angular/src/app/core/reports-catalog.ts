/** Portal's internal Periscope reports, being recreated faithfully on Portal. */
export interface PortalReport { id: string; name: string; description: string; }

export const PORTAL_REPORTS: PortalReport[] = [
  { id: "dealer-catalog-troubleshooting", name: "Dealer Catalog Troubleshooting", description: "Diagnose catalog mapping gaps, unmatched SKUs, and supplier feed issues affecting dealer catalogs." },
  { id: "dealer-in-app-software-survey", name: "Dealer In-App Software Survey", description: "In-app survey responses on software usage, satisfaction, and feature requests from dealers." },
  { id: "dealer-payment-processor", name: "Dealer Payment Processor", description: "Which payment processors dealers use, adoption trends, and processor mix over time." },
  { id: "dealer-reports", name: "Dealer Reports", description: "Operational reporting across the dealer base — activity, proposals, and account health." },
  { id: "dh-dashboard", name: "DH Dashboard", description: "Distribution-house view of orders, fill rates, and category performance." },
  { id: "engagement-signups-promos", name: "Engagement - Sign-ups/Promos", description: "New dealer sign-ups and promotional campaign engagement and conversion." },
  { id: "integrations", name: "Integrations", description: "Third-party integration adoption and health across the dealer base." },
  { id: "payment-processing", name: "Payment Processing", description: "Payment volume, throughput, and processing performance across Portal." },
  { id: "product-category-detail-proposals-won", name: "Product & Category Detail on Proposals Won", description: "Product- and category-level detail on proposals that closed/won." },
  { id: "subscription", name: "Subscription", description: "Portal subscription metrics — plans, renewals, churn, and recurring revenue." },
  { id: "user-sessions-billing", name: "User Sessions & Billing", description: "User session activity correlated with billing and account usage." },
];

export function findReport(id: string): PortalReport | undefined { return PORTAL_REPORTS.find((r) => r.id === id); }
