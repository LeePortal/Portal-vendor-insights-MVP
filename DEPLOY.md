# Deploying the MVP

The app (`mvp-angular/`) is a **full-stack Vercel app**: an Angular SPA **plus `/api/*` serverless
functions** that talk to Redshift (Market Insights), AdButler (Premium Placement), and Postgres (the
account store). It is **not** a static site anymore.

> ⚠️ **A static host (GitHub Pages, Netlify drag-and-drop, plain S3) will NOT work for the live app** —
> it would serve the UI with a dead backend. Use **Vercel** (or an equivalent that runs the `/api`
> functions). Static hosting only works if you build in synthetic mode (`DATA_MODE='synthetic'`), with no
> live data.

Build output (UI): `mvp-angular/dist/portal-vendor-insights/browser/`. Root Directory for the deploy is
**`mvp-angular`**.

---

## Required environment variables (set in the Vercel project)

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | Signing key for the session token (any long random string). Login returns 401/500 without it. |
| `POSTGRES_URL` *(or `DATABASE_URL`)* | The vendor/account store. Tables auto-create + seed on first request. Without it, the admin UI falls back to a browser-only cache and tokens can't carry scope. |
| `REDSHIFT_HOST` / `REDSHIFT_PORT` / `REDSHIFT_DATABASE` / `REDSHIFT_USER` / `REDSHIFT_PASSWORD` | Market Insights data (direct `pg` connection, read-only user). |
| `FACT_TABLE` | The proposal line-item table, e.g. `public.portal_mi_data_for_redshift`. |
| `ADBUTLER_API_KEY` | Premium Placement (AdButler) data. Server-side only; PP shows a "connect AdButler" state if unset. |

A new column the store needs (`free_signup`) is added automatically on first run via `ADD COLUMN IF NOT EXISTS` — no manual migration.

---

## Option A — Vercel CLI (fastest) ✅
```bash
cd mvp-angular
npm install          # first time only
npx vercel           # log in when prompted; accept detected settings
npx vercel --prod    # promotes to a stable shareable URL
```
`vercel.json` (in `mvp-angular/`) preconfigures the build, output dir, SPA fallback, and function settings. Set the env vars above in the project (Settings → Environment Variables) and redeploy.

## Option B — Vercel via GitHub (auto-deploys + preview links)
1. Push the repo to GitHub.
2. Vercel: **Add New → Project → import the repo**. Set **Root Directory = `mvp-angular`**.
3. Add the env vars above. Deploy. Every push to `main` redeploys; PRs get preview URLs.

> Deploys come from the **pushed** commit. If a change isn't showing up, confirm the commit was pushed to the branch Vercel builds.

---

## Git setup
```bash
cd "Periscope Migration and Vendor Reporting MVP"
git init && git add . && git commit -m "Portal vendor insights MVP"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
A root `.gitignore` excludes `node_modules/`, `dist/`, `.angular/`.

## Sharing notes for the dev team
- **Demo logins** are on the sign-in screen (password `demo`): `lee@portal.io` (admin, sees everything),
  `natasha@originacoustics.com` (active vendor — MI + a live ad campaign), `casey.clemens@sonos.com`
  (MI works, Premium Placement locked — no active campaign), and a Klipsch contact (expired subscription).
- **Create a free account** on the login screen to see the self-serve "demo" experience (teaser Home,
  dashboards behind a paywall).
- Data is **live** (Redshift/AdButler) in `api` mode; the account store is shared Postgres, so admin edits persist across users.
