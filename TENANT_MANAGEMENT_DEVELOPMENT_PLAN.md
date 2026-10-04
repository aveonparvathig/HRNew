# Tenant Management (Platform Owner Console) — Development Plan

**Goal:** give the product owner a console *above* all organizations to run the
SaaS: list every tenant, create tenants, suspend/reactivate them, set plans &
limits, see usage, and safely "log in as" a tenant for support — while public
self-service signup keeps working.

Decisions already made (2026-10-04):
- **Scope:** platform owner, across all organizations (a true landlord console).
- **Signup:** *both* — public `/register` stays on **and** the owner can create tenants.
- **Phase-1 wishlist:** list + create + suspend, plans & limits, support "log in as", usage dashboard. (Grouped into phases below so each is shippable; the console foundation must land first.)

---

## 1. How tenancy works today (verified)

- One `Organization` = one tenant. Dev DB has 2 (Aveon Infotech, Ranjith); production has the real org.
- Isolation: every table has `organizationId` with `onDelete: Cascade`; the JWT carries the org id; every query filters by it. Deleting an org cascades all its data away.
- Roles are **per tenant**: `SUPER_ADMIN · HR · PAYROLL_VIEWER · EMPLOYEE · MARKETING`. `SUPER_ADMIN` is the admin *of one org*, not a platform owner.
- Tenants are created only by public signup (`authController.register` → org + first SUPER_ADMIN).
- There is **no cross-tenant identity, no org status/suspension, no plans/limits, no usage view, no impersonation.** Those are what this plan adds.

---

## 2. Architecture

**Platform identity is separate from tenant users.** Platform owners sit outside
every org, so they get their own table and their own auth — this keeps org-scoped
queries and the per-org role checks completely untouched.

- New model **`PlatformAdmin`** (`id, email unique, password, name, isActive, lastLoginAt, createdAt`). Not tied to any `organizationId`.
- New login at `POST /platform/auth/login` issuing a JWT with a `scope: "PLATFORM"` claim (tenant tokens are implicitly `scope: "TENANT"`). A `requirePlatform` middleware rejects any token without the platform scope; the existing tenant middleware rejects platform tokens.
- The **first** platform owner is seeded from env (`PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_PASSWORD`) on boot if no `PlatformAdmin` exists — never via a public route. Further owners are added from inside the console.
- New **`PlatformAuditLog`** (`actorEmail, action, organizationId?, detail, createdAt`) — every platform action (create/suspend/plan change/impersonate) is logged. No tenant data values are stored, only what changed.

**Tenant lifecycle** on `Organization`:
- `status` — `ACTIVE | SUSPENDED` (default ACTIVE). Enforced in tenant `login` and in `loadActor`, so a suspended tenant's logins fail immediately with a clear message, existing sessions included.
- `suspendedAt`, `suspendedReason`, `createdVia` (`SIGNUP | OWNER`).

**Plans & limits** (Phase 3):
- New model **`Plan`** (`code, name, maxEmployees, maxUsers, enabledModules String[], trialDays, price, isActive`) seeded with a few tiers (e.g. Trial, Starter, Growth). `Organization.planId` + per-tenant overrides `maxEmployeesOverride`, `maxUsersOverride`, `trialEndsOn`.
- Enforcement helpers (pure, tested): block creating a `Person`/employee past `maxEmployees`, a `User` past `maxUsers`; module gating reads `enabledModules` (nav + route guards). Trial expiry → auto-suspend (checked in the same middleware that already runs per request; no scheduler).

**Support impersonation** (Phase 4):
- `POST /platform/tenants/:orgId/impersonate` issues a *normal tenant* access token for that org's SUPER_ADMIN, carrying an `impersonatedBy` claim and a short TTL. Audited. The tenant UI shows a persistent "Support session — viewing <Org> — Exit" banner; Exit drops the token and returns to the console. Reads allowed; writes allowed but flagged in the audit log (owner decision later if we want read-only support).

**Frontend:** a separate `/platform/*` area with its own minimal shell (not the tenant sidebar), guarded by the platform token: `/platform/login`, `/platform` (tenant list + usage), `/platform/tenants/:id` (detail, plan, suspend, impersonate), `/platform/owners`, `/platform/audit`.

---

## 3. Phases

### Phase 1 — Platform foundation + tenant list & suspend  *(prerequisite)*
- `PlatformAdmin`, `PlatformAuditLog` models; `Organization.status/suspendedAt/suspendedReason/createdVia`; migration.
- Env-seeded first owner; `POST /platform/auth/login`; `requirePlatform` middleware + `scope` claim on both token kinds; suspend-check wired into tenant `login` + `loadActor`.
- `GET /platform/tenants` (list with usage aggregates: users, employees, last login, created, status) + `GET /platform/tenants/:id`.
- `POST /platform/tenants/:id/suspend` + `/reactivate` (audited).
- Frontend: `/platform/login`, platform shell, tenant list, tenant detail with Suspend/Reactivate.

### Phase 2 — Create tenants + owners + audit view
- `POST /platform/tenants` — create org + first SUPER_ADMIN with a temp password (must-change), `createdVia = OWNER`; optional welcome mail (reuses the mailer). Public signup stays on, tagged `createdVia = SIGNUP`.
- Archive/delete a tenant (cascade already exists) behind a typed-name confirm; audited.
- `GET/POST /platform/owners` (add/disable platform owners), `GET /platform/audit`.

### Phase 3 — Plans & limits
- `Plan` table + seed tiers; `Organization.planId` + overrides + `trialEndsOn`.
- Pure limit helpers + enforcement on person/user creation and module gating; trial-expiry auto-suspend.
- Frontend: plan picker on tenant detail, limits display, "modules enabled" toggles.

### Phase 4 — Support "log in as"
- Impersonation endpoint + scoped token + banner/exit + full audit trail.

### Phase 5 — Usage dashboard
- Per-tenant metrics over time: headcount, payroll runs, storage (document bytes), last activity; platform totals; CSV export.

---

## 4. Open decisions
- **Impersonation writes:** allow support to change tenant data, or read-only? (Default proposed: allowed but audited.)
- **Plan tiers & limits:** exact tier names, employee/user caps, which modules each tier unlocks, trial length, prices.
- **Suspended-tenant data:** block logins only (data retained) vs. also hide from search — proposed: retain + block logins; delete is a separate explicit action.
- **Owner recovery:** if the only platform owner is locked out, recovery is via the env seed on next boot — acceptable?

---

*Each phase is built on its own branch off `main`, verified on dev, committed and
pushed; `main` is never pushed without asking (it deploys production via
Vercel/Railway and runs the migration there).*
