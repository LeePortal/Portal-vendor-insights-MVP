/**
 * Vendor-user store (Postgres / Neon). The MVP's source of truth for vendor companies + users +
 * their permissions. /api/session reads it to mint a token; /api/admin-vendors reads/writes it for
 * the admin UI. Admins are NOT stored here — they come from the external admin allowlist (in
 * /api/session), standing in for admin.portal.io until SSO lands.
 *
 * Connection: set POSTGRES_URL (Vercel Postgres) or DATABASE_URL (Neon) in the project env. If
 * neither is set, callers get a clear "store not configured" error and the app falls back to its
 * in-browser cache.
 *
 * Storage shape mirrors the front-end model (src/app/core/vendor-admin.service.ts): companies hold
 * default brands/perms + default category restrictions + the subscription window; users hold their
 * own brands/perms + (optional) restriction overrides. The token's effective restriction is the
 * user's override if set, else the company default (see effective()).
 */
const { buildSeed } = require("./seed-data");

const RAW_CONN = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
// Supabase ships `sslmode=require`, which makes node-postgres verify the server cert and fail with
// "self-signed certificate in certificate chain". Force `sslmode=no-verify` so the connection still
// uses TLS but skips chain verification (standard + safe for a managed Postgres provider).
function noVerify(s) {
  if (!s) return s;
  return /sslmode=/i.test(s) ? s.replace(/sslmode=[^&\s]*/i, "sslmode=no-verify") : s + (s.includes("?") ? "&" : "?") + "sslmode=no-verify";
}
const CONN = noVerify(RAW_CONN);

let _pool = null;
function pool() {
  if (!CONN) throw new Error("Vendor store is not configured (set POSTGRES_URL or DATABASE_URL).");
  if (_pool) return _pool;
  const { Pool } = require("pg");
  _pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false }, max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000 });
  _pool.on("error", (err) => console.error("vendor-store pool error:", (err && err.message) || err));
  return _pool;
}

const J = (v) => JSON.stringify(v || []);
const A = (v) => (Array.isArray(v) ? v : []);

