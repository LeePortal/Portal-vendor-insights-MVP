/** Faithful specs for the Portal Reports, captured from Periscope (scrolled to mount every widget).
 *  Aggregate KPI numbers are kept from Periscope; row-level data is synthesized (no PII). */
export interface KpiSpec { label: string; value: string; }
export interface BarRow { label: string; value: number; }
export interface LineSeriesSpec { label: string; values: number[]; }
export type ReportWidget =
  | { type: "kpis"; items: KpiSpec[] }
  | { type: "bars"; title: string; rows: BarRow[]; money?: boolean; span?: number }
  | { type: "lines"; title: string; axis: string[]; series: LineSeriesSpec[]; yLabel?: string; span?: number }
  | { type: "table"; title: string; columns: string[]; rows: (string | number)[][]; span?: number }
  | { type: "note"; text: string; tone?: "support" | "info"; span?: number };
export interface ReportSpec {
  id: string; name: string; description: string;
  aggregation?: boolean; dateRange?: boolean;
  customFilters?: { label: string; options: string[] }[];
  widgets: ReportWidget[];
}

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export const REPORT_SPECS: Record<string, ReportSpec> = {
  subscription: {
    id: "subscription", name: "Subscription",
    description: "Portal subscription metrics — plans, sign-ups, trials, cancellations and billing health.",
    aggregation: true, dateRange: true,
    customFilters: [{ label: "Subscription Status", options: ["Active", "Trialing", "Past Due", "Will Cancel", "Cancelled"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Total Paid Plan Subscriptions", value: "2,349" },
        { label: "Active Paid Subscriptions", value: "2,320" },
        { label: "Subscriptions in Billing Failure", value: "30" },
        { label: "Subscriptions in 'Will Cancel'", value: "12" },
        { label: "Total Active Trials", value: "60" },
      ]},
      { type: "bars", title: "Subscription Plan Mix", span: 1, money: false, rows: [
        { label: "Pro", value: 1238 }, { label: "SNAPFREE", value: 1066 }, { label: "Premium2024", value: 637 },
        { label: "Lite", value: 202 }, { label: "SONOSFREE", value: 143 }, { label: "Pro Annual", value: 107 },
        { label: "Unlimited2024", value: 89 }, { label: "Premium-Annual2024", value: 35 },
        { label: "Unlimited-Annual2024", value: 10 }, { label: "Lite Annual", value: 1 }, { label: "Premium Annual", value: 1 },
      ]},
      { type: "table", title: "Subscription Plan Mix", span: 1, columns: ["Plan Name", "Subscribers", "Percentage"], rows: [
        ["Pro", "1,238", "35.08%"], ["SNAPFREE", "1,066", "30.21%"], ["Premium2024", "637", "18.05%"],
        ["Lite", "202", "5.72%"], ["SONOSFREE", "143", "4.05%"], ["Pro Annual", "107", "3.03%"],
        ["Unlimited2024", "89", "2.52%"], ["Premium-Annual2024", "35", "0.99%"], ["Unlimited-Annual2024", "10", "0.28%"],
        ["Lite Annual", "1", "0.03%"], ["Premium Annual", "1", "0.03%"], ["Total", "3,529", "100.00%"],
      ]},
      { type: "lines", title: "Monthly vs Annual", span: 2, yLabel: "Subscriptions", axis: MONTHS, series: [
        { label: "Monthly", values: [2950, 3010, 3080, 3140, 3190, 3240, 3270, 3300, 3330, 3350, 3365, 3375] },
        { label: "Annual", values: [118, 122, 128, 131, 135, 139, 142, 146, 149, 151, 153, 154] },
      ]},
      { type: "kpis", items: [
        { label: "New Sign Ups", value: "19,423" },
        { label: "Subscribed During Date Range", value: "2,349" },
        { label: "Trialing During Date Range", value: "60" },
        { label: "Cancelled During Date Range", value: "620" },
      ]},
      { type: "table", title: "Active Subscribed Companies", span: 2, columns: ["Name", "Subscribed Date", "Status", "Plan", "Total", "Promo Code"], rows: [
        ["Sapphire Audio Visual", "2026-06-17", "Active", "Premium2024", "$179.00", ""],
        ["Gather Systems", "2026-06-11", "Active", "Pro", "$89.00", ""],
        ["Voltedge", "2026-06-03", "Active", "Premium2024", "$178.99", "AUTO50OFF6"],
        ["Amity Audio Video", "2026-05-27", "Active", "Pro", "$89.00", ""],
        ["Smart Sync Integration", "2026-05-22", "Active", "NEW-LITE", "$29.00", ""],
      ]},
      { type: "table", title: "Dealers in 'Will Cancel'", span: 2, columns: ["Name", "Cancel Initiated", "Cancelled Date", "Plan"], rows: [
        ["Aspen Creative House", "2026-04-29", "2026-10-30", "PROYEAR"],
        ["Smart Homz", "2026-05-21", "2026-06-19", "Premium2024"],
        ["MVP Security Systems", "2026-05-26", "2026-06-20", "Pro"],
        ["Media Systems", "2026-06-11", "2026-06-21", "NEW-LITE"],
      ]},
      { type: "table", title: "Subscription Trialing Companies", span: 2, columns: ["Name", "Sign Up Date", "Trial End", "Time Left", "Promo Code"], rows: [
        ["Texas AVT", "2026-06-16", "2026-06-30", "11 days", ""],
        ["Margins Lighting and AV", "2026-06-16", "2026-06-30", "10 days", ""],
        ["Citrus Data LLC", "2026-06-13", "2026-06-27", "7 days", ""],
        ["STG", "2026-04-22", "2026-06-22", "3 days", "AIN50"],
      ]},
      { type: "table", title: "Subscription Cancelled Companies", span: 2, columns: ["Name", "Cancelled Date", "Sign Up Date", "Last Login", "Plan", "Total"], rows: [
        ["Blount Media Corp.", "2026-06-15", "2021-04-05", "2025-09-11", "Pro", "$89.00"],
        ["United Technical Solutions", "2026-06-15", "2023-12-01", "2026-01-13", "NEW-LITE", "$29.00"],
        ["The Audio Guy", "2026-06-12", "2017-09-27", "2026-05-20", "Pro", "$89.00"],
        ["JPCS Group", "2026-06-10", "2025-04-18", "2026-02-27", "Premium2024", "$179.00"],
      ]},
      { type: "table", title: "All Users - Active, Trials, etc", span: 2, columns: ["Name", "Plan Code", "Status", "Total", "Time Left"], rows: [
        ["Hooked Up Installs", "Pro", "Active", "$89.00", "30 days"],
        ["Ursa Security & Controls", "NEW-LITE", "Active", "$29.00", "30 days"],
        ["McGrath Digital", "SNAPFREE", "Active", "$0.00", "31 days"],
        ["Enhanced Home, Inc.", "", "Cancelled", "$89.00", "31 days"],
        ["AMB", "", "Trial Expired", "", "13 days"],
      ]},
    ],
  },
  "dealer-catalog-troubleshooting": {
    id: "dealer-catalog-troubleshooting", name: "Dealer Catalog Troubleshooting",
    description: "Dealer custom Cost, Sell Price & MSRP overrides, unlocked suppliers and category counts — for Support.",
    dateRange: true,
    widgets: [
      { type: "note", tone: "support", span: 2, text: "DO NOT DELETE — this dashboard is for Support. Dealer custom Cost, Custom Sell Price and Custom MSRP overrides." },
      { type: "table", title: "Custom MSRP by Dealer", span: 1, columns: ["Dealer", "Brand", "Model", "Custom MSRP"], rows: [
        ["Summit Integration", "Sonos", "ARC-BLK", "$1,099.00"], ["Northstar AV", "Sanus", "VLF728", "$399.99"],
        ["Pinnacle Integrators", "Control4", "EA-3", "$1,250.00"], ["Vertex Media", "Samsung", "QN85QN1EF", "$2,249.99"],
      ]},
      { type: "table", title: "Custom Cost by Dealer", span: 1, columns: ["Dealer", "Brand", "Model", "Custom Cost"], rows: [
        ["Summit Integration", "Sonos", "ARC-BLK", "$770.00"], ["Northstar AV", "Sanus", "VLF728", "$240.00"],
        ["Pinnacle Integrators", "Control4", "EA-3", "$812.00"], ["Vertex Media", "Samsung", "QN85QN1EF", "$2,100.00"],
      ]},
      { type: "table", title: "Custom Sell Price", span: 2, columns: ["Dealer", "Brand", "Model", "Custom Sell Price"], rows: [
        ["Summit Integration", "Sonos", "ARC-BLK", "$999.00"], ["Northstar AV", "Sanus", "VLF728", "$329.99"],
        ["Pinnacle Integrators", "Control4", "EA-3", "$1,100.00"], ["Vertex Media", "Samsung", "QN85QN1EF", "$2,199.99"],
      ]},
      { type: "table", title: "Unlocked Supplier", span: 2, columns: ["Supplier", "Price Tier", "Last Imported Date", "Email"], rows: [
        ["Origin Acoustics", "US Dealer", "2026-05-22", "sales@originacoustics.com"],
        ["Snap One", "Wholesale/NonRewards", "2026-06-10", ""],
        ["ICE Cable", "Dealer 1", "2026-06-03", "orders@icecable.com"],
        ["Truaudio", "Level 1 - Dealer", "2026-06-18", "sales@truaudio.com"],
        ["Crestron", "US Dealer", "2026-06-16", ""],
      ]},
      { type: "table", title: "CategoryStuff", span: 2, columns: ["User ID", "Email", "Count"], rows: [
        ["14229", "user1@summitintegration.com", "3,097"], ["14662", "user2@northstarav.com", "2,251"],
        ["26266", "user3@pinnacleint.com", "1,411"], ["20963", "user4@coastalcontrol.com", "865"],
        ["2626", "user5@vertexmedia.com", "645"],
      ]},
    ],
  },
  "dealer-in-app-software-survey": {
    id: "dealer-in-app-software-survey", name: "Dealer In-App Software Survey",
    description: "In-app survey responses on which CRM / business tools dealers use, by plan.",
    widgets: [
      { type: "bars", title: "CRM Tools by # Dealers", span: 2, money: false, rows: [
        { label: "No CRM", value: 254 }, { label: "QuickBooks", value: 18 }, { label: "iPoint", value: 16 },
        { label: "Monday.com", value: 13 }, { label: "Zoho", value: 10 }, { label: "ProjX360", value: 8 },
        { label: "Pipedrive", value: 7 }, { label: "HubSpot", value: 6 }, { label: "Salesforce", value: 6 }, { label: "ServiceTitan", value: 4 },
      ]},
      { type: "table", title: "CRM Tool Survey Count", span: 2, columns: ["CRM", "# Dealers", "Free", "Lite", "Pro", "Premium", "Unlimited", "Last Responded"], rows: [
        ["No CRM", "254", "20", "3", "54", "130", "46", "2026-06-19"],
        ["QuickBooks", "18", "2", "0", "6", "9", "1", "2026-04-01"],
        ["iPoint", "16", "1", "0", "1", "8", "6", "2026-04-22"],
        ["Monday.com", "13", "1", "0", "1", "10", "1", "2026-04-30"],
        ["Zoho", "10", "2", "0", "3", "5", "0", "2026-04-28"],
        ["ProjX360", "8", "1", "0", "0", "6", "1", "2026-03-13"],
        ["HubSpot", "6", "1", "0", "3", "2", "0", "2026-04-20"],
      ]},
      { type: "table", title: "CRM Tool Dealer Detail", span: 2, columns: ["CRM", "Dealer Name", "Dealer Size", "First", "Last", "Email", "Plan"], rows: [
        ["QuickBooks", "Summit Integration", "Medium (5 to 10)", "Brian", "Adams", "brian@summitintegration.com", "Pro"],
        ["iPoint", "Northstar AV", "Medium (5 to 10)", "Greg", "Dixon", "greg@northstarav.com", "Premium"],
        ["Monday.com", "Pinnacle Integrators", "Large (11 to 25)", "Lars", "Severson", "lars@pinnacleint.com", "Pro"],
        ["ProjX360", "Vertex Media", "Large (11 to 25)", "Jake", "Strawser", "jake@vertexmedia.com", "Premium"],
        ["HubSpot", "Ironwood AV", "Large (11 to 25)", "Otto", "Wallen", "otto@ironwoodav.com", "Premium"],
      ]},
    ],
  },
  "dealer-payment-processor": {
    id: "dealer-payment-processor", name: "Dealer Payment Processor",
    description: "Default payment processor adoption across the dealer base, and integration status.",
    dateRange: true,
    widgets: [
      { type: "kpis", items: [
        { label: "Portal-Stripe", value: "1,842" }, { label: "Stripe Standard", value: "611" },
        { label: "QuickBooks", value: "274" }, { label: "Square", value: "96" },
      ]},
      { type: "bars", title: "Default Payment Processor — Dealer Mix", span: 2, money: false, rows: [
        { label: "Portal-Stripe", value: 1842 }, { label: "Stripe Standard", value: 611 },
        { label: "QuickBooks", value: 274 }, { label: "Square", value: 96 },
      ]},
      { type: "table", title: "Processor Integration Status", span: 2, columns: ["Processor", "Dealers", "% of Base", "Integration"], rows: [
        ["Portal-Stripe", "1,842", "65.0%", "Native"], ["Stripe Standard", "611", "21.6%", "Native"],
        ["QuickBooks", "274", "9.7%", "QBO Integration"], ["Square", "96", "3.4%", "Integration"],
      ]},
    ],
  },
  "dealer-reports": {
    id: "dealer-reports", name: "Dealer Reports",
    description: "Dealer proposal data, contacts, parts, libraries and orders — filterable by dealer, category and date.",
    dateRange: true,
    customFilters: [
      { label: "Dealer", options: ["Summit Integration", "Northstar AV", "Pinnacle Integrators", "Coastal Control", "Vertex Media", "Lakeside Tech"] },
      { label: "Product Category", options: ["Speakers", "TVs", "Networking", "Mounting Brackets", "Power Management", "Surveillance", "Window Treatments"] },
    ],
    widgets: [
      { type: "note", tone: "info", span: 2, text: "Dealer Proposal Data — proposals, contacts, parts, custom/labor/fee libraries and order records." },
      { type: "table", title: "Proposal Data", span: 1, columns: ["Proposal ID", "Dealer", "Status", "Created", "Total"], rows: [
        ["1009811", "Summit Integration", "Submitted", "2025-05-14", "$42,750.20"],
        ["1009883", "Northstar AV", "Draft", "2025-06-02", "$18,940.00"],
        ["1010078", "Pinnacle Integrators", "Completed", "2025-04-21", "$91,300.50"],
        ["1010093", "Vertex Media", "Accepted", "2025-06-11", "$33,180.75"],
      ]},
      { type: "table", title: "Proposal Contacts", span: 1, columns: ["Proposal ID", "Dealer", "Contact", "Email"], rows: [
        ["1009811", "Summit Integration", "That Nguyen", "tnguyen@example.com"],
        ["1009883", "Northstar AV", "Stephen Mathis", "smathis@example.com"],
        ["1010078", "Pinnacle Integrators", "Keith Parker", "kparker@example.com"],
      ]},
      { type: "table", title: "Custom Library", span: 2, columns: ["Company ID", "Brand", "Model", "Description", "Created", "Cost", "Sell Price"], rows: [
        ["69660", "EC", "100", "Additional Wiring & Misc Materials", "2017-06-01", "", "$349.00"],
        ["8073", "Samsung", "QN85QN1EF", "85\" Neo QLED 4K Smart TV (2025)", "2025-05-04", "$2,100.00", "$2,249.99"],
        ["4723", "Leon", "Hz55UX", "Horizon Soundbar 98\"", "2025-06-17", "$4,220.00", "$6,925.00"],
        ["11020", "Triad", "55602", "Silver Series In-Ceiling Omni SE 5.25\"", "2025-01-26", "$1,006.06", "$2,095.86"],
      ]},
      { type: "table", title: "Labor Library", span: 1, columns: ["Company ID", "Name", "Cost", "Sell Price"], rows: [
        ["1788", "Copper TV prewire labor", "", "$20.49"],
        ["1886", "Crestron Programming — Living Room", "", "$145.00"],
        ["1838", "Install TV on articulating mount + AV connect", "", "$599.00"],
      ]},
      { type: "table", title: "Fee Library", span: 1, columns: ["Company ID", "Name", "Description", "Sell Price"], rows: [
        ["11233", "Permits", "Permitting & Project Compliance", "$500.00"],
        ["11233", "Travel", "Travel for On-Site Service", "$100.00"],
        ["800", "Rush Fee", "Rush Fee", "$1.00"],
      ]},
      { type: "table", title: "Individual Proposal Parts - Accepted Options", span: 2, columns: ["Dealer", "Status", "Proposal", "Brand", "Model", "Qty", "Sell"], rows: [
        ["Summit Integration", "Submitted", "1009811", "Lutron RadioRA 2", "Sivoia QS Triathlon", "1", "$837.10"],
        ["Pinnacle Integrators", "Completed", "1010078", "Lenovo", "4AU028", "25", "$1,620.00"],
        ["Vertex Media", "Accepted", "1010093", "Lutron", "LUTRON-SHADES", "1", "$2,799.99"],
      ]},
      { type: "table", title: "Orders (no part breakdown)", span: 1, columns: ["Supplier", "Sum", "PO Ref", "Status"], rows: [
        ["Snap One", "$15,215.21", "Braverman", "Partially Submitted"],
        ["KOA Electronics", "$1,168.30", "Luraas", "Partially Submitted"],
        ["Pioneer Music Company", "$4,025.18", "Cosgrove", "Submitted"],
      ]},
      { type: "table", title: "Order Links - Internal", span: 1, columns: ["Supplier", "PO Ref", "Status"], rows: [
        ["SF Marketing (SFM)", "119980-1", "Partially Submitted"],
        ["ICE Cable", "Bolad", "Submitted"],
        ["Crestron", "Burgess2", "Partially Submitted"],
      ]},
      { type: "table", title: "Attachments / Packages", span: 2, columns: ["Host Item", "Model", "Name", "Qty", "Item Type"], rows: [
        ["202", "CCM682 White", "Speaker Prewire", "1", "Labor"],
        ["202", "CCM682 White", "In-Ceiling Speaker Installation", "1", "Labor"],
        ["202", "CCM682 White", "PMK C8 Black", "1", "Product"],
      ]},
      { type: "note", tone: "info", span: 2, text: "Additional large CSV exports on this dashboard: Individual Proposal Parts, Individual Proposal Labor, Individual Proposal Custom Items, Proposal Data (Deleted), Orders with parts, Proposal Options, Favorite Products." },
    ],
  },
  "engagement-signups-promos": {
    id: "engagement-signups-promos", name: "Engagement - Sign-ups/Promos",
    description: "New dealer sign-ups and promotional code engagement over time.",
    aggregation: true, dateRange: true,
    customFilters: [{ label: "Buying Group", options: ["HTSA", "Azione", "ProSource", "AIN", "Oasis"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Sign-ups (90 days)", value: "214" }, { label: "Avg / Day", value: "2.4" },
        { label: "Promo Redemptions", value: "63" }, { label: "Buying-Group Sign-ups", value: "48" },
      ]},
      { type: "lines", title: "Portal Sign Ups", span: 2, yLabel: "Sign-ups", axis: ["6/6", "6/7", "6/8", "6/9", "6/10", "6/11", "6/12", "6/13", "6/14", "6/15", "6/16", "6/17", "6/18", "6/19"], series: [
        { label: "Sign-ups", values: [1, 2, 1, 1, 3, 5, 5, 2, 4, 6, 5, 4, 3, 2] },
      ]},
      { type: "bars", title: "Promo Codes — Engagement", span: 2, money: false, rows: [
        { label: "AUTO50OFF6", value: 31 }, { label: "WELCOME10", value: 16 }, { label: "AIN50", value: 11 },
        { label: "SNAPFREE", value: 8 }, { label: "REFER50", value: 6 },
      ]},
    ],
  },
  integrations: {
    id: "integrations", name: "Integrations",
    description: "Dealer adoption of third-party integrations (Zoho, Salesforce) and enabled services.",
    aggregation: true, dateRange: true,
    customFilters: [{ label: "Enabled Service", options: ["Proposals - D-Tools SI Proposal Push", "Integrations - Hubspot", "Catalog - Wesco Integration", "Integrations - QBO - Push Invoices", "Proposals - AI Proposal Builder", "People - Accounts"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Zoho Dealers", value: "146" }, { label: "Salesforce Dealers", value: "38" }, { label: "Enabled Services", value: "1,204" },
      ]},
      { type: "table", title: "Zoho Dealers", span: 2, columns: ["Company", "Plan", "Connected", "Name", "Proposals Pushed", "Contacts Linked"], rows: [
        ["Summit Integration", "Snap One Free", "2025-12-02", "Nadav Doron", "12", "48"],
        ["Northstar AV", "Pro", "2025-05-23", "Micah Kagin", "34", "120"],
        ["Pinnacle Integrators", "Premium", "2025-08-29", "Josh Walker", "8", "26"],
        ["Coastal Control", "Pro", "2025-11-06", "Joe Iannotti", "19", "61"],
        ["Vertex Media", "Unlimited", "2025-10-24", "Rori Ross", "27", "88"],
      ]},
      { type: "table", title: "SalesForce Dealers", span: 2, columns: ["Company", "Plan", "Connected", "Name", "Proposals Pushed", "Contacts Linked"], rows: [
        ["Ironwood AV", "Premium", "2026-04-28", "Tony Talluto", "9", "31"],
        ["Brightline Systems", "Pro", "2026-03-15", "Dana Cole", "5", "18"],
      ]},
      { type: "table", title: "Enabled Services", span: 2, columns: ["Service", "Dealers Enabled"], rows: [
        ["Proposals - D-Tools SI Proposal Push", "142"], ["Integrations - Hubspot", "96"],
        ["Catalog - Wesco Integration", "73"], ["Integrations - QBO - Push Invoices", "210"],
        ["Proposals - AI Proposal Builder", "318"], ["People - Accounts", "165"],
      ]},
    ],
  },
  "payment-processing": {
    id: "payment-processing", name: "Payment Processing",
    description: "Processing volume by company across all processors — total, credit card, ACH, and payment requests.",
    dateRange: true,
    customFilters: [{ label: "DealerPay", options: ["Portal-Stripe", "Stripe Standard", "QuickBooks", "Square", "Check", "Zelle"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Total Processing Volume", value: "$48.2M" }, { label: "CC Volume", value: "$29.7M" },
        { label: "ACH Volume", value: "$18.5M" }, { label: "Approved Transactions", value: "127,940" },
      ]},
      { type: "bars", title: "Top Companies by Total Volume", span: 2, money: true, rows: [
        { label: "AMS Sound & Vision", value: 2051304 }, { label: "A/V Performance Innovations", value: 2050521 },
        { label: "ARIA Collective Design", value: 789437 }, { label: "A.B.E. Networks", value: 629666 },
        { label: "AAP", value: 608756 }, { label: "ALs WiFi & Electric", value: 587885 }, { label: "3D Sound & Security", value: 556209 },
      ]},
      { type: "table", title: "Total Processing Volume by Company — All Processors", span: 1, columns: ["ID", "Name", "Plan", "Volume"], rows: [
        ["3167", "AMS Sound & Vision", "Premium2024", "$2,051,304.99"],
        ["5984", "A/V Performance Innovations", "Premium2024", "$2,050,521.01"],
        ["50520", "ARIA Collective Design", "Premium2024", "$789,437.93"],
        ["35376", "A.B.E. Networks", "Unlimited2024", "$629,666.57"],
        ["17656", "AAP", "Pro", "$608,756.11"],
      ]},
      { type: "table", title: "CC vs ACH Volume by Company", span: 1, columns: ["Name", "CC Volume", "ACH Volume"], rows: [
        ["A/V Performance Innovations", "$695,055.59", "$1,355,465.42"],
        ["AMS Sound & Vision", "$0.00", "$2,051,304.99"],
        ["A.B.E. Networks", "$191,376.60", "$438,289.97"],
        ["AAP", "$341,374.67", "$267,381.44"],
      ]},
      { type: "table", title: "ACH Transactions — All Processors", span: 2, columns: ["Name", "Paid Date", "Amount", "Processor"], rows: [
        ["Harbor Smart Homes", "2026-06-06", "$6,046.89", "QB"],
        ["Harbor Smart Homes", "2026-05-06", "$3,785.11", "QB"],
        ["Harbor Smart Homes", "2023-11-09", "$3,779.11", "PortalStripe"],
        ["Apex Automation", "2026-04-18", "$2,380.73", "QB"],
      ]},
      { type: "kpis", items: [
        { label: "Max Processing Time", value: "4d 6h" }, { label: "Avg Processing Time", value: "11h 20m" }, { label: "Min Processing Time", value: "2m" },
      ]},
      { type: "table", title: "Payment Request Statuses (by date range)", span: 2, columns: ["Request #", "Customer", "Amount", "Status", "Method", "Proposal", "Paid Date"], rows: [
        ["646", "Walter S.", "$1,363.13", "Paid", "Check", "Router and WAPs", "2026-06-20"],
        ["295", "Brandon M.", "$2,361.72", "Paid", "QB", "Marine Drive", "2026-06-20"],
        ["1572", "Hugh & Debbie S.", "$6,949.57", "Paid", "Check", "Starlink and network install", "2026-06-20"],
        ["232", "Karen D.", "$4,000.00", "Paid", "Zelle", "AV Upgrade", "2026-06-13"],
        ["712", "Josh P.", "$7,392.14", "Paid", "Stripe", "Network", "2026-06-20"],
      ]},
      { type: "note", tone: "info", span: 2, text: "Additional large CSV exports: Approved Transactions (by date range), CC Trans — All Processors." },
    ],
  },
  "product-category-detail-proposals-won": {
    id: "product-category-detail-proposals-won", name: "Product & Category Detail on Proposals Won",
    description: "Product- and category-level detail on proposals that closed/won.",
    dateRange: true,
    customFilters: [{ label: "Proposal Category", options: ["Speakers", "TVs", "Networking", "Mounting Brackets", "Power Management", "Surveillance", "Control Systems"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Proposals Won", value: "18,432" }, { label: "Total $ Won", value: "$214.6M" },
        { label: "Avg $ / Proposal", value: "$11,642" }, { label: "Distinct Products", value: "92,418" },
      ]},
      { type: "bars", title: "$ Won by Category", span: 2, money: true, rows: [
        { label: "Speakers", value: 38420000 }, { label: "TVs", value: 31250000 }, { label: "Control Systems", value: 24180000 },
        { label: "Networking", value: 19940000 }, { label: "Mounting Brackets", value: 14210000 },
        { label: "Surveillance", value: 11870000 }, { label: "Power Management", value: 9320000 },
      ]},
      { type: "table", title: "Product Detail on Won Proposals", span: 2, columns: ["Category", "Brand", "Model", "Units Won", "$ Won"], rows: [
        ["Speakers", "Sonos", "ARC", "4,210", "$4,205,790"],
        ["TVs", "Samsung", "QN85QN1EF", "1,180", "$2,654,988"],
        ["Networking", "Ubiquiti", "UDM-PRO", "6,940", "$3,810,060"],
        ["Control Systems", "Control4", "EA-3", "2,330", "$2,912,500"],
        ["Mounting Brackets", "Sanus", "VLF728", "8,120", "$2,679,919"],
      ]},
    ],
  },
  "user-sessions-billing": {
    id: "user-sessions-billing", name: "User Sessions & Billing",
    description: "User session activity correlated with subscription billing and active-user changes.",
    dateRange: true,
    customFilters: [{ label: "Company", options: ["Summit Integration", "Northstar AV", "Pinnacle Integrators", "Coastal Control", "Vertex Media"] }],
    widgets: [
      { type: "kpis", items: [
        { label: "Sessions (30 days)", value: "84,201" }, { label: "Active Users", value: "5,118" },
        { label: "Additional Active Users", value: "612" }, { label: "Add-on MRR", value: "$16,940" },
      ]},
      { type: "lines", title: "Session Counts", span: 2, yLabel: "Sessions", axis: ["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6", "Wk7", "Wk8", "Wk9", "Wk10", "Wk11", "Wk12"], series: [
        { label: "Sessions", values: [16200, 16850, 17100, 17640, 18020, 18550, 18900, 19240, 19680, 20010, 20380, 20720] },
      ]},
      { type: "table", title: "Subscription Activity", span: 2, columns: ["Company ID", "Name", "Item Type", "Note", "Price", "Period Start"], rows: [
        ["38", "Tech Connectors", "Active Users", "Plan Included Active User", "", "2026-04-01"],
        ["244", "All Media Consultants", "Active Users", "Plan Included Active User", "", "2026-04-01"],
        ["256", "Stage Digital Advisors", "Active Users", "Additional Active User", "$19.00", "2026-04-01"],
        ["8772", "Get Smart AV", "ACH", "ACH Trans Fee", "$10.00", "2026-04-04"],
        ["543", "High-Tech Living Experience, LLC", "Plan", "Pro", "$89.00", "2026-04-04"],
      ]},
      { type: "table", title: "Additional Active Users", span: 2, columns: ["Company", "Note", "Price", "Plan", "Created"], rows: [
        ["Pro Audio Services", "Additional Active User", "$29.00", "Premium2024", "2026-06-20"],
        ["Dependent Technologies", "Additional Active User", "$29.00", "Premium2024", "2026-06-20"],
        ["Native Smart Properties", "Additional Active User", "$29.00", "Premium2024", "2026-06-15"],
        ["ForTech Solutions", "Additional Active User", "$19.00", "Pro", "2026-06-08"],
      ]},
    ],
  },
};
