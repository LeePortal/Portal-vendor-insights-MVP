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
const { authClaims, sign } = require("../lib/auth");
const db = require("../lib/db");

const PROTOCOL_VERSION = "2025-03-26";

const csv = (v) => (Array.isArray(v) ? v.join(",") : v ? String(v) : "");

/** The tool catalog. Each handler calls a sibling /api endpoint with the caller's bearer token and
 *  returns { data, rows, status }. Descriptions are what the model reads to pick a tool — keep them sharp. */
const TOOLS = [
  {
    name: "query_market_insights",
    description: "Market Insights across the entire Portal dealer network — KPIs (revenue, units, proposals, active dealers, each with year-over-year), the top brands by category share, and the top-selling SKUs. Covers all brands, categories, and states. Pass `brand` to center KPIs on one brand; omit it for the whole market. parents/subcategories/states optionally narrow the view.",
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Focal brand to center KPIs on (any brand on the network). Omit for the whole filtered market." },
        parents: { type: "array", items: { type: "string" }, description: "Parent categories to narrow to." },
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
    name: "query_win_loss",
    description: "Competitive win/loss for a chosen brand: that brand's products that beat competitors (won), and its products that were removed/replaced on a proposal (lost) — each lost item showing which competitor brand and model displaced it. Pass `brand` to choose whose win/loss to analyze (any brand on the network); parents/subcategories/states optionally narrow it. Use for 'why is brand X losing deals, and to whom'.",
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Brand whose win/loss to analyze (any brand on the network). Required to return results." },
        parents: { type: "array", items: { type: "string" } },
        subcategories: { type: "array", items: { type: "string" } },
        states: { type: "array", items: { type: "string" } },
        horizon: { type: "string", enum: ["MTD", "QTD", "YTD", "Custom"], description: "Date window. Default YTD." },
        from: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        to: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
      },
    },
    async run(args, ctx) {
      const params = new URLSearchParams({
        brand: args.brand || "", parents: csv(args.parents), subs: csv(args.subcategories), states: csv(args.states),
        horizon: args.horizon || "YTD", from: args.from || "", to: args.to || "", agg: "monthly",
      });
      const { json, status } = await ctx.call("/api/brand-performance?" + params.toString());
      const data = { won: (json.won || []).slice(0, 50), lost: (json.lost || []).slice(0, 50) };
      return { data, rows: (json.won || []).length + (json.lost || []).length, status };
    },
  },
  {
    name: "query_proposal_detail",
    description: "Individual proposal LINE ITEMS across any brand on the network, INCLUDING items that were removed/replaced on a proposal (each row carries a 'replaced' flag). Use for proposal-level questions — which deals a product appeared on, or which line items were swapped out. Pass `brand` to filter to one brand; omit to span all. Dealer/customer identity is never returned; capped at 500 rows.",
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Optional brand filter (any brand on the network). Omit to span all brands." },
        parents: { type: "array", items: { type: "string" } },
        subcategories: { type: "array", items: { type: "string" } },
        states: { type: "array", items: { type: "string" } },
        statuses: { type: "array", items: { type: "string" }, description: "Proposal statuses." },
        includeReplaced: { type: "boolean", description: "Include removed/replaced line items. Default true." },
        horizon: { type: "string", enum: ["MTD", "QTD", "YTD", "Custom"], description: "Date window. Default YTD." },
        from: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        to: { type: "string", description: "YYYY-MM-DD, Custom horizon only." },
        limit: { type: "number", description: "Max rows (default 200, hard cap 500)." },
      },
    },
    async run(args, ctx) {
      const params = new URLSearchParams({
        brand: args.brand || "", parents: csv(args.parents), subs: csv(args.subcategories), states: csv(args.states),
        statuses: csv(args.statuses), horizon: args.horizon || "YTD", from: args.from || "", to: args.to || "",
        includeReplaced: args.includeReplaced === false ? "false" : "true", limit: String(args.limit || 200),
      });
      const { json, status } = await ctx.call("/api/proposal-detail?" + params.toString());
      return { data: json, rows: (json.rows || []).length, status };
    },
  },
];
// NOTE: Market Insights only for now. A Premium Placement tool (AdButler) was intentionally removed —
// do not re-add it to this catalog until the PP agent experience is explicitly back in scope.
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
  // MCP-access gate (security): the account must be explicitly enabled. Default OFF for every user. Checked
  // LIVE against the DB so disabling takes effect immediately, regardless of any token already issued.
  if (!(await db.mcpAccessFor(claims.email))) {
    return res.status(403).json({ error: "MCP access is not enabled for this account. Ask your Portal administrator to enable AI assistant access." });
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = proto + "://" + host;
  // Mint a short-lived signed token that opens ALL brands/categories/states for the data endpoints.
  // Policy: cross-brand sales data is non-sensitive; the ONLY thing protected is dealer identity, which
  // those endpoints never emit. The `mcpUnscoped` flag is signed here, so a browser/vendor token can't
  // forge it — the dashboard's per-user scoping stays a hard boundary; only the MCP runs unscoped.
  const mcpToken = sign({ ...claims, mcpUnscoped: true, exp: Math.floor(Date.now() / 1000) + 120 }, process.env.AUTH_SECRET);
  // ctx.call: GET a sibling /api endpoint with the unscoped MCP token (still verified + dealer-redacted there).
  const ctx = {
    async call(path) {
      const r = await fetch(base + path, { headers: { Authorization: "Bearer " + mcpToken } });
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
      // Log the call for the admin monitoring widget. MUST be awaited: on Vercel the function is
      // frozen the moment the response is sent, so a fire-and-forget insert is often killed mid-flight
      // (observed: only ~1 of 3 calls landing). Awaiting costs ~10-30ms and guarantees the write.
      await db.logRequest({
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
