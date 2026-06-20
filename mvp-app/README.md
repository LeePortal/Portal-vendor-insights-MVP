# Portal Vendor Insights — MVP

A working prototype of Portal.io's **vendor reporting platform**, built to replace
[Periscope/Sisense](https://dtdocs.sisense.com). It demonstrates the full experience
end-to-end so the dev team can take it to production:

- **Gated, role-based login** (simulated) — vendor users vs. Portal staff.
- **Tenant-scoped vendor dashboards** with Periscope-style filtering (date range, region,
  category, monthly/quarterly aggregation) and CSV / report export.
- **Portal View** — an internal admin dashboard tracking brand/manufacturer activity:
  logins, time on site, dashboards viewed, reports pulled, and data extracted.
- A **swappable data layer**: synthetic data today, Amazon Redshift in production — change
  one file, nothing else.

> ⚠️ This is an MVP for internal review. Data is **synthetic**, auth is a **mock**, and the
> activity store is **in-memory**. See [Production checklist](#production-checklist).

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Build / run production locally:

```bash
npm run build && npm start
```

### Demo accounts (password: `demo`)

| Role | Email | Sees |
|------|-------|------|
| Portal admin | `lee@portal.io` | Everything + **Portal View**; can inspect any brand |
| Portal admin | `admin@portal.io` | Same as above |
| Vendor | `vendor@sonos.com` | Only Sonos data |
| Vendor | `vendor@lutron.com` | Only Lutron data |
| Vendor | `vendor@ubiquiti.com` | Only Ubiquiti data |

(Every brand in `lib/data/seed.ts` has a `vendor@<brand>.com` login.)

---

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → import the repo**. Framework preset = **Next.js** (auto-detected).
3. No environment variables are required for the mock data demo. Deploy.

For a live Redshift deployment, set the env vars in [`.env.example`](./.env.example) in the
Vercel project settings.

---

## Architecture

```
app/
  (app)/                 authenticated shell (sidebar + topbar)
    page.tsx             home / overview
    dashboards/          dashboard list + [id] interactive dashboard
    reports/             export & report catalog
    admin/               "Portal View" — vendor activity tracking (admin-only)
  login/                 gated login screen (custom-branded)
  api/
    auth/login|logout    mock session cookie
    export               CSV / report download (logs an activity event)
components/              Filters (URL-driven), charts (Recharts), UI primitives, nav
lib/
  auth.ts                mock auth + session encode/decode
  data/
    connector.ts         DataConnector interface + factory  ← the seam
    mock-connector.ts    synthetic implementation (default)
    redshift-connector.ts production stub + REFERENCE_SQL
    seed.ts              deterministic synthetic A/V dataset
  analytics/events.ts    first-party activity tracking (powers Portal View)
  dashboards.ts          dashboard catalog (data-driven widgets)
middleware.ts            route gating (redirects unauthenticated users to /login)
```

**Key idea — the data seam.** Every page talks to a `DataConnector`, never to a database
directly. `getConnector()` returns the `MockConnector` by default, or the `RedshiftConnector`
when `DATA_SOURCE=redshift`. The UI is built against the exact shapes the real queries will
return, so swapping data sources changes nothing in the components.

### Connecting Redshift (production path)

This mirrors the migration strategy in `../01_Periscope_API_Research.md`:

1. Pull each Periscope chart's SQL from the Usage Data `charts.sql` column.
2. Parameterize it (tenant / date range / region / category).
3. Implement the methods in `lib/data/redshift-connector.ts` using
   `REFERENCE_SQL` as a starting point (`npm install pg` or use
   `@aws-sdk/client-redshift-data`).
4. Set `DATA_SOURCE=redshift` and the `REDSHIFT_*` vars.

**Every query must be scoped by `vendor_id` derived from the authenticated session —
never from a value supplied by the client.** That is the tenant-isolation guarantee
(Periscope's "Spaces" equivalent).

### Activity tracking

`lib/analytics/events.ts` records logins, dashboard views (with duration), report pulls, and
CSV exports — intentionally modeled on Periscope's **Usage Data** (`query_logs`,
`time_on_site_logs`, `last_login_at`). The Portal View reads from it. In production, write
these events to a durable table and query that instead; the function signatures are the contract.

---

## How this maps to Periscope

| Periscope capability | Where it lives here |
|---|---|
| URL/embed filters (date range, custom, parent/child, aggregation) | `components/Filters.tsx` → URL params → connector |
| Data-level permissions ("Spaces") | session-derived `vendorId` scoping in every connector call |
| Groups / roles | `role` in the session (`vendor` vs `admin`) |
| Public CSV URL | `/api/export?...&format=csv` |
| Usage Data (logins, time on site, queries) | `lib/analytics/events.ts` + `/admin` |
| Chart SQL | `lib/data/redshift-connector.ts` → `REFERENCE_SQL` |

---

## Production checklist

The following are intentionally simplified for the MVP and must be replaced before launch:

- **Auth** — replace the base64-cookie mock with real auth (SSO/SCIM per the research doc) and
  a signed/encrypted session.
- **Activity store** — move from in-memory to a durable table (it resets on server restart and
  is per-instance on serverless).
- **Data** — implement `RedshiftConnector`; remove `MockConnector` from production builds.
- **Branding** — confirm exact colors/type/logo against Portal's design spec (set `--accent`
  and tokens in `app/globals.css`).
- **Rate limiting / query caching** on the warehouse, and audit logging on exports.
