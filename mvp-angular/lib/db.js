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
const crypto = require("crypto");

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
const rid = (n = 24) => crypto.randomBytes(n).toString("base64url");          // random id / secret
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("base64url"); // hash secrets at rest

let _ready = null;
/** Create tables on first use; seed from buildSeed() if the users table is empty. Runs once per cold start. */
function ensureReady() {
  if (_ready) return _ready;
  _ready = (async () => {
    const p = pool();
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_companies (
      name TEXT PRIMARY KEY, brands JSONB NOT NULL DEFAULT '[]', perms JSONB NOT NULL DEFAULT '{}',
      parents JSONB NOT NULL DEFAULT '[]', subs JSONB NOT NULL DEFAULT '[]', states JSONB NOT NULL DEFAULT '[]',
      start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '',
      mcp_access BOOLEAN NOT NULL DEFAULT false)`);
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_users (
      email TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, name TEXT, company_name TEXT,
      brands JSONB NOT NULL DEFAULT '[]', perms JSONB NOT NULL DEFAULT '{}', suspended BOOLEAN NOT NULL DEFAULT false,
      parents JSONB NOT NULL DEFAULT '[]', subs JSONB NOT NULL DEFAULT '[]', buying_groups JSONB NOT NULL DEFAULT '[]',
      states JSONB NOT NULL DEFAULT '[]', subscriptions JSONB NOT NULL DEFAULT '[]',
      created_by TEXT, created_at BIGINT, free_signup BOOLEAN NOT NULL DEFAULT false,
      mcp_access BOOLEAN NOT NULL DEFAULT false)`);
    // Existing DBs: add later flags if the table predates them (no-op once present).
    await p.query(`ALTER TABLE vendor_users ADD COLUMN IF NOT EXISTS free_signup BOOLEAN NOT NULL DEFAULT false`);
    // MCP access — default OFF for every existing user and company (security: opt-in only).
    await p.query(`ALTER TABLE vendor_users ADD COLUMN IF NOT EXISTS mcp_access BOOLEAN NOT NULL DEFAULT false`);
    await p.query(`ALTER TABLE vendor_companies ADD COLUMN IF NOT EXISTS mcp_access BOOLEAN NOT NULL DEFAULT false`);
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_logos (logo_key TEXT PRIMARY KEY, data_url TEXT NOT NULL)`);
    await p.query(`CREATE TABLE IF NOT EXISTS vendor_logins (email TEXT PRIMARY KEY, last_at BIGINT, count INTEGER NOT NULL DEFAULT 0)`);
    await p.query(`CREATE TABLE IF NOT EXISTS pp_brand_map (advertiser_id TEXT PRIMARY KEY, brands JSONB NOT NULL DEFAULT '[]')`);
    // Server-side request log — the source of truth for the admin usage/MCP monitoring widgets. Written by
    // the API/MCP layer (a human dashboard load is source='ui'; an agent tool call is source='agent').
    await p.query(`CREATE TABLE IF NOT EXISTS request_log (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ts BIGINT NOT NULL, email TEXT, brand TEXT,
      source TEXT NOT NULL DEFAULT 'ui', assistant TEXT, token_id TEXT,
      tool TEXT, params JSONB, rows INTEGER, latency_ms INTEGER, status INTEGER)`);
    await p.query(`CREATE INDEX IF NOT EXISTS request_log_ts_idx ON request_log (ts)`);
    await p.query(`CREATE INDEX IF NOT EXISTS request_log_email_idx ON request_log (email)`);
    // OAuth (demo-grade) — clients (dynamic registration), single-use auth codes, and refresh tokens.
    // Access tokens are stateless signed JWTs (lib/auth); only refresh tokens are stored (hashed) so they're revocable.
    await p.query(`CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY, name TEXT, redirect_uris JSONB NOT NULL DEFAULT '[]', created_at BIGINT)`);
    await p.query(`CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY, client_id TEXT, redirect_uri TEXT, code_challenge TEXT, email TEXT, scope TEXT, exp BIGINT)`);
    await p.query(`CREATE TABLE IF NOT EXISTS oauth_tokens (
      token_id TEXT PRIMARY KEY, refresh_hash TEXT, email TEXT, client_id TEXT, client_name TEXT, scope TEXT,
      created_at BIGINT, last_at BIGINT, revoked BOOLEAN NOT NULL DEFAULT false)`);
    const { rows } = await p.query("SELECT COUNT(*)::int AS n FROM vendor_users");
    if (!rows[0].n) await replaceAll(buildSeed());
    await ensureDemo(p).catch((e) => console.error("ensureDemo:", (e && e.message) || e)); // idempotent demo-account top-up
  })().catch((e) => { _ready = null; throw e; });
  return _ready;
}

function rowToCompany(r) {
  return { name: r.name, brands: A(r.brands), perms: r.perms || {}, parents: A(r.parents), subs: A(r.subs), states: A(r.states), start: r.start_date || "", end: r.end_date || "", mcpAccess: !!r.mcp_access };
}
function rowToUser(r) {
  return {
    email: r.email, firstName: r.first_name || "", lastName: r.last_name || "", name: r.name || r.email, companyName: r.company_name || "",
    brands: A(r.brands), perms: r.perms || {}, suspended: !!r.suspended,
    parents: A(r.parents), subs: A(r.subs), buyingGroups: A(r.buying_groups), states: A(r.states),
    subscriptions: A(r.subscriptions), createdBy: r.created_by || "", createdAt: r.created_at ? Number(r.created_at) : undefined,
    freeSignup: !!r.free_signup,
    mcpAccess: !!r.mcp_access,
  };
}

/** Full dataset for the admin UI. */
async function getAll() {
  await ensureReady();
  const p = pool();
  const [c, u, l, lg] = await Promise.all([
    p.query("SELECT * FROM vendor_companies ORDER BY name"),
    p.query("SELECT * FROM vendor_users ORDER BY company_name, name"),
    p.query("SELECT * FROM vendor_logos"),
    p.query("SELECT email, last_at, count FROM vendor_logins"),
  ]);
  const logos = {};
  for (const r of l.rows) logos[r.logo_key] = r.data_url;
  const logins = {};
  for (const r of lg.rows) logins[r.email] = { count: Number(r.count) || 0, last: Number(r.last_at) || 0 };
  return { companies: c.rows.map(rowToCompany), users: u.rows.map(rowToUser), logos, logins };
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
        `INSERT INTO vendor_companies (name, brands, perms, parents, subs, states, start_date, end_date, mcp_access)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [c.name, J(c.brands), JSON.stringify(c.perms || {}), J(c.parents), J(c.subs), J(c.states), c.start || "", c.end || "", !!c.mcpAccess]);
    }
    for (const u of users) {
      await client.query(
        `INSERT INTO vendor_users (email, first_name, last_name, name, company_name, brands, perms, suspended,
           parents, subs, buying_groups, states, subscriptions, created_by, created_at, free_signup, mcp_access)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [String(u.email || "").toLowerCase(), u.firstName || "", u.lastName || "", u.name || u.email, u.companyName || "",
         J(u.brands), JSON.stringify(u.perms || {}), !!u.suspended, J(u.parents), J(u.subs), J(u.buyingGroups), J(u.states),
         J(u.subscriptions), u.createdBy || "", u.createdAt || null, !!u.freeSignup, !!u.mcpAccess]);
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

/** Idempotently ensure the Origin Acoustics demo account (company + Natasha) exists, even on an already-seeded
 *  DB. ON CONFLICT DO NOTHING so it never clobbers later admin edits. Runs every cold start; cheap. */
async function ensureDemo(p) {
  const seed = buildSeed();
  for (const c of seed.companies.filter((x) => x.name === "Origin Acoustics")) {
    await p.query(
      `INSERT INTO vendor_companies (name, brands, perms, parents, subs, states, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (name) DO NOTHING`,
      [c.name, J(c.brands), JSON.stringify(c.perms || {}), J(c.parents), J(c.subs), J(c.states), c.start || "", c.end || ""]);
  }
  for (const u of seed.users.filter((x) => x.companyName === "Origin Acoustics")) {
    await p.query(
      `INSERT INTO vendor_users (email, first_name, last_name, name, company_name, brands, perms, suspended,
         parents, subs, buying_groups, states, subscriptions, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (email) DO NOTHING`,
      [String(u.email || "").toLowerCase(), u.firstName || "", u.lastName || "", u.name || u.email, u.companyName || "",
       J(u.brands), JSON.stringify(u.perms || {}), !!u.suspended, J(u.parents), J(u.subs), J(u.buyingGroups), J(u.states),
       J(u.subscriptions), u.createdBy || "", u.createdAt || null]);
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
 * Self-serve signup: create a free-signup account (free_signup=true, no subscription/brands). Returns
 * { created:false } without touching anything if the email already exists, so a real subscriber's
 * account can never be downgraded by someone signing up with their address.
 */
async function createSignupUser({ email, firstName, lastName, company }) {
  await ensureReady();
  const e = String(email || "").trim().toLowerCase();
  if (!e) throw new Error("email required");
  const p = pool();
  const existing = await p.query("SELECT 1 FROM vendor_users WHERE email = $1", [e]);
  if (existing.rows.length) return { created: false, email: e };
  const name = ((firstName || "") + " " + (lastName || "")).trim() || e;
  await p.query(
    `INSERT INTO vendor_users (email, first_name, last_name, name, company_name, brands, perms, suspended,
       parents, subs, buying_groups, states, subscriptions, created_by, created_at, free_signup)
     VALUES ($1,$2,$3,$4,$5,'[]'::jsonb,'{}'::jsonb,false,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,$6,$7,true)`,
    [e, firstName || "", lastName || "", name, company || "", "self-signup", Date.now()]);
  return { created: true, email: e, name, company: company || "" };
}

/** Record a successful login — REAL usage data. Kept in its own table so the admin UI's whole-dataset
 *  PUT (replaceAll) never wipes it. The synthetic ActivityService in the client is only a fallback. */
async function recordLogin(email) {
  if (!CONN) return;
  await ensureReady();
  const e = String(email || "").toLowerCase();
  if (!e) return;
  await pool().query(
    `INSERT INTO vendor_logins (email, last_at, count) VALUES ($1, $2, 1)
     ON CONFLICT (email) DO UPDATE SET last_at = EXCLUDED.last_at, count = vendor_logins.count + 1`,
    [e, Date.now()]);
}

/** Fetch a single logo data-URL by key (brand id or company name); "" if none. Vendor-accessible read. */
async function getLogo(key) {
  if (!CONN) return "";
  await ensureReady();
  const r = await pool().query("SELECT data_url FROM vendor_logos WHERE logo_key = $1", [String(key || "")]);
  return r.rows.length ? (r.rows[0].data_url || "") : "";
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
    mcpAccess: !!user.mcpAccess,                    // may this user connect an AI assistant via MCP? default OFF
  };
}

/** Live MCP-access check for the gate. Default OFF: store unconfigured, user not found (admins/legacy),
 *  or flag false all return false. Authoritative + immediate (revoking takes effect at once). */
async function mcpAccessFor(email) {
  if (!CONN) return false;
  try {
    const found = await getUserForLogin(email);
    if (!found) return false;
    return effective(found.user, found.company).mcpAccess === true;
  } catch (e) { console.error("mcpAccessFor:", (e && e.message) || e); return false; }
}

/**
 * Premium Placement advertiser→Portal-brand(s) map: { [advertiserId]: brandName[] }. Kept in its own table
 * so the admin UI's whole-dataset PUT (replaceAll) never wipes it. Resilient: returns {} when unconfigured.
 * Replaces the brittle AdButler-name↔Redshift-brand guessing — admins set this explicitly.
 */
async function getPpBrandMap() {
  if (!CONN) return {};
  await ensureReady();
  const r = await pool().query("SELECT advertiser_id, brands FROM pp_brand_map");
  const map = {};
  for (const row of r.rows) map[String(row.advertiser_id)] = A(row.brands);
  return map;
}
/** Upsert one advertiser's Portal-brand list; an empty list removes the row. */
async function setPpBrandMap(advertiserId, brands) {
  if (!CONN) throw new Error("Vendor store is not configured.");
  await ensureReady();
  const id = String(advertiserId || "");
  if (!id) throw new Error("advertiserId required");
  const list = A(brands).map((b) => String(b)).filter(Boolean);
  if (!list.length) { await pool().query("DELETE FROM pp_brand_map WHERE advertiser_id = $1", [id]); return; }
  await pool().query(
    `INSERT INTO pp_brand_map (advertiser_id, brands) VALUES ($1, $2)
     ON CONFLICT (advertiser_id) DO UPDATE SET brands = EXCLUDED.brands`,
    [id, J(list)]);
}

/** Append one request to the log. Fire-and-forget; never throws into the request path. */
async function logRequest(e) {
  if (!CONN) return;
  try {
    await ensureReady();
    await pool().query(
      `INSERT INTO request_log (ts, email, brand, source, assistant, token_id, tool, params, rows, latency_ms, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [Number(e.ts) || Date.now(), e.email || null, e.brand || null, e.source || "ui", e.assistant || null, e.tokenId || null,
       e.tool || null, e.params != null ? JSON.stringify(e.params) : null,
       e.rows == null ? null : Number(e.rows), e.latencyMs == null ? null : Number(e.latencyMs), e.status == null ? null : Number(e.status)]);
  } catch (err) { console.error("logRequest:", (err && err.message) || err); }
}

/** Per-user pull counts over [from,to], split by source (ui vs agent). For the admin usage widget. */
async function usageByUser(fromTs, toTs) {
  await ensureReady();
  const r = await pool().query(
    `SELECT email, MAX(brand) AS brand,
            COUNT(*) FILTER (WHERE source='ui')    AS ui,
            COUNT(*) FILTER (WHERE source='agent') AS agent,
            COUNT(*) AS total, MAX(ts) AS last_ts
     FROM request_log WHERE ts >= $1 AND ts < $2 AND email IS NOT NULL
     GROUP BY email ORDER BY total DESC`, [Number(fromTs) || 0, Number(toTs) || Date.now()]);
  return r.rows.map((x) => ({ email: x.email, brand: x.brand || "", ui: Number(x.ui), agent: Number(x.agent), total: Number(x.total), lastTs: Number(x.last_ts) || 0 }));
}

/** Agent/MCP monitoring aggregates over [from,to]: KPIs, daily counts, top tokens, top tools. */
async function mcpStats(fromTs, toTs) {
  await ensureReady();
  const p = pool();
  const a = [Number(fromTs) || 0, Number(toTs) || Date.now()];
  const [kpi, daily, tokens, tools] = await Promise.all([
    p.query(`SELECT COUNT(*) AS requests, COUNT(DISTINCT token_id) AS tokens, COUNT(DISTINCT email) AS users,
                    COUNT(*) FILTER (WHERE status >= 400) AS errors
             FROM request_log WHERE source='agent' AND ts >= $1 AND ts < $2`, a),
    p.query(`SELECT (ts/86400000) AS day, COUNT(*) AS n FROM request_log
             WHERE source='agent' AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY 1`, a),
    p.query(`SELECT token_id, MAX(email) AS email, MAX(brand) AS brand, MAX(assistant) AS assistant,
                    COUNT(*) AS requests, MAX(ts) AS last_ts
             FROM request_log WHERE source='agent' AND ts >= $1 AND ts < $2 AND token_id IS NOT NULL
             GROUP BY token_id ORDER BY requests DESC LIMIT 20`, a),
    p.query(`SELECT tool, COUNT(*) AS n FROM request_log
             WHERE source='agent' AND ts >= $1 AND ts < $2 AND tool IS NOT NULL
             GROUP BY tool ORDER BY n DESC LIMIT 12`, a),
  ]);
  const k = kpi.rows[0] || {};
  return {
    requests: Number(k.requests) || 0, tokens: Number(k.tokens) || 0, users: Number(k.users) || 0, errors: Number(k.errors) || 0,
    daily: daily.rows.map((d) => ({ day: Number(d.day), n: Number(d.n) })),
    topTokens: tokens.rows.map((t) => ({ tokenId: t.token_id, email: t.email || "", brand: t.brand || "", assistant: t.assistant || "", requests: Number(t.requests), lastTs: Number(t.last_ts) || 0 })),
    topTools: tools.rows.map((t) => ({ tool: t.tool, n: Number(t.n) })),
  };
}

/** Recent individual requests (for the drill-down that shows the tool-call text). */
async function recentRequests({ source, tokenId, email, limit } = {}) {
  await ensureReady();
  const where = ["1=1"]; const vals = [];
  if (source) { vals.push(source); where.push(`source = $${vals.length}`); }
  if (tokenId) { vals.push(tokenId); where.push(`token_id = $${vals.length}`); }
  if (email) { vals.push(String(email).toLowerCase()); where.push(`email = $${vals.length}`); }
  vals.push(Math.min(Number(limit) || 50, 200));
  const r = await pool().query(
    `SELECT ts, email, brand, source, assistant, token_id, tool, params, rows, latency_ms, status
     FROM request_log WHERE ${where.join(" AND ")} ORDER BY ts DESC LIMIT $${vals.length}`, vals);
  return r.rows.map((x) => ({ ts: Number(x.ts), email: x.email || "", brand: x.brand || "", source: x.source, assistant: x.assistant || "", tokenId: x.token_id || "", tool: x.tool || "", params: x.params || null, rows: x.rows == null ? null : Number(x.rows), latencyMs: x.latency_ms == null ? null : Number(x.latency_ms), status: x.status == null ? null : Number(x.status) }));
}

/* ---------- OAuth (demo-grade) store ---------- */

/** Dynamic client registration (RFC 7591, minimal): store redirect URIs, return a generated client_id. */
async function registerOauthClient({ name, redirectUris }) {
  await ensureReady();
  const clientId = "mcp_" + rid(12);
  await pool().query(`INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES ($1,$2,$3,$4)`,
    [clientId, name || "MCP client", J(A(redirectUris).map(String)), Date.now()]);
  return { clientId, name: name || "MCP client", redirectUris: A(redirectUris) };
}
async function getOauthClient(clientId) {
  await ensureReady();
  const r = await pool().query(`SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id=$1`, [String(clientId || "")]);
  return r.rows.length ? { clientId: r.rows[0].client_id, name: r.rows[0].name || "", redirectUris: A(r.rows[0].redirect_uris) } : null;
}
async function saveAuthCode(c) {
  await ensureReady();
  await pool().query(`INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, email, scope, exp) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [c.code, c.clientId, c.redirectUri, c.codeChallenge, String(c.email).toLowerCase(), c.scope || "", Number(c.exp)]);
}
/** Single-use: returns the code's record and deletes it atomically. */
async function takeAuthCode(code) {
  await ensureReady();
  const r = await pool().query(
    `DELETE FROM oauth_codes WHERE code=$1 RETURNING client_id, redirect_uri, code_challenge, email, scope, exp`, [String(code || "")]);
  if (!r.rows.length) return null;
  const x = r.rows[0];
  return { clientId: x.client_id, redirectUri: x.redirect_uri, codeChallenge: x.code_challenge, email: x.email, scope: x.scope || "", exp: Number(x.exp) };
}
/** Issue a refresh token. Returns { tokenId, refresh } — refresh = "<tokenId>.<secret>"; only the hash is stored. */
async function createRefreshToken({ email, clientId, clientName, scope }) {
  await ensureReady();
  const tokenId = "tok_" + rid(9);
  const secret = rid(32);
  await pool().query(
    `INSERT INTO oauth_tokens (token_id, refresh_hash, email, client_id, client_name, scope, created_at, last_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
    [tokenId, sha(secret), String(email).toLowerCase(), clientId || "", clientName || "MCP client", scope || "", Date.now()]);
  return { tokenId, refresh: tokenId + "." + secret };
}
/** Validate a refresh token string; returns its record (and bumps last_at) or null if unknown/revoked/bad. */
async function findRefreshToken(refreshToken) {
  await ensureReady();
  const [tokenId, secret] = String(refreshToken || "").split(".");
  if (!tokenId || !secret) return null;
  const r = await pool().query(`SELECT token_id, refresh_hash, email, client_id, client_name, scope, revoked FROM oauth_tokens WHERE token_id=$1`, [tokenId]);
  if (!r.rows.length || r.rows[0].revoked || sha(secret) !== r.rows[0].refresh_hash) return null;
  await pool().query(`UPDATE oauth_tokens SET last_at=$2 WHERE token_id=$1`, [tokenId, Date.now()]);
  const x = r.rows[0];
  return { tokenId: x.token_id, email: x.email, clientId: x.client_id, clientName: x.client_name || "", scope: x.scope || "" };
}
async function revokeRefreshToken(refreshOrTokenId) {
  await ensureReady();
  const tokenId = String(refreshOrTokenId || "").split(".")[0];
  if (!tokenId) return;
  await pool().query(`UPDATE oauth_tokens SET revoked=true WHERE token_id=$1`, [tokenId]);
}
/** A user's connected assistants (active refresh tokens) — for the Profile "AI assistant access" list. */
async function listConnectedApps(email) {
  await ensureReady();
  const r = await pool().query(
    `SELECT token_id, client_name, created_at, last_at FROM oauth_tokens WHERE email=$1 AND revoked=false ORDER BY last_at DESC`,
    [String(email || "").toLowerCase()]);
  return r.rows.map((x) => ({ tokenId: x.token_id, name: x.client_name || "MCP client", createdAt: Number(x.created_at) || 0, lastAt: Number(x.last_at) || 0 }));
}
/** Revoke one of a user's tokens by id (Profile revoke); scoped to the owner so users can't revoke others'. */
async function revokeTokenForUser(email, tokenId) {
  await ensureReady();
  await pool().query(`UPDATE oauth_tokens SET revoked=true WHERE token_id=$1 AND email=$2`, [String(tokenId || ""), String(email || "").toLowerCase()]);
}

module.exports = { pool, ensureReady, getAll, replaceAll, getUserForLogin, createSignupUser, recordLogin, getLogo, effective, getPpBrandMap, setPpBrandMap, logRequest, usageByUser, mcpStats, recentRequests, registerOauthClient, getOauthClient, saveAuthCode, takeAuthCode, createRefreshToken, findRefreshToken, revokeRefreshToken, listConnectedApps, revokeTokenForUser, mcpAccessFor, isConfigured: () => !!CONN };
