# MCP + OAuth Integration — Developer Reference

How AI assistants (e.g. Claude) query Portal vendor data, and how access is enforced. **Demo-grade — see the Security caveats before production.**

## What it is

An assistant connects to a single MCP endpoint, signs in as a real Portal user, and can then call read-only tools. It sees **exactly** the data that user sees in the dashboard — same brand, category, and state scope — and nothing more, regardless of how it's prompted.

- **Resource server:** `api/mcp.js` — the agent-facing endpoint. JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`). Tools: `query_market_insights`, `platform_stats`, `query_win_loss` (the brand's win/loss displacement, including which competitor brand+model replaced a line item), and `query_proposal_detail` (raw proposal line items including deleted/replaced rows). **Market Insights only** — a Premium Placement tool was intentionally removed and must not be re-added until PP is explicitly back in scope. Proposal-level detail (`api/proposal-detail.js`) is open across all brands on the MCP path; the one protection is an explicit column allow-list that omits dealer/customer identity (no `name`, no `dealerid`), plus a 500-row cap. (A direct, non-MCP call falls back to the caller's own brand + their dashboard walls.)
- **Authorization server:** `api/oauth.js` — self-hosted OAuth 2.1 (one function, sub-routed by `?action=`).
- **Store:** `lib/db.js` — `oauth_clients`, `oauth_codes` (single-use), `oauth_tokens` (refresh tokens, hashed at rest, revocable). Tables auto-create.
- **Identity:** `lib/identity.js` — `buildClaims(email)` builds the user's scope; `authenticate(email,password)` is the credential check (demo password today; swap for Portal SSO).
- **Routing:** `vercel.json` rewrites the `/.well-known/*` discovery paths to `api/oauth` (before the SPA catch-all).

## Access model — what a user can and cannot see

**MCP policy (per the product owner, 2026-06-25):** cross-brand sales data is *not* sensitive — an assistant may read **all brands, categories, and states**. The **only** thing protected on the MCP is dealer/customer identity (`name` and `dealerid` are never selected). Mechanism: the MCP server mints a short-lived **signed** token carrying `mcpUnscoped`, which `brand-performance.resolveTenant` and `proposal-detail` treat like an admin — no row walls. A browser/vendor token can't forge that flag, so this opening applies to the MCP path only.

The per-user data walls described below still govern the **dashboard UI** (and any direct, non-MCP API call). They are **not** applied on the MCP path. The MCP tools forward to the same `/api/brand-performance`, `/api/platform-stats`, and `/api/proposal-detail` endpoints; enforcement (when it applies) lives in `brand-performance.js` (`resolveTenant` + `baseFilter`).

**Who can connect (MCP-access gate).** Connecting an assistant is opt-in per account. A per-user `mcpAccess` flag (plus a per-company default that seeds new users) defaults **OFF for every user and company**. It's enforced **live** — a DB lookup (`db.mcpAccessFor(email)`), not baked into the token, so disabling takes effect immediately — in two places: `/api/mcp` returns `403` for a non-enabled caller, and the OAuth consent screen refuses to issue a code with a clear message. Accounts not in the vendor store (admins, legacy) are OFF by default too. Admins toggle it on the user's admin page (and as a company default); the Profile "AI assistant access" card shows the connect URL only when the account is enabled.

The dashboard has two layers. Only the first is a security boundary.

### Layer 1 — Data scope (row-level security)

Four inclusion lists, set per user in the admin control panel, carried in the signed token. `baseFilter()` intersects any requested filter with the allowed list and emits a hard `col = ANY(...)` clause on every query. Empty list = unrestricted (admins).

| Control-panel dimension | Token claim | Fact column | A wall? |
|---|---|---|---|
| Visible brands | `allowedBrands` | `brand` | Yes — governs the focal brand |
| Parent categories | `allowedParents` | `parentcat` | Yes |
| Subcategories | `allowedSubs` | `subcat` | Yes |
| States | `allowedStates` | `state` | Yes |
| Proposal status | — | `status` | No — open to all by design |
| Supplier / Buying Group | — | *(none)* | No — the fact table has no such column, so these can only ever be slicing controls, never walls |

Plus: free-signup accounts get `403` from `brand-performance` (no MI subscription); competitor **aggregates** are visible within allowed categories (intentional, for benchmarking) but never competitors' line items; dealer/customer identity is never returned to a vendor.

On the **dashboard**, the walls are brand, parent category, subcategory, and state. On the **MCP path these are not applied** — see the policy note above; the MCP sees all brands/categories/states, protecting only dealer identity.

### Layer 2 — Capability perms (`perms{}`)

`Pull reports`, `Export CSV`, `Date Range`, `Proposal Status`, etc. These gate **dashboard UI controls** only. Locking a *filter* perm just prevents narrowing within an already-allowed scope, so it can never leak data. **The MCP does not currently read `perms`.** Decision deferred: whether the MCP should also mirror the capability perms (hide tools for products a user doesn't have, pin a locked date range). Not a data-exposure risk either way; revisit when prioritized.

## Discovery + token flow

1. Agent calls `/api/mcp` without a token → `401` + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.
2. Agent reads protected-resource metadata → authorization-server metadata.
3. Dynamic client registration (`?action=register`) → `client_id`.
4. User is sent to the consent screen (`?action=authorize`), signs in, approves.
5. Auth code → token (`?action=token`, **authorization_code + PKCE S256**) → access token (+ refresh).
6. Access token works on `/api/mcp`. Refresh via `?action=refresh`-style `grant_type=refresh_token`; revoke via `?action=revoke`.

Access tokens are the **same signed format** the rest of `/api` verifies (`lib/auth`), plus `tid` (refresh-token id, for monitoring) and `client` (assistant name).

## Self-service + monitoring

- **Profile → "AI assistant access"** (`profile.component.ts`): shows the connection URL, lists the user's connected assistants, and revokes them. Backed by `oauth.js?action=connections` and `?action=revoke-app` (both authed with the user's session token, scoped to the owner).
- **Admin → "AI assistants" tab** (`admin.component.ts`): KPIs (agent requests, connected assistants, active users, errors), daily volume, top tools, per-user MCP request counts, and connected-assistant detail. Backed by `api/admin-usage.js` (admin-only) reading `request_log`. Every MCP call is logged with `source='agent'` (the insert is **awaited** in `mcp.js` — a fire-and-forget insert gets killed when the serverless function freezes after responding). Dashboard-UI usage is tracked separately (client-side activity service, shown in the Market Insights / Premium Placement tabs), so `request_log` holds agent traffic only for now.

## Environment

No new variables. Uses the existing `AUTH_SECRET` (token signing) and `POSTGRES_URL` (OAuth store + request log). The Redshift vars power the underlying data endpoints.

## Security caveats — before production

- **Replace the authorization server with a real IdP / Portal SSO.** Today the credential check is the shared demo password and admins are a hardcoded allowlist (`lib/identity.js`, duplicated from `api/session.js` — keep in sync until both move behind the IdP). The MCP resource server and token format stay.
- Hand-rolled OAuth — review against the spec / pen-test (PKCE, redirect-URI validation, code single-use, refresh hashing, and revocation are implemented and verified live, but warrant a formal review).
- Consider rate-limiting and per-client scopes if exposed broadly.

## Verification status

Core OAuth flow verified live end-to-end (discovery → register → consent → code+PKCE → token → tool call → refresh → revoke → negative tests). The Profile and admin-monitoring endpoints (`connections`, `revoke-app`, `admin-usage`) ship with this change and should be re-verified after the next deploy.
