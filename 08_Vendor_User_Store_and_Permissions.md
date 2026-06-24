# Vendor User Store & Permission Enforcement — Setup + Test

**Project:** Periscope Migration & Vendor Reporting MVP
**Status:** Implemented in `mvp-angular/` (server store + token + enforcement + admin UI write-through).

---

## 1. What this adds

Vendor users now live in a **server-side Postgres store** (the MVP's source of truth), not just the
browser. When a vendor logs in, `/api/session` looks them up, computes their **effective** data
restriction, and bakes it into the signed token. The data endpoints enforce that token, so a vendor
can only ever see the categories they're entitled to — and the browser can't widen it.

Effective restriction = **user override** if set, else **company default**, else **all** (empty list).
Restrictions can be set at the company level (defaults inherited by new users) or per user.

Admins are **not** stored here — they come from a hardcoded allowlist in `/api/session`, standing in
for admin.portal.io / SSO until that integration lands. Eventually all users move to admin.portal.io;
this store is the transitional MVP home.

What's enforced today: **brand/tenant isolation**, **parent categories**, **sub-categories**, **states**,
plus per-user **control-visibility permissions**. **Subscription gating** now runs *before* any data
loads (no flash of data before the lock) and is **per-dashboard** (the dashboards menu stays visible);
**free-signup accounts are rejected from `/api/brand-performance` at the server**. Not yet enforced:
buying-groups (no such column in the current Redshift queries).

**Self-serve accounts:** anyone can create a free account (`/api/signup` → `createSignupUser`, sets the
`free_signup` column). These carry no subscription; the app shows them a teaser Home and gates the
dashboards. Admins can convert one to a subscriber from the Vendor Management UI.

---

## 2. One-time setup (required for enforcement to be live)

The store needs a Postgres database. Easiest is **Vercel Postgres** (Neon-backed), which auto-injects
the connection env var into the project.

1. In the Vercel dashboard → the project → **Storage** → **Create Database** → **Postgres** → create.
   - This sets **`POSTGRES_URL`** automatically. (Neon/other: set `DATABASE_URL` instead — both work.)
2. Confirm **`AUTH_SECRET`** is set (already required for login tokens). Any long random string.
3. Redeploy. On the first request the store **auto-creates its tables and seeds** the 10 vendors +
   Legrand from `lib/seed-data.js` (all categories, no restriction).

If `POSTGRES_URL`/`DATABASE_URL` is **not** set: the admin UI falls back to its in-browser cache (so
the app still works), but nothing persists server-side and the token can't carry restrictions — i.e.
the permission test won't be live until the DB is configured.

Env vars summary: `AUTH_SECRET`, `POSTGRES_URL` (or `DATABASE_URL`), plus the existing
`REDSHIFT_HOST/PORT/DATABASE/USER/PASSWORD` and `FACT_TABLE`.

---

## 3. How to test permissions end-to-end

1. Log in as an admin (`lee@portal.io` / `demo`). Go to **Portal Admin → Vendor Mgmt**.
2. Pick a single-brand vendor (e.g. **Sonos**) → its landing page.
3. Either:
   - **User-level:** open a Sonos user, set **Restrict access → Parent categories = Audio**, save; or
   - **Company-level:** **Edit company → Default data access → Parent categories = Audio**, save (new
     users inherit it; existing users with no override inherit it too).
   - Or create a brand-new test user under Sonos (e.g. `test@sonos.com`) with Audio-only.
4. Log out, log in as that vendor (password `demo`). Open Brand Performance Overview.
5. **Expected:** only Audio-category data appears — category breakdowns, competitive set, proposal
   funnel, and the category dropdown are all limited to Audio. There is no selection that widens it,
   because the server floors every query to the token's `allowedParents`.
6. Cross-check isolation: log in as a different vendor (e.g. `rburnish@lutron.com` / `demo`) and
   confirm they see only their own brand.

To prove the boundary is server-side, inspect the `/api/brand-performance` request in dev tools — even
if the browser sends `parents=Networking`, the response stays within the vendor's allowed categories.

---

## 4. Architecture (files)

- `lib/db.js` — Postgres pool, schema bootstrap, first-run seed, `getAll` / `replaceAll` /
  `getUserForLogin`, `effective()` (the user⊕company resolution), plus **`createSignupUser()`**
  (self-serve free accounts; `free_signup` column) and **`getPpBrandMap()`/`setPpBrandMap()`** (the
  Premium Placement advertiser→brand map, `pp_brand_map` table).
- `lib/seed-data.js` — server-side seed (mirrors the front-end demo seed).
- `api/session.js` — admin allowlist; else DB lookup → effective restriction (+ subscription window +
  `freeSignup`) → signed token.
- `api/signup.js` — public self-serve signup → creates a `free_signup=true` account and issues a token.
- `api/admin-vendors.js` — admin-gated `GET` (hydrate) / `PUT` (replace-all) for the admin UI.
- `api/brand-performance.js` — `resolveTenant` + `baseFilter` floor parents **and** subs/states from the
  token; the competitive/proposal "extras" are floored too; **free-signup tokens get a 403**.
- `src/app/core/vendor-admin.service.ts` — in `api` mode, hydrates from the server and writes the
  whole dataset back on every change (admins only); localStorage is a fallback cache.

---

## 5. MVP simplifications (revisit for production)

- **Single shared password** (`demo`) — there is no per-user secret yet. Production replaces
  `/api/session` with real SSO; the verify+enforce shape downstream is unchanged.
- **Company name == Redshift brand** for the 10 seeded vendors (used as the tenant brand). Multi-brand
  companies (e.g. Legrand) need an explicit brand mapping before their data enforcement is meaningful.
- **Whole-dataset PUT, last-write-wins** — fine for a single admin / tens of rows; production moves to
  granular, audited mutations against admin.portal.io.
- **Subscription expiry** gates the data dashboards in the UI **before any fetch** (no data flash) and
  per-dashboard (the dashboards menu stays reachable). Free-signup accounts are blocked at the MI data
  API; expired *subscribers* are still UI-gated only (the MI API doesn't yet check the company window
  server-side) — close that with the production auth work.
- **Buying-group** restriction is stored but not enforced (no such column in the live queries).
