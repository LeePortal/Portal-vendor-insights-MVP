# Production handoff — seams & build spec

Status: **living handoff doc.** Purpose: let the dev team take this MVP to production by *porting* it onto their stack — not redesigning it. It maps what is durable (keep / re-implement against a fixed contract) vs. disposable (MVP host plumbing, expected to be replaced), documents every seam where the two meet, and captures the metric definitions and serving-layer design so nothing has to be reverse-engineered.

The guiding principle: **the durable asset is the contracts, definitions, and UI — not the Vercel plumbing.** Where we did this right, moving to production is a config change, not a rewrite.

---

## 1. Durable vs. disposable

| Layer | Durable (keep / honor the contract) | Disposable (MVP host; replace in prod) |
|---|---|---|
| Front end | The Angular app, components, filters, report HTML, loading UX | — |
| Data access | `BrandPerformanceSource` + the `BrandPerfPayload` contract | The 3 Vercel functions that currently implement it |
| Metrics | The SQL **definitions** (what each number means) | That they run live on Vercel per request |
| Reports | The renderer-agnostic report HTML + SVG | The headless-Chromium render function |
| Identity | The `Session` shape the app consumes | The mock `AuthService` + hardcoded `resolveTenant()` |
| Persistence | The data-model interfaces (`VUser`, `Company`, etc.) | `localStorage` as the store |
| Config | That all of it is centralized | The specific values (URLs, env) |

Nothing in the current structure forces a UI rewrite. The two things that **must be gotten right before production** are the **metric definitions** (§5) and **real auth/authorization** (§4c) — because both get baked into the production serving layer.

---

## 2. Backend HTTP seam — the cleanest swap point

Every backend call lives in **one service** (`src/app/core/brand-performance.source.ts`) and uses **one constant** (`API_BASE_URL` in `src/app/core/app-config.ts`). Three endpoints:

| Endpoint | Method | Returns | Client method |
|---|---|---|---|
| `/api/brand-performance` | GET (filter params) | `BrandPerfPayload` (JSON) | `get()` |
| `/api/proposal-export` | GET (filter params) | CSV text (+ `X-Export-Rows`, `X-Export-Truncated`) | `exportProposals()` |
| `/api/report-pdf` | POST `{ html, header, footer }` | PDF (blob) | `renderPdf()` |

> **The API surface has since grown** beyond these three (which remain the Market Insights core). Also live, same pattern (token-verified, scope enforced server-side): `/api/session` (the token issuer), `/api/admin-vendors` (account-store CRUD), `/api/platform-stats` (network Home KPIs + revenue trend), `/api/signup` (self-serve free accounts), and the **Premium Placement** set — `/api/adbutler` (AdButler proxy), `/api/pp-mapping` (advertiser→brand map), `/api/new-dealers`. Premium Placement reads AdButler live (`ADBUTLER_API_KEY`, server-side); see `09_AdButler_API_Reference.md`.

**To point at production:** change `API_BASE_URL` (and flip `DATA_MODE` to `'api'`). That's the whole front-end change. Production re-implements the three endpoints on its own stack; as long as they honor the contracts below, the UI is untouched. (Optional nicety: move `API_BASE_URL`/`DATA_MODE` into Angular `environment.ts` files for per-env builds.)

### Contracts to honor
- **`BrandPerfPayload`** — defined in `src/app/core/brand-performance.contract.ts` (`brandRows`, `itemRows`, `subcatRows`, `share`, `kpis`, `submitted`, `accepted`, `won`, `lost`). This is the dashboard's single payload shape.
- **proposal-export** — UTF-8 CSV (BOM) with the agreed by-proposal columns; all brands within the caller's category scope; capped (currently 25k rows) with truncation signalled via response headers.
- **report-pdf** — generic "HTML in → PDF out." Body HTML is renderer-agnostic (static HTML + inline SVG, no JS), so the same payload renders under headless Chromium **or** WeasyPrint/Gotenberg. See §6 and `report-pdf-architecture` notes.

