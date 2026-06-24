/**
 * /api/mcp — Model Context Protocol server (stateless streamable-HTTP).
 *
 * The AGENT-FACING front door to Portal's data. An authorized AI assistant connects here and calls
 * tools (structured queries) instead of scraping the dashboards. It's a thin RESOURCE SERVER:
 *   1. verify the bearer access token (same signed-token model as the rest of /api),
 *   2. run the tool, which calls the EXISTING /api endpoints with the caller's token — so every
 *      tenant/brand/category scope rule is reused, not re-implemented, and an agent can never widen
 *      its own scope no matter what it's prompted to do,
 *   3. log the call to request_log as source='agent' for the admin monitoring widget.
 *
 * AUTH NOTE: today it accepts the signed token issued by /api/session (or the OAuth token endpoint,
 * which issues the same format). When OAuth lands, the only change here is that 401s point clients at
 * the authorization-server metadata for discovery — the verify+enforce path is unchanged.
 *
 * Protocol: implements the JSON-RPC methods a stateless tool client needs — initialize, tools/list,
 * tools/call, ping. No SSE/server-initiated messages (stateless). Production may swap this hand-rolled
 * handler for the official @modelcontextprotocol/sdk; the tool definitions carry over.
 */
const { authClaims, bearer } = require("../lib/auth");
const db = require("../lib/db");

const PROTOCOL_VERSION = "2025-03-26";
const ymd = (d) => d.toISOString().slice(0, 10);

/** Resolve a {from,to} window (YYYY-MM-DD) from a horizon preset, for endpoints that need explicit dates. */
function range(horizon, from, to) {
  const DRE = /^\d{4}-\d{2}-\d{2}$/;
  if (horizon === "Custom" && DRE.test(from || "") && DRE.test(to || "")) return { from, to };
  const now = new Date();
  const end = ymd(now);
  if (horizon === "MTD") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (horizon === "QTD") { const q = Math.floor(now.getMonth() / 3) * 3; return { from: ymd(new Date(now.getFullYear(), q, 1)), to: end }; }
  return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: end }; // YTD default
}

const csv = (v) => (Array.isArray(v) ? v.join(",") : v ? String(v) : "");

/** The tool catalog. Each handler calls a sibling /api endpoint with the caller's bearer token and
 *  returns { data, rows, status }. Descriptions are what the model reads to pick a tool — keep them sharp. */
