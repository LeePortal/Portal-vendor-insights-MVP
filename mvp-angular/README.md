# Portal Vendor Insights — MVP (Angular)

A working prototype of Portal.io's **vendor reporting platform** (replacing Periscope/Sisense), built
on Angular 18 (standalone) + Angular Material, themed with Portal's orange `#FF5000` / charcoal `#27272A`.

It now runs on **live data**, not synthetic stubs:

- **Market Insights** — brand performance across the Portal dealer network (share, competitive index,
  category/SKU breakdowns, competitive displacement, proposal funnel), from **Redshift**.
- **Premium Placement** — Spotlight advertising performance (impressions/clicks, per-creative metrics,
  growth-vs-category), from the **AdButler** ad server.
- **Accounts + access control** — a **Postgres** vendor store; server-side signed-token auth with
  per-user brand/category scoping, subscription gating, and self-serve **free accounts**.

> The app still ships a **synthetic** data mode for offline/local work (`DATA_MODE='synthetic'`), but the
> deployed app runs in `'api'` mode against the live backend. Auth uses a single shared demo password for
> the MVP; production swaps the token issuer for Portal SSO (see `../07_Production_Handoff…`).

## Quick start
```bash
npm install
npm start        # http://localhost:4200  (synthetic mode works with no backend)
npm run build    # production build -> dist/portal-vendor-insights/browser/
```
To run against live data locally, set `DATA_MODE='api'` + `API_BASE_URL` in `src/app/core/app-config.ts`
and provide the backend env vars (below). The `/api/*` functions run on Vercel — see `../DEPLOY.md`.

### Demo accounts (password: `demo`)
| Role | Example login | Sees |
|------|---------------|------|
| Portal admin | `lee@portal.io` | Everything; can inspect any brand; vendor management; PP brand mapping |
| Vendor (active) | `natasha@originacoustics.com` (Origin Acoustics) | Own brand's MI + a live PP campaign |
| Vendor (no active ad) | `casey.clemens@sonos.com` (Sonos) | MI works; PP shows the "no active campaign" lock |
| Vendor (expired sub) | a Klipsch contact | MI shows the subscription lock |
| Free account | create one via **Create a free account** on login | Teaser Home; dashboards locked behind a paywall |

The demo accounts are listed (click-to-fill) on the sign-in screen.

## Backend / env vars (live `api` mode)
The `/api/*` serverless functions need these set in the host (Vercel):
- `AUTH_SECRET` — signing key for the session token.
- `POSTGRES_URL` (or `DATABASE_URL`) — the vendor/account store (auto-creates + seeds on first run).
- `REDSHIFT_HOST` / `REDSHIFT_PORT` / `REDSHIFT_DATABASE` / `REDSHIFT_USER` / `REDSHIFT_PASSWORD` + `FACT_TABLE`
  (e.g. `public.portal_mi_data_for_redshift`) — Market Insights data (direct `pg` connection).
- `ADBUTLER_API_KEY` — Premium Placement (AdButler) data; server-side only.

## Architecture
- `src/app/core/brand-performance.source.ts` — the data seam for Market Insights + platform stats.
  Returns the synthetic payload (`'synthetic'`) or GETs it from the API (`'api'`). `app-config.ts` holds
  `DATA_MODE` + `API_BASE_URL`.
- `src/app/core/premium-placement.source.ts` — the Premium Placement (AdButler) client.
- `src/app/core/auth.service.ts` + `auth.guard.ts` — session + route guards; `subStatus()` is the shared
  subscription-status source used by the shell and the dashboards.
- `api/*.js` — Vercel serverless functions (plain CommonJS): `session`, `signup`, `brand-performance`,
  `platform-stats`, `adbutler`, `pp-mapping`, `new-dealers`, `admin-vendors`, `proposal-export`,
  `report-pdf`, `meta`, `health`. Each verifies the signed token and enforces scope from its claims.
- `lib/db.js` — Postgres vendor store (companies, users, logos, logins, brand map); `lib/auth.js` —
  token sign/verify; `lib/seed-data.js` — first-run seed.
- `pages/*` — login, signup, home (hub + free-account teaser), dashboards (hub), dashboard (Market
  Insights), premium-overview (Premium Placement), admin, vendor admin, campaign landing, profile.
  `components/charts.component.ts` — dependency-free SVG/HTML charts.

## Security model (the backbone)
Credentials are validated **server-side** (`/api/session`), which issues a signed token carrying the
user's role, brand, allowed categories/sub-categories/states, permissions, subscription window, and
free-signup flag. Every data endpoint verifies that token and derives scope from its **claims, never
from client input** — so the browser can't widen its own access. Free accounts are rejected from the
Market Insights data endpoint at the server (not just hidden in the UI).

## Production path
See **`../07_Production_Handoff_(Seams_and_Build_Spec).md`** — the durable assets are the contracts,
metric definitions, and UI; the Vercel plumbing is the disposable host. The biggest production items are
real SSO (swap the token issuer) and a pre-aggregated serving layer (`../05_Scaling_to_Production…`).
