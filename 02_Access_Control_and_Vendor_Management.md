# Access Control Integration & Vendor Management — Spec

**Project:** Periscope Migration & Vendor Reporting MVP
**Prepared for:** Lee (Portal.io) · **Date:** June 19, 2026
**Status:** Feature spec — folds into the Product Brief; implemented (in prototype form) in `mvp-angular/`.

---

## 1. Summary

Two related capabilities are defined here:

1. **Access control** — who at Portal is *authorized* to use the Vendor Insights
   reporting admin. This is owned by the existing **admin.portal.io** identity
   system via a new **"Vendor Management" permission**. The reporting app does
   not own identity or permissions; it consumes them.
2. **Vendor Management features** — what authorized staff can *do*: add/remove
   brand users, upload a brand logo, and manage each brand's reporting
   **subscription** (start/end dates, with an expired state that greys out the app).

---

## 2. Access control: integrating with admin.portal.io

### 2.1 Current state

`admin.portal.io` is Portal's existing administration app (ASP.NET MVC + Razor,
jQuery/DataTables, Bootstrap, Material theme). Relevant structure:

- **Customers → Companies** — every company has a **Company Type**: *Dealers*,
  *Manufacturers*, *Suppliers*. **Manufacturers are the "brands"/vendors** this
  reporting product serves.
- **Customers → Users** — the user accounts attached to those companies.
- **Dev Team → Admin Users** — internal Portal staff accounts and their
  capabilities; sections of the admin are already gated by capability.

The reporting admin we are building (Portal View + Vendor Management) is **internal
Portal staff functionality** and must be gated the same way the rest of
admin.portal.io is.

### 2.2 The new permission: "Vendor Management"

Add a **"Vendor Management" permission** to admin.portal.io. A Portal staff account
that holds it may access the Vendor Insights reporting admin and perform vendor
administration (manage brand users, logos, and subscriptions).

### 2.3 Where it should live (recommendation)

| Option | Placement | Why |
|---|---|---|
| **Recommended** | A capability on **Dev Team → Admin Users** (the existing admin-user permission model), labelled **"Vendor Management."** | Mirrors how admin.portal.io already gates sections by admin-user capability; no new access paradigm. Grant/revoke per staff member. |
| Complementary | A new top-level nav entry in admin.portal.io — **"Vendor Reporting"** — that deep-links to the reporting admin, shown only when the permission is present. | Gives staff a discoverable entry point without leaving the existing admin. |
| Brand-level enablement | A flag on **Manufacturer** company records — *"Reporting enabled"* — and the per-user **subscription** (Section 3). | Separates *who can administer* (staff permission) from *which brands/users receive* reporting (entitlement). |

> Net: **one staff permission** ("Vendor Management") controls access to the
> reporting admin; **brand/user entitlement** is handled by subscriptions in the
> reporting app (optionally synced to Company records).

### 2.4 Function / behavior

A staff user **with** the permission can:
- Open the Vendor Insights reporting admin (Portal View + Vendor Management).
- Add/remove brand users, upload brand logos, and set subscription windows.

A staff user **without** it is not shown the entry point and is denied at the route.

### 2.5 How the reporting app consumes it

The reporting app is **not** the source of truth. On authentication (SSO from
Portal), it reads a **`VendorManagement` permission/claim** (or calls a Portal
authorization endpoint) and gates the admin routes on it. Identity, roles, and
this permission are administered only in admin.portal.io.

### 2.6 Mapping in this MVP

- `AuthService.canManageVendors()` stands in for the permission check (returns
  true for Portal admins in the mock; in production it reads the Portal claim).
- The admin routes (`/admin`, `/admin/vendors`) are guarded (`adminGuard`); the
  Vendor Management page notes that access is governed by the admin.portal.io
  permission.

---

## 3. Vendor Management features (new admin panel)

Lives at **Portal Admin → Vendor Mgmt** (`/admin/vendors`) in the reporting app.

### 3.1 Users — add / delete
Authorized staff can add a user to a brand (email + name) and remove a user.
Adding a user creates the user↔brand link and a subscription window in one step.

### 3.2 Brand logo upload
Upload a logo per brand. The logo is **stitched into that brand's dashboards**
(shown in the dashboard header and the app top bar) and into exported reports, so
vendor-facing output looks branded. (MVP stores the image as a data URL; production
stores it in object storage and references a URL.)

### 3.3 Subscriptions — start / end + expiry behavior
Subscriptions live at the **company** level — a start/end window inherited by that company's users:

| Status | Condition | Effect |
|---|---|---|
| **Scheduled** | today < start | Access not yet active. |
| **Active** | start ≤ today ≤ end | Full access. |
| **Expired** | today > end | The user can still sign in and use Home, Profile, and the dashboards **menu**, but **opening a Market Insights dashboard shows a lock** ("A subscription is required") — the check runs *before* any data loads, so no data flashes. Premium Placement gates **separately**, on having a live ad campaign. |

Expiry is automatic (date-driven). Gating applies only to vendor users; Portal staff are never gated.

**Free accounts (added since this spec).** Self-serve signups carry no subscription: they get a teaser
Home, hit the same lock when they open a dashboard, and are blocked from the Market Insights data API
server-side. Admins can convert a free account to a subscriber from the Vendor Management UI.

### 3.4 Data model (prototype)

| Entity | Fields | Notes |
|---|---|---|
| Brand user | `email`, `name`, `brandId` | `brandId` = Manufacturer company in admin.portal.io |
| Subscription | `email`, `brandId`, `start`, `end` | status derived from dates vs. today |
| Brand logo | `brandId` → image | rendered on dashboards/reports |

### 3.5 Relationship to existing Companies / Users / Subscriptions
- `brandId` corresponds to a **Manufacturer** company in admin.portal.io.
- Brand users should ultimately reconcile with **Customers → Users**.
- admin.portal.io already tracks **Stripe plan / subscription status** on companies;
  the reporting **subscription** is an *entitlement layer* for reporting access. In
  production, decide whether to (a) reuse the existing subscription/billing record or
  (b) keep a separate reporting entitlement that can sync from it.

---

## 4. Production notes
- **Source of truth:** admin.portal.io owns identity, the Vendor Management
  permission, companies (brands), and users. The reporting app reads them.
- **Audit:** every vendor-management action (add/remove user, change subscription,
  upload logo) should write to the existing **Audit Trail Logs**.
- **Logos:** store in object storage (e.g., S3/Cloudinary) and reference by URL;
  validate type/size; keep a default fallback.
- **Entitlement vs. billing:** align the reporting subscription window with the
  company's billing where appropriate so access and billing don't drift.
