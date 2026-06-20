# Deploying the MVP (live demo for the dev team)

The app (`mvp-angular/`) is a **static Angular SPA** — no backend, all synthetic data, state in the browser's localStorage. That means any static host works. Build output is `mvp-angular/dist/portal-vendor-insights/browser/`.

> Note: `mvp-app/` is the superseded early Next.js version — ignore it / it can be deleted. Deploy **`mvp-angular`** only.

---

## Option A — Vercel CLI (fastest live link, no GitHub needed) ✅ recommended

From your machine:

```bash
cd mvp-angular
npm install          # first time only
npx vercel           # log in when prompted; accept defaults
npx vercel --prod    # promotes to a stable shareable URL
```

`vercel.json` is already in `mvp-angular/` (build command, output dir, and SPA fallback are preconfigured), so just accept the detected settings. You'll get a `https://<project>.vercel.app` link to share.

## Option B — Vercel via GitHub (auto-deploys + preview links per change)

1. Push this project to a GitHub repo (see "Git setup" below).
2. In Vercel: **Add New → Project → import the repo**.
3. Set **Root Directory = `mvp-angular`** (important — so it builds the Angular app, not the repo root).
4. Framework auto-detects; `vercel.json` supplies the rest. Deploy.

Every push to `main` redeploys; pull requests get preview URLs.

## Option C — GitHub Pages (free, included workflow)

A workflow is already at `.github/workflows/deploy.yml`. It builds `mvp-angular`, sets the correct base-href from your repo name, adds the SPA 404 fallback, and publishes.

1. Push to GitHub (below).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). Live at `https://<you>.github.io/<repo>/`.

## Option D — drag-and-drop (zero config)

```bash
cd mvp-angular && npm install && npm run build
```

Then drag the `dist/portal-vendor-insights/browser` folder onto **app.netlify.com/drop** (or `vercel deploy` that folder). Quick one-off, but no auto-redeploy.

---

## Git setup (for Options B/C)

```bash
cd "Periscope Migration and Vendor Reporting MVP"
git init && git add . && git commit -m "Portal vendor insights MVP"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

A root `.gitignore` is included (excludes `node_modules/`, `dist/`, `.angular/`).

## Sharing notes for the dev team

- **Demo logins** are on the sign-in screen (password `demo`): an admin (`lee@portal.io`) sees everything; vendor accounts (e.g. `casey.clemens@sonos.com`) see only their brand; `rj.snyder@masimo.com` shows the expired-subscription state.
- Data is **synthetic** and resets per browser (localStorage); anyone can click around without affecting others.
- The **custom dashboard builder** is labeled "Future concept · not in MVP" (admin-only) — see `03_Custom_Dashboard_Builder_(Post-MVP).md`.
