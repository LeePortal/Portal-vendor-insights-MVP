/**
 * /api/oauth — DEMO-GRADE OAuth 2.1 authorization server for the MCP integration.
 *
 * ⚠️ DEMO-GRADE / NEEDS SECURITY REVIEW BEFORE PRODUCTION. Hand-rolled to get the MCP flow working
 * without an external IdP. The credential check is the shared demo password (via lib/identity). For
 * production, replace this authorization server with a real IdP / Portal SSO — the MCP resource server
 * (/api/mcp) and the access-token format stay the same.
 *
 * Implements: authorization-code + PKCE (S256), dynamic client registration (RFC 7591, minimal),
 * refresh tokens, revocation, and the discovery metadata (RFC 8414 / RFC 9728). One consolidated
 * function; sub-routes via ?action= (the /.well-known/* paths are rewritten to here in vercel.json).
 *
 * Access tokens are the SAME signed-token format the rest of /api verifies (lib/auth), carrying the
 * user's scope claims plus `tid` (the refresh-token id, for per-token monitoring) and `client` (the
 * assistant name). So an OAuth-issued token works on /api/mcp and downstream with zero changes.
 */
const crypto = require("crypto");
const { sign, authClaims } = require("../lib/auth");
const identity = require("../lib/identity");
const db = require("../lib/db");

const ACCESS_TTL = 3600;       // 1h access token
const CODE_TTL_MS = 5 * 60000; // 5min auth code

function baseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return proto + "://" + host;
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = req.body;
  if (raw == null) raw = await new Promise((res, rej) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => res(d)); req.on("error", rej); });
  raw = String(raw || "");
  if (String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) { try { return JSON.parse(raw); } catch { return {}; } }
  const o = {}; new URLSearchParams(raw).forEach((v, k) => (o[k] = v)); return o;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function pkceVerify(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const h = crypto.createHash("sha256").update(String(verifier)).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return h === challenge;
}
function mintAccessToken(claims, tokenId, clientName) {
  return sign({ ...claims, tid: tokenId, client: clientName || "MCP client", exp: Math.floor(Date.now() / 1000) + ACCESS_TTL }, process.env.AUTH_SECRET);
}
const oauthErr = (res, code, status) => res.status(status || 400).json({ error: code });