let _ready = null;
/** Create tables on first use; seed from buildSeed() if the users table is empty. Runs once per cold start. */
function ensureReady() {
  if (_ready) return _ready;
  _ready = (async () => {
    const p = pool();
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_companies (
      name TEXT PRIMARY KEY, brands JSONB NOT NULL DEFAULT '[]', perms JSONB NOT NULL DEFAULT '{}',
      parents JSONB NOT NULL DEFAULT '[]', subs JSONB NOT NULL DEFAULT '[]', states JSONB NOT NULL DEFAULT '[]',
      start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '')`);
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_users (
      email TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, name TEXT, company_name TEXT,
      brands JSONB NOT NULL DEFAULT '[]', perms JSONB NOT NULL DEFAULT '{}', suspended BOOLEAN NOT NULL DEFAULT false,
      parents JSONB NOT NULL DEFAULT '[]', subs JSONB NOT NULL DEFAULT '[]', buying_groups JSONB NOT NULL DEFAULT '[]',
      states JSONB NOT NULL DEFAULT '[]', subscriptions JSONB NOT NULL DEFAULT '[]',
      created_by TEXT, created_at BIGINT)`);
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_logos (logo_key TEXT PRIMARY KEY, data_url TEXT NOT NULL)`);
    const { rows } = await p.query("SELECT COUNT(*)::int AS n FROM vendor_users");
    if (!rows[0].n) await replaceAll(buildSeed());
  })().catch((e) => { _ready = null; throw e; });
  return _ready;
}

function rowToCompany(r) {
  return { name: r.name, brands: A(r.brands), perms: r.perms || {}, parents: A(r.parents), subs: A(r.subs), states: A(r.states), start: r.start_date || "", end: r.end_date || "" };
}
function rowToUser(r) {
  return {
    email: r.email, firstName: r.first_name || "", lastName: r.last_name || "", name: r.name || r.email, companyName: r.company_name || "",
    brands: A(r.brands), perms: r.perms || {}, suspended: !!r.suspended,
    parents: A(r.parents), subs: A(r.subs), buyingGroups: A(r.buying_groups), states: A(r.states),
    subscriptions: A(r.subscriptions), createdBy: r.created_by || "", createdAt: r.created_at ? Number(r.created_at) : undefined,
  };
}

/** Full dataset for the admin UI. */
async function getAll() {
  await ensureReady();
  const p = pool();
  const [c, u, l] = await Promise.all([
    p.query("SELECT * FROM vendor_companies ORDER BY name"),
    p.query("SELECT * FROM vendor_users ORDER BY company_name, name"),
    p.query("SELECT * FROM vendor_logos"),
  ]);
  const logos = {};
  for (const r of l.rows) logos[r.logo_key] = r.data_url;
  return { companies: c.rows.map(rowToCompany), users: u.rows.map(rowToUser), logos };
}

/** Transactional replace-all (the admin UI PUTs the whole dataset). Last write wins. */
async function replaceAll(data) {
  const companies = A(data.companies), users = A(data.users), logos = data.logos || {};
  const p = pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM vendor_companies");
    await client.query("DELETE FROM vendor_users");
    await client.query("DELETE FROM vendor_logos");
    for (const c of companies) {
      await client.query(
        `INSERT INTO vendor_companies (name, brands, perms, parents, subs, states, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [c.name, J(c.brands), JSON.stringify(c.perms || {}), J(c.parents), J(c.subs), J(c.states), c.start || "", c.end || ""]);
    }
    for (const u of users) {
      await client.query(
        `INSERT INTO vendor_users (email, first_name, last_name, name, company_name, brands, perms, suspended,
           parents, subs, buying_groups, states, subscriptions, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [String(u.email || "").toLowerCase(), u.firstName || "", u.lastName || "", u.name || u.email, u.companyName || "",
         J(u.brands), JSON.stringify(u.perms || {}), !!u.suspended, J(u.parents), J(u.subs), J(u.buyingGroups), J(u.states),
         J(u.subscriptions), u.createdBy || "", u.createdAt || null]);
    }
    for (const k of Object.keys(logos)) {
      await client.query("INSERT INTO vendor_logos (logo_key, data_url) VALUES ($1,$2)", [k, logos[k]]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Login lookup: returns the user + its company (or null). Used by /api/session. */
async function getUserForLogin(email) {
  await ensureReady();
  const p = pool();
  const e = String(email || "").toLowerCase();
  const ur = await p.query("SELECT * FROM vendor_users WHERE email = $1", [e]);
  if (!ur.rows.length) return null;
  const user = rowToUser(ur.rows[0]);
  const cr = await p.query("SELECT * FROM vendor_companies WHERE name = $1", [user.companyName]);
  const company = cr.rows.length ? rowToCompany(cr.rows[0]) : null;
  return { user, company };
}

/**
 * Effective token scope. Enforcement reads the USER ACCOUNT ONLY — the company is never referenced
 * here. (Company values are just DEFAULTS that pre-fill a user when they're created in the admin UI;
 * once on the user they're the single source of truth.) Empty list on a dimension = no restriction.
 * `company` is accepted for signature compatibility but intentionally unused.
 */
function effective(user, company) {
  return {
    brand: user.companyName,                       // MVP: company name == Redshift brand for the 10 vendors
    allowedParents: A(user.parents),
    allowedSubs: A(user.subs),
    allowedStates: A(user.states),
    allowedBrands: A(user.brands),                 // visible-brands = focal-brand allow-list (empty = any)
    perms: user.perms || {},                       // control-visibility toggles for the user's dashboard
    suspended: !!user.suspended,
  };
}

module.exports = { pool, ensureReady, getAll, replaceAll, getUserForLogin, effective, isConfigured: () => !!CONN };