const TOOLS = [
  {
    name: "query_market_insights",
    description: "Market Insights for the caller's brand across the Portal dealer network — KPIs (revenue, units, proposals, active dealers, each with year-over-year), the top brands by category share, and the top-selling SKUs. Results are scoped on the server to exactly what the caller is allowed to see; a brand argument is honored only for admins.",
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Focal brand. Admins only — for vendors this is ignored and locked to their own brand." },
        parents: { type: "array", items: { type: "string" }, description: "Parent categories to filter to (within the caller's allowed set)." },
        subcategories: { type: "array", items: { type: "string" } },
        states: { type: "array", items: { type: "string" } },
        statuses: { type: "array", items: { type: "string" }, description: "Proposal statuses: Submitted, Accepted, Completed." },
        horizon: { type: "string", enum: ["MTD", "QTD", "YTD", "Custom"], description: "Date window. Default YTD." },
        from: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        to: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        normalize: { type: "boolean", description: "Only dealers active in both this window and the same window a year earlier (true YoY)." },
      },
    },
    async run(args, ctx) {
      const params = new URLSearchParams({
        brand: args.brand || "", parents: csv(args.parents), subs: csv(args.subcategories), states: csv(args.states),
        statuses: csv(args.statuses), horizon: args.horizon || "YTD", from: args.from || "", to: args.to || "",
        normalize: String(!!args.normalize), agg: "monthly",
      });
      const { json, status } = await ctx.call("/api/brand-performance?" + params.toString());
      const data = {
        kpis: json.kpis || null,
        topBrands: (json.brandRows || []).slice(0, 10),
        topItems: (json.itemRows || []).slice(0, 10),
        revenueByPeriod: json.revByPeriod || null,
      };
      return { data, rows: (json.brandRows || []).length, status };
    },
  },
  {
    name: "platform_stats",
    description: "Network-wide platform activity (NOT brand-specific): total proposal count, revenue, and number of brands tracked — each with year-over-year — plus monthly revenue for this year vs last. Safe general context any signed-in user can see.",
    inputSchema: { type: "object", properties: {} },
    async run(_args, ctx) {
      const { json, status } = await ctx.call("/api/platform-stats");
      return { data: json, rows: null, status };
    },
  },
  {
    name: "get_premium_placement",
    description: "The caller's Premium Placement (Spotlight advertising) performance: impressions, clicks, and per-ad-item creative metrics for the period. Scoped to the caller's own advertiser.",
    inputSchema: {
      type: "object",
      properties: {
        horizon: { type: "string", enum: ["MTD", "QTD", "YTD", "Custom"], description: "Date window. Default YTD." },
        from: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        to: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
      },
    },
    async run(args, ctx) {
      const { from, to } = range(args.horizon || "YTD", args.from, args.to);
      const { json, status } = await ctx.call("/api/adbutler?action=overview&from=" + from + "&to=" + to);
      const data = {
        advertiserName: json.advertiserName || "", impressions: json.impressions || 0, clicks: json.clicks || 0,
        adItems: (json.adItems || []).map((c) => ({ name: c.name, impressions: c.impressions, clicks: c.clicks, active: c.active })),
      };
      return { data, rows: (json.adItems || []).length, status };
    },
  },
];
const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  // Stateless: no server-initiated SSE stream, so a GET (stream open) has nothing to return.
  if (req.method === "GET") return res.status(405).json({ error: "Use POST for JSON-RPC; this server is stateless." });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Auth — verify the bearer access token. On failure, point OAuth clients at the resource metadata
  // for auth-server discovery (added with the OAuth endpoints), per the MCP auth spec.
  const claims = authClaims(req);
  if (!claims) {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="https://${host}/.well-known/oauth-protected-resource"`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = proto + "://" + host;
  const token = bearer(req);
  // ctx.call: GET a sibling /api endpoint forwarding the caller's token (reuses all scope enforcement).
  const ctx = {
    async call(path) {
      const r = await fetch(base + path, { headers: { Authorization: "Bearer " + token } });
      let json = {};
      try { json = await r.json(); } catch { json = {}; }
      return { json, status: r.status };
    },
  };

  let body = req.body;
  if (body === undefined || body === null || typeof body === "string") {
    try { body = JSON.parse(await new Promise((resolve, reject) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d || "{}")); req.on("error", reject); })); }
    catch { return res.status(400).json(rpcError(null, -32700, "Parse error")); }
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const msg of messages) {
    const id = msg && msg.id;
    const method = msg && msg.method;
    // Notifications (no id) get no response.
    if (id === undefined || id === null) continue;

    if (method === "initialize") {
      responses.push(rpcResult(id, {
        protocolVersion: (msg.params && msg.params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "portal-vendor-insights", version: "0.1.0" },
      }));
    } else if (method === "ping") {
      responses.push(rpcResult(id, {}));
    } else if (method === "tools/list") {
      responses.push(rpcResult(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }));
    } else if (method === "tools/call") {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const tool = TOOL_BY_NAME[name];
      if (!tool) { responses.push(rpcError(id, -32602, "Unknown tool: " + name)); continue; }
      const started = Date.now();
      let out, isError = false, httpStatus = 200, rows = null;
      try {
        const r = await tool.run(args, ctx);
        httpStatus = r.status; rows = r.rows;
        if (r.status >= 400) { isError = true; out = { error: "Request failed (" + r.status + ")", detail: r.data }; }
        else out = r.data;
      } catch (e) { isError = true; httpStatus = 500; out = { error: String((e && e.message) || e) }; }
      // Log the call (fire-and-forget) for the admin monitoring widget.
      db.logRequest({
        ts: started, email: claims.email, brand: claims.brand, source: "agent",
        assistant: claims.client || null, tokenId: claims.tid || null,
        tool: name, params: args, rows, latencyMs: Date.now() - started, status: httpStatus,
      });
      responses.push(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out) }], isError }));
    } else {
      responses.push(rpcError(id, -32601, "Method not found: " + method));
    }
  }

  if (!responses.length) return res.status(202).end(); // all notifications
  return res.status(200).json(Array.isArray(body) ? responses : responses[0]);
};