/** The login + consent screen (server-rendered — this is a browser redirect, not an Angular route). */
function consentPage(req, p, error) {
  const f = (k) => `<input type="hidden" name="${k}" value="${esc(p[k])}" />`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Portal</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#f6f6f7;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#fff;border:1px solid #e5e5e8;border-radius:14px;max-width:380px;width:92%;padding:26px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
h1{font-size:19px;margin:0 0 2px}.sub{color:#666;font-size:13px;margin:0 0 18px}
label{display:block;font-size:12px;color:#666;margin:12px 0 4px}input.t{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d8d8dc;border-radius:8px;font-size:14px}
.btn{width:100%;margin-top:18px;padding:11px;border:none;border-radius:8px;background:#ff5000;color:#fff;font-weight:700;font-size:14px;cursor:pointer}
.scope{background:#fff3ee;border:1px solid #ff5000;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#993c1d;margin-bottom:6px}
.err{color:#b3243a;font-size:12.5px;margin-top:10px}.brand{font-weight:800;font-size:20px;margin-bottom:14px}.brand span{color:#ff5000}</style></head>
<body><form class="card" method="post" action="/api/oauth?action=authorize">
<div class="brand">Portal<span>.</span></div>
<h1>Connect ${esc(p.client_name || "an assistant")}</h1>
<p class="sub">This assistant is requesting access to your Portal Vendor Insights data.</p>
<div class="scope">It will be able to read the same data and reports you can — scoped to your account. It cannot change anything or see other brands.</div>
<label>Work email</label><input class="t" type="email" name="email" value="${esc(p.email)}" autocomplete="username" />
<label>Password</label><input class="t" type="password" name="password" autocomplete="current-password" />
${error ? `<div class="err">${esc(error)}</div>` : ""}
${f("client_id")}${f("redirect_uri")}${f("code_challenge")}${f("code_challenge_method")}${f("state")}${f("scope")}${f("response_type")}${f("client_name")}
<button class="btn" type="submit">Allow access</button>
</form></body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "server_error", error_description: "AUTH_SECRET not set" });

  const action = String((req.query && req.query.action) || "");
  const base = baseUrl(req);

  try {
    // ---- Discovery metadata ----
    if (action === "meta-as") {
      return res.status(200).json({
        issuer: base,
        authorization_endpoint: base + "/api/oauth?action=authorize",
        token_endpoint: base + "/api/oauth?action=token",
        registration_endpoint: base + "/api/oauth?action=register",
        revocation_endpoint: base + "/api/oauth?action=revoke",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["mcp"],
      });
    }
    if (action === "meta-prm") {
      return res.status(200).json({ resource: base + "/api/mcp", authorization_servers: [base] });
    }

    // ---- Self-service connected-assistants (Profile UI) — authed with the user's Portal session token ----
    if (action === "connections") {
      const claims = authClaims(req);
      if (!claims) return res.status(401).json({ error: "Unauthorized" });
      return res.status(200).json({ mcpUrl: base + "/api/mcp", mcpEnabled: await db.mcpAccessFor(claims.email), apps: await db.listConnectedApps(claims.email) });
    }
    if (action === "revoke-app") {
      if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
      const claims = authClaims(req);
      if (!claims) return res.status(401).json({ error: "Unauthorized" });
      const body = await readBody(req);
      await db.revokeTokenForUser(claims.email, body.tokenId || ""); // scoped to owner — can't revoke others'
      return res.status(200).json({ ok: true });
    }

    // ---- Dynamic client registration ----
    if (action === "register") {
      if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
      const body = await readBody(req);
      const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      if (!redirectUris.length) return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris required" });
      const c = await db.registerOauthClient({ name: body.client_name, redirectUris });
      return res.status(201).json({
        client_id: c.clientId, client_name: c.name, redirect_uris: c.redirectUris,
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      });
    }

    // ---- Authorization (browser): GET renders consent, POST validates + redirects with a code ----
    if (action === "authorize") {
      const src = req.method === "POST" ? await readBody(req) : (req.query || {});
      const p = {
        response_type: src.response_type || "code", client_id: src.client_id || "", redirect_uri: src.redirect_uri || "",
        code_challenge: src.code_challenge || "", code_challenge_method: src.code_challenge_method || "S256",
        state: src.state || "", scope: src.scope || "mcp", email: src.email || "", client_name: src.client_name || "",
      };
      const client = p.client_id ? await db.getOauthClient(p.client_id) : null;
      // Validate client + redirect BEFORE trusting/redirecting anywhere.
      if (!client) return res.status(400).send("Unknown client. Please reconnect from your assistant.");
      if (!client.redirectUris.includes(p.redirect_uri)) return res.status(400).send("redirect_uri not registered for this client.");
      if (p.response_type !== "code") return res.status(400).send("Only response_type=code is supported.");
      if (!p.code_challenge || p.code_challenge_method !== "S256") return res.status(400).send("PKCE (S256) is required.");
      if (!p.client_name) p.client_name = client.name;

      if (req.method !== "POST") { // show the consent screen
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(consentPage(req, p));
      }
      // POST = the user submitted the consent form: check credentials.
      const claims = await identity.authenticate(p.email, src.password || "");
      if (!claims) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(200).send(consentPage(req, p, "Invalid email or password.")); }
      // MCP-access gate: even with valid credentials, the account must be enabled for AI assistant access.
      if (!(await db.mcpAccessFor(p.email))) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(consentPage(req, p, "This account isn't enabled for AI assistant access. Contact your Portal administrator."));
      }
      const code = crypto.randomBytes(24).toString("base64url");
      await db.saveAuthCode({ code, clientId: p.client_id, redirectUri: p.redirect_uri, codeChallenge: p.code_challenge, email: p.email, scope: p.scope, exp: Date.now() + CODE_TTL_MS });
      const u = new URL(p.redirect_uri);
      u.searchParams.set("code", code);
      if (p.state) u.searchParams.set("state", p.state);
      res.setHeader("Location", u.toString());
      return res.status(302).end();
    }

    // ---- Token endpoint ----
    if (action === "token") {
      if (req.method !== "POST") return res.status(405).json({ error: "invalid_request" });
      const body = await readBody(req);
      const grant = body.grant_type;

      if (grant === "authorization_code") {
        const rec = await db.takeAuthCode(body.code || "");
        if (!rec) return oauthErr(res, "invalid_grant");
        if (Date.now() > rec.exp) return oauthErr(res, "invalid_grant");
        if (rec.redirectUri !== (body.redirect_uri || "")) return oauthErr(res, "invalid_grant");
        if (body.client_id && rec.clientId !== body.client_id) return oauthErr(res, "invalid_grant");
        if (!pkceVerify(body.code_verifier, rec.codeChallenge)) return oauthErr(res, "invalid_grant");
        const claims = await identity.buildClaims(rec.email);
        if (!claims) return oauthErr(res, "invalid_grant");
        const client = await db.getOauthClient(rec.clientId);
        const clientName = (client && client.name) || "MCP client";
        const { tokenId, refresh } = await db.createRefreshToken({ email: rec.email, clientId: rec.clientId, clientName, scope: rec.scope });
        return res.status(200).json({ access_token: mintAccessToken(claims, tokenId, clientName), token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: rec.scope });
      }

      if (grant === "refresh_token") {
        const rec = await db.findRefreshToken(body.refresh_token || "");
        if (!rec) return oauthErr(res, "invalid_grant");
        const claims = await identity.buildClaims(rec.email);
        if (!claims) return oauthErr(res, "invalid_grant");
        return res.status(200).json({ access_token: mintAccessToken(claims, rec.tokenId, rec.clientName), token_type: "Bearer", expires_in: ACCESS_TTL, scope: rec.scope });
      }

      return oauthErr(res, "unsupported_grant_type");
    }

    // ---- Revocation (RFC 7009) ----
    if (action === "revoke") {
      if (req.method !== "POST") return res.status(405).json({ error: "invalid_request" });
      const body = await readBody(req);
      await db.revokeRefreshToken(body.token || "");
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: "not_found" });
  } catch (e) {
    return res.status(500).json({ error: "server_error", error_description: String((e && e.message) || e) });
  }
};
