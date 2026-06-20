# Portal Vendor Insights — MVP (Angular)

A working prototype of Portal.io's **vendor reporting platform** to replace
Periscope/Sisense, built on Portal's real stack: **Angular 18 (standalone) +
Angular Material + Bootstrap 5 + Open Sans**, themed with Portal's orange
`#FF5000` / charcoal `#27272A`.

> MVP for internal review: data is **synthetic**, auth is a **mock**, and the
> activity store is **in-memory**. See the production checklist below.

## Quick start
```bash
npm install
npm start        # http://localhost:4200
npm run build    # production build -> dist/
```

### Demo accounts (password: `demo`)
| Role | Email | Sees |
|------|-------|------|
| Portal admin | `lee@portal.io` | Everything + Portal View; can inspect any brand |
| Vendor | `vendor@sonos.com` | Only Sonos data |
| Vendor | `vendor@lutron.com` | Only Lutron data |

Every brand in `src/app/core/data.service.ts` has a `vendor@<brand>.com` login.

## Architecture
- `core/data.service.ts` — the data seam. Returns the synthetic dataset today;
  swap the method bodies for `HttpClient` calls to a backend running the
  equivalent SQL against **Redshift**. Return shapes are unchanged, so the UI
  doesn't move. **Every query is scoped by the session's `vendorId` (tenant).**
- `core/auth.service.ts` + `core/auth.guard.ts` — mock session (sessionStorage)
  and route guards (`authGuard`, admin-only `adminGuard`).
- `core/activity.service.ts` — first-party usage tracking (logins, views,
  time-on-site, report pulls, CSV exports), modeled on Periscope's Usage Data.
  Powers the **Portal View** admin page.
- `pages/*` — login, home, dashboards, dashboard (filters + widgets), reports,
  admin. `components/charts.component.ts` — dependency-free SVG/HTML charts.

## Connecting Redshift (production path)
1. Stand up a backend endpoint per query (or a generic query API).
2. Pull each Periscope chart's SQL from Usage Data `charts.sql`, parameterize it
   (tenant / date range / region / category).
3. Replace the `DataService` method bodies with `HttpClient` calls. Never trust a
   `vendorId` from the client — derive it from the authenticated session server-side.

## Production checklist
- Real auth (SSO/SCIM) + signed/opaque session instead of the mock cookie.
- Durable activity store (table) instead of in-memory.
- Backend API in front of Redshift; query caching + rate limiting.
- Confirm exact branding against Portal's design spec (`src/styles.scss` tokens).
