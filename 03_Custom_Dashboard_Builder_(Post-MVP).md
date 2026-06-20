# Custom Dashboard Builder — Post-MVP Concept

**Status: NOT in the MVP.** This is a prototyped future direction, kept in the app behind a "Future concept · not in MVP" label and documented here so the work isn't lost. It is admin-only and scoped to Market Insights data in the prototype.

## Why it's out of MVP scope

The MVP's job is to faithfully replace Periscope: gated vendor access, the Brand Performance dashboard, and the Portal Reports. A self-serve "build your own dashboard" capability is a larger product surface (semantic layer, query governance, performance, multi-tenant security) that should follow once the core migration is in production. It's been prototyped to prove the approach and de-risk the eventual build — not to ship in v1.

## The concept: data as Lego blocks

Rather than exposing raw warehouse tables (the reason general BI tools are heavy and risky), the builder exposes a small, curated **semantic layer**:

- **Measures** (what to count): Sales $, Units, # SKUs, Avg Unit $, # Brands.
- **Dimensions** (how to slice): Brand, Parent Category, Sub-Category.
- **Filters** (constraints): Parent Category, Sub-Category, Buying Group, State — at both the dashboard level (cascades to all widgets) and the per-widget level (the two intersect).

A user picks a **visualization** (KPI, Bar, Line, Table) and fills its typed slots with a measure + a group-by dimension + filters, with a live preview. Each widget is a small JSON spec — `{ measures, groupBy, filters, viz }` — never SQL.

It also includes a **Competitive** widget type with prebuilt insights: New Dealers, Dealers Lost (no sales in 6 months), Competitive Displacement (Won / Lost), Substitution Detail (which competitor SKUs replaced yours, ranked by units), Proposal Funnel (Proposed → Submitted → Accepted → Completed), and a Geographic Heatmap (50-state tile grid colored by sales).

Widgets compose into a dashboard (drag to reorder), which is saved and reopened. In the prototype, dashboards persist to local storage and run on synthetic data.

## What's prototyped today

- Semantic catalog (measures × dimensions) over the Market Insights data.
- Guided widget builder with live preview; KPI / Bar / Line / Table.
- Competitive insight widgets (above).
- Dashboard-wide filter bar + per-widget filters (intersected).
- Drag-to-reorder widgets; save / edit / delete custom dashboards.
- Admin-only access; gated in the nav and at the route level.

## Path to production

- **Semantic layer:** define measures/dimensions once in a headless layer (Cube.dev is the strong fit; dbt metrics an alternative). It compiles a `{ measures, dimensions, filters, timeDimensions }` request into Redshift SQL with **multi-tenant row security and caching/pre-aggregations** built in — which is exactly the "spec → safe, tenant-scoped SQL" problem to solve.
- **Governance:** reuse the per-user brand / parent-category restrictions already in the app; enforce row limits and query timeouts; only pre-approved measures (no arbitrary SQL).
- **Rendering:** the prototype's widget renderer is unchanged between the live preview and the saved dashboard, so the builder is purely an authoring layer over the same components the rest of the app uses.

## Suggested next blocks (when picked up)

Whitespace Dealers (dealers buying the category but not your brand — a conquest list) and Dealers at Risk (declining trend, early warning before they churn) are the highest-value additions and map cleanly onto data we already have.
