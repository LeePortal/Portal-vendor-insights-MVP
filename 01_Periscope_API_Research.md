# Periscope / Sisense — API & Access Research

**Project:** Periscope Migration & Vendor Reporting MVP
**Prepared for:** Lee (Portal.io)
**Date:** June 19, 2026
**Status:** Phase 1 research — findings to inform MVP architecture and Product Brief

---

## TL;DR

- **Periscope Data is now "Sisense for Cloud Data Teams."** Sisense acquired Periscope (merger announced May 2019; rebrand January 2020). The product still runs at `app.periscopedata.com`, and the API endpoints still use the `periscopedata.com` domain. Documentation lives at `dtdocs.sisense.com`.
- **Yes, there is an API — actually several.** None of them is a single clean "run this SQL, get JSON back" REST API. Instead Periscope exposes a set of purpose-built APIs: embedding/publishing, shared-dashboard links, user/group management, role management (RBAC), a render (PDF/PNG) API, per-chart public CSV URLs, and a queryable **Usage Data** metadata repository.
- **Access is via a site-level API key** found under the gear menu → *Billing and Authentication*. Most calls authenticate with an `Http-X-Partner-Auth: <site-host>:<api-key>` header; embed URLs are signed with an HMAC-SHA256 of the API key over the URL path.
- **Two of the most useful capabilities are gated.** Whitelabel embedding and the User/Group Management API are paid add-ons / "select plans." We should confirm what Portal's current contract includes.
- **The migration-critical insight:** The Usage Data `charts` table stores the **full SQL text of every chart**, and Periscope is just a cache/visualization layer over Portal's *own* warehouse (e.g., Redshift). That means we can extract every dashboard's query and re-run it against our own warehouse — which is exactly the end-state this project is aiming for.
- **Usage Data maps almost 1:1 to the Portal admin tracking dashboard you want** (logins, time on site, reports pulled, data extracted). Details in Section 7.

---

## 1. Product status & naming

| Item | Detail |
|---|---|
| Original product | Periscope Data (periscopedata.com) |
| Current name | Sisense for Cloud Data Teams (a.k.a. "Sisense CDT") |
| Merger / rebrand | Merger announced May 2019; rebranded Jan 2020 |
| App host | `https://app.periscopedata.com/app/<site-name>` |
| API host | `https://app.periscopedata.com` and `https://www.periscopedata.com` |
| Docs | `https://dtdocs.sisense.com` |

Practical implication: any code or docs we write should treat "Periscope" and "Sisense for Cloud Data Teams" as the same system. The Sisense *Linux/Fusion* product is a **different** platform with a different API — don't confuse the two when the dev team searches for docs.

---

## 2. The APIs that exist

| API | What it does | How you call it | Notes / gating |
|---|---|---|---|
| **Visualization Publishing (Embed) API** | Renders a dashboard or single chart in an iframe, with filters/date-range/aggregation pre-set in the URL | `GET /api/embedded_dashboard?data={json}&signature={hmac}` | Core. Whitelabel (removing "Powered by Sisense" footer) is a **paid add-on**. |
| **Shared Dashboard API** | Create / list / delete persistent shared-dashboard links | `POST /api/v1/shared_dashboard/{create,list,delete}` | Uses `HTTP-X-PARTNER-AUTH` header. |
| **User & Group Management API** | CRUD users and groups; returns `last_login_at`, group membership, 2FA status | `GET/POST/PUT/DELETE /api/v1/users` and `/api/v1/groups` | **Available on select plans only** — returns 404 if not enabled. |
| **User & Role Management API (RBAC)** | Manage roles/privileges on RBAC-enabled sites | RBAC endpoints | For sites using Role-Based Access Control. |
| **Render API** | Generate a PNG/PDF screenshot of a dashboard | `POST /api/v1/screenshot_requests` | Useful for scheduled report snapshots. |
| **Public CSV URL** | Per-chart public URL returning the chart's result set as CSV | Per-chart `csv_url_token` | Cleanest way to pull *raw data* for a single chart programmatically. |
| **Usage Data** | A queryable metadata repository of the entire site (see Section 7) | Enabled in settings; queried like any connected dataset | This is how you audit/track everything. |

### 2.1 Embed / Visualization Publishing — capabilities worth replicating

The embed JSON blob supports a rich set of options we'll need to match in our own dashboards:

- `dashboard` (ID) and optional `chart`/`widget` (ID) for single-chart embeds
- `filters` — single values, multiple values, arrays, and **parent/child** filters (`group`)
- `daterange` — fixed start/end, "last N days," or current/last week/month
- `aggregation` — e.g., `daily`, `weekly`
- `visible` — which filters the end user is allowed to change
- `border`, `embed` version (`v2` removes padding)
- `data_ts` — data-freshness threshold to control refresh (Sisense recommends no more often than every 10 min)
- `expires_at` — link expiration, with optional `maintain_sessions_after_expiration`