---

## 3. Persistence seam — MVP localStorage → production datastore

All client persistence is isolated inside core services, each behind a `load()`/`persist()` pair. Swap each to backend calls; the **interfaces are the contract**.

| Service | Key | Holds | Prod replacement |
|---|---|---|---|
| `vendor-admin.service.ts` | `pvi_vendor_admin_v7` | Companies, users, **subscriptions**, logos, free-signup flag | **Already server-backed** — Postgres via `/api/admin-vendors` (`lib/db.js`); localStorage is now just a cache |
| `download.service.ts` | `pvi_downloads` | Export/report audit log (time, IP, user) | Server-side audit log |
| `subscription.service.ts` | `pvi_subs_<email>` | Admin-only subscription fallback | Same store as vendor subscriptions |
| `custom-dashboard.service.ts` | (post-MVP) | Saved custom dashboards | Post-MVP feature store |
| `reports.service.ts` | report defs | Portal Reports catalog state | Backed by report config |
| `auth.service.ts` | `pvi_session` (sessionStorage) | Current session | Portal SSO session |

---

## 4. Auth & tenant seam — **the item that needs real work**

a. **Front-end login is a mock.** `AuthService` has hardcoded demo users and one password; session in `sessionStorage`. The durable piece is the `Session` shape (`email, name, role, vendorId`) the app consumes everywhere. Production swaps this for Portal SSO/identity, keeping that shape.

b. **The dashboard's "view as" / viewed brand** flows from the session into filters. Keep.

c. **Backend authorization — implemented (production-shaped).** Login goes through `/api/session`, which validates credentials server-side and issues a signed token (HMAC-SHA256, `lib/auth.js`, key = `AUTH_SECRET` env var). The data endpoints (`brand-performance`, `proposal-export`, `report-pdf`) verify the token and derive the tenant from its **claims, never from client input**: a vendor is locked to their own brand + allowed categories; an admin may view any brand (`?brand=`). Missing/invalid/forged tokens → 401.
   - **For production, swap only the token *issuer*** — real SSO instead of the demo `/api/session`, backed by the real user store. The verify + enforcement logic in the data endpoints carries over unchanged.
   - **Now enforced beyond brand-lock:** per-user **parent-category, sub-category, and state** restrictions and **control-visibility permissions** are carried in the token and enforced server-side (managed in the admin Vendor Management UI; see `08_Vendor_User_Store_and_Permissions.md`). Subscription status (company window) and the **free-signup** flag also ride in the token — free accounts are rejected from `/api/brand-performance` at the server, and the dashboards gate before loading any data.
   - **Still MVP:** the issuer uses a seeded user list with a single shared demo password — replaced by Portal SSO in production (the verify/enforce path downstream is unchanged). Requires `AUTH_SECRET` (without it, the API returns 401/500 by design).

---

## 5. Metric definitions — the durable spec (intentionally open & filter-driven)

The SQL in `api/brand-performance.js` *is* the definition of every dashboard number; it becomes the spec for the production rollups. Current definitions:
- **Category share / items / sub-cat:** sums over the fact table within the filtered category scope + Date Range window; `deleted = false` only.
- **KPIs + YoY:** the selected window vs. the same window one year earlier.
- **Date Range:** MTD/QTD/YTD presets or a Custom from/to window (validated `yyyy-mm-dd`; floored at **2022-01-01** — no reliable data before then; "All" was removed).
- **Normalize data (confirmed):** restrict to dealers present in **both** the selected window and the same window a year earlier (`dealerid IN (current ∩ prior-year)` via `INTERSECT`). Applied to share/items/series/KPIs; **not** yet applied to the proposal-funnel/displacement sections (open decision — §8).
- **Competitive displacement:** the deleted-item swap/displacement self-join.
- **Proposal funnel (submitted/accepted):** stage-defined sections.