It also emits **postMessages** to the host page — `viewport_changed` (filter changes), `dashboard_resize`, `drilldown`, and accepts a `refresh_charts` trigger. We can use this same event pattern in the MVP so the surrounding Portal chrome stays in sync with the embedded/native charts.

### 2.2 Authentication mechanics

- **API key location:** gear menu (bottom-left) → *Billing and Authentication* → *Authentication*. The key is **site-unique** and effectively a master credential — it must be stored as a secret/env var and rotated via Sisense support if leaked.
- **Header auth (management + shared-dashboard APIs):** `Http-X-Partner-Auth: <site-host>:<api-key>` against base URL `https://app.periscopedata.com`. Example site-host: the `example_site` portion of `app.periscopedata.com/app/example_site`.
- **Signed URLs (embed):** signature = `hex(HMAC_SHA256(api_key, url_path))` where the path includes the URL-encoded JSON blob. This is a server-side operation — the key must never reach the browser.

---

## 3. Getting data *out* of Periscope (the part that matters for migration)

Lee's MVP plan is to "connect directly to Periscope and run the data from there." There is **no documented general-purpose query API** that takes arbitrary SQL and returns JSON. The realistic mechanisms, ranked by usefulness for our MVP:

1. **Re-run chart SQL against Portal's own warehouse (recommended).** The `charts.sql` column in Usage Data contains the *complete* SQL for every chart. Periscope is a caching/visualization layer on top of Portal's own data warehouse (Redshift/Snowflake/etc.). So the cleanest path is: pull every chart's SQL from Usage Data → execute it directly against our warehouse → render with our own charting layer. This is also the eventual end-state of the whole project, so the MVP doubles as a head start on the real migration.
2. **Public CSV URL (per chart).** Each chart can expose a public CSV endpoint via its `csv_url_token`. Good for pulling a specific result set programmatically without re-implementing SQL, but it's one chart at a time and depends on the token being enabled.
3. **Embed/iframe (visual only).** Fastest way to make the MVP *look* identical, but it renders Periscope's own UI inside an iframe and does not give us the underlying data or our own look-and-feel. Useful as a stopgap or for hard-to-replicate charts.
4. **Render API (PDF/PNG).** Snapshot images of dashboards — good for scheduled report archives, not for interactive data.

**Recommendation for the MVP:** Drive the MVP from **option 1 (chart SQL → our warehouse)** wherever feasible, falling back to **option 2 (CSV URL)** for charts that are awkward to port. This avoids a hard dependency on iframes and means the MVP is genuinely a prototype of the target platform, not a Periscope wrapper.

---

## 4. Security & access model we must replicate

Periscope's gating is what makes the vendor data safe to expose, so the MVP has to reproduce these concepts:

| Periscope concept | What it controls | MVP equivalent |
|---|---|---|
| **Spaces** (data-level permissions) | Isolates dashboards/data so a group only sees its own slice | Per-vendor tenant scoping — the core of "Brand A can't see Brand B's data" |
| **Groups** + **Group Dashboard Permissions** | Which groups can view/edit which dashboards | Role/group → dashboard access map |
| **RBAC** (Roles, Role Privileges, Role Object Permissions) | Fine-grained permissions on dashboards/topics | Role definitions in the MVP |
| **User types** (View / SQL / Discovery) | What a user can do (view-only vs. author) | Vendor users = view-only; Portal staff = admin |
| **SSO** (Okta, Google, Azure AD, OneLogin) + **SCIM** | Enterprise login & provisioning | MVP simulates gated login now; real build should plan for SSO/SCIM |
| **2FA** | Account security | Note for production, not MVP |

The most important one for vendor reporting is **Spaces / data-level permissions** — that's the mechanism that guarantees each manufacturer sees only their own sales data. Our row-level/tenant security model is the thing we must get right.

---

## 5. Filtering model to replicate

Periscope's filter types (each documented separately) define the interactivity vendors expect:

- Direct Replacement filters, Custom filters, Aggregation filters
- Date Range filters
- Parent–Child filters (dependent dropdowns)
- Drilldowns
- Default filters set at the dashboard level
- "User-friendly names" mapping raw values to display labels

The embed API's `filters`, `daterange`, `aggregation`, and `visible` parameters are the public surface of this. The MVP should implement at least: multi-select value filters, date-range, aggregation toggle, parent/child dependency, and drilldown.

---

## 6. Migration considerations / risks

- **Add-on dependencies.** Whitelabel embedding and the User/Group Management API are not on every plan. If Portal's plan lacks the management API, we can still get user/login data from the **Usage Data** `users` table + `time_on_site_logs`, but programmatic provisioning would be unavailable.
- **API key is a master secret.** One key per site; it can change any embed. Keep server-side, rotate on exposure.
- **Usage Data history starts when enabled.** `query_logs` and `time_on_site_logs` only contain data from the month Usage Data was switched on. If it isn't enabled yet on Portal's site, enable it now so history accrues before/through the migration.
- **No bulk "export everything" API.** Porting dashboards is a per-chart exercise (SQL extraction + re-implementation). Plan effort accordingly; the chart count is the main scope driver.
- **Cache vs. origin.** Some queries hit Periscope's cache rather than the origin DB. When we re-run SQL against our warehouse directly, freshness/performance will differ and may need its own caching layer.

---

## 7. Usage Data → the Portal admin tracking dashboard

This is the strongest find for your "Portal view" dashboard. Periscope's **Usage Data** repository already records nearly everything you listed. Mapping your requirements to source tables/columns:

| You want to track | Source (Usage Data unless noted) | Key fields |
|---|---|---|
| **Logins** | `users` table / User Management API | `last_login_at` (per-user) |
| **Time on site** | `time_on_site_logs` | `user_id`, `dashboard_id`, `seconds`, `focused_tab` (active tab vs. background), hourly `created_at` |
| **Pages / dashboards viewed** | `time_on_site_logs` + `dashboards` + `urls` | `dashboard_id` joined to `dashboards.name`; `urls` for chart/dashboard links |
| **Reports pulled / queries run** | `query_logs` | `user_id`, `item_type` (Chart/View/SQL Alert), `item_id`, `runtime_ms`, `database_name`, `destination` (cache vs. origin) |
| **Data extracted (CSV)** | `csvs` + `charts.csv_url_token` | CSV creation events; `csv_url_token` identifies the source of a public CSV pull |
| **Who can see what** | `groups`, `user_group_memberships`, `group_dashboard_permissions`, `spaces`, RBAC tables | full access map per user/group/space |
| **Content inventory** | `charts`, `dashboards`, `views`, `filters`, `sql_snippets`, `sql_alerts` | includes `sql` text, owners, timestamps, archive state |

**Implication:** The admin dashboard can be built directly on these tables. For the MVP we can either (a) query Periscope's Usage Data, or (b) instrument our own app and log the same events to our database — which is preferable long-term because it captures activity in *our* platform, not Periscope. Recommended approach: model our own activity-events table on the shape of `query_logs` + `time_on_site_logs` so it's future-proof and Periscope-independent.

---

## 8. What this means for the MVP architecture (working recommendation)

- **Render natively, not via iframe.** Pull chart SQL from Usage Data, run against Portal's warehouse, render with our own component library so the app fully matches Portal.io's look and feel. Use CSV-URL or iframe embeds only as fallbacks for stubborn charts.
- **Tenant security first.** Implement Spaces-equivalent data scoping as the backbone — each vendor/brand is a tenant; every query is scoped to their data. This is the single most important thing to get right.
- **First-party activity logging.** Instrument the MVP to log logins, page/dashboard views, time-on-site, queries, and exports into our own events store (modeled on Periscope's Usage Data schema) so the Portal admin dashboard runs on our data.
- **Secrets stay server-side.** Any Periscope API key (for the MVP's direct-to-Periscope phase) lives only on the server; embed signatures are computed server-side.

---

## 9. Open questions to resolve with the Periscope account

1. Does Portal's current Periscope plan include the **User/Group Management API** and **whitelabel** embedding? (Determines provisioning + iframe fallback options.)
2. Is **Usage Data enabled** on the site today? If not, enable it immediately so login/query/time-on-site history starts accruing.
3. What is the **underlying warehouse** Periscope connects to (Redshift, per internal references?), and do we have direct read credentials to it for the MVP?
4. Roughly **how many dashboards/charts** are in scope to port? (Main effort driver.)
5. Which vendors/brands and access tiers exist today, and how are **Spaces/groups** currently structured?

---

## Sources

- [Visualization Publishing (Embed API) — Sisense for Cloud Data Teams](https://dtdocs.sisense.com/article/embed-api)
- [Visualization Publishing — Options](https://dtdocs.sisense.com/article/embed-api-options)
- [User and Group Management API](https://dtdocs.sisense.com/article/user-and-group-management-api)
- [Usage Data Dictionary](https://dtdocs.sisense.com/article/usage-data-dictionary)
- [Render API](https://dtdocs.sisense.com/article/render-api)
- [Data-Level Permissions (Spaces)](https://dtdocs.sisense.com/article/spaces)
- [Managing User Permissions — RBAC](https://dtdocs.sisense.com/article/managing-user-permissions-rbac)
- [Sisense announces Periscope Data is now Sisense for Cloud Data Teams (PR Newswire)](https://www.prnewswire.com/news-releases/sisense-announces-merged-product-evolution-periscope-data-is-now-sisense-for-cloud-data-teams-300983706.html)