**Note on the older schema doc.** `06_Portal_Data_Schema_Map.md` describes metric rules written for an *earlier, more rigid product* (hard-coded normalization, a fixed ~35-category scope, closed-won-only reporting). These dashboards are **deliberately open and filter-driven** — status, categories, date range, and normalization are all user-controlled — so they are *expected* to differ from that doc. Do **not** force-fit the dashboards to it, and do not re-introduce hard-coded normalization or a capped category list. The dashboards' own filter-driven definitions (above) are the spec; confirm any specifics with the data team, but treat doc 06 as historical reference, not the standard.

---

## 6. Performance / serving layer (see `05_Scaling_to_Production`)

The data refreshes **nightly**, so live-querying Redshift per click is the wrong pattern for scale. Target architecture (durable design; build on the prod stack):
1. **Nightly rollups** next to Redshift (after the Airbyte load) at the grain the dashboard needs (brand × parentcat × subcat × state × status × period). The current SQL defines these.
2. **A serving store / shared cache** the API reads from (Postgres/ClickHouse/DuckDB, or KV/Redis), keyed by tenant+filters, warmed nightly. Sub-second, high-concurrency, leaves the warehouse alone.
3. **Per-scope precompute, not per-vendor** — most vendors see 2–3 categories and many share category sets, so cache by category-scope to dedupe.
4. **Subscriber pre-render** — we already know each subscriber's dashboards (§3); the nightly job can pre-render their reports (data, and even the finished PDF) so delivery/first-view is instant.
5. **Prefetch-on-login** — kick off the user's default view at login as a perceived-latency polish, once the data behind it is fast.

This sits behind the same `/api` contract — an infrastructure swap, not a UI change. (Scheduled-email *delivery* for subscriptions is also not yet built — flagged in the app.)

---

## 7. Disposable MVP plumbing (inventory)

- `mvp-angular/api/brand-performance.js`, `proposal-export.js`, `report-pdf.js` — Vercel serverless adapters.
- `mvp-angular/vercel.json` — Vercel function config (memory/timeouts).
- `@sparticuz/chromium` + `puppeteer-core` — the serverless Chromium for `report-pdf` (prod swaps to WeasyPrint/Gotenberg).
- `DATA_MODE='synthetic'` generator (`analytics.service.ts`, `data.service.ts`) — offline/demo data path.
- `localStorage` stores (§3) and the mock `AuthService` (§4).

---

## 8. Open decisions (for Lee / dev team)

1. **MVP → prod relationship.** Working assumption: keep the Angular front end, replace the backend/data plumbing. Confirm.
2. **Production renderer** for reports: reuse the existing **WeasyPrint** pipeline, or stand up **Gotenberg**/Chromium? (Template works under either.)
3. **Production backend stack** (Node/Python/dbt + orchestrator) — determines where the serving layer and endpoints live.
4. **Normalize scope** — apply the both-windows cohort to the proposal-funnel/displacement sections too, or keep it to share/KPIs?
5. **Metric definitions** (§5) — confirm the open, filter-driven definitions with the data team; do *not* force-fit the older hard-coded spec (doc 06).

---

## 9. Migration checklist (suggested order)

1. Confirm the open, filter-driven metric definitions with the data team (don't force-fit the older doc 06).
2. Implement real auth + **server-side** tenant/category authorization (§4c).
3. Stand up the serving layer: nightly rollups + cache; point the 3 endpoints at it (§6).
4. Replace `localStorage` stores with backend persistence (§3).
5. Swap the report renderer (Chromium → WeasyPrint/Gotenberg); keep the HTML (§6).
6. Point `API_BASE_URL` at production; build with `environment.ts` per env (§2).
7. Wire scheduled-email delivery for subscriptions.
8. Add subscriber pre-render + prefetch-on-login (§6).
9. Load-test concurrent vendors.
