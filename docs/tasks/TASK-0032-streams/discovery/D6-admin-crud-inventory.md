# D6 — Platform Admin CRUD surface and tenant management inventory

Read-only discovery. Worktree: `D:/My Work/hrm-dijipeople/dp-partner-admin`.
Scope: `apps/admin` (platform admin console) and its API backers
(`platform-runtime`, `super-admin`, `tenant-control-plane`, `tenants`).

---

## 1. Routes under `apps/admin/app/(internal)/`

84 `page.tsx` files. All entity screens are runtime-rendered
(`RuntimeModulePage` for lists, `RuntimeRecordRoute`/`RuntimeRecordPage` for
detail); none of the 18 platform-runtime entities has a hand-rolled CRUD page.
Confirmed pattern for `tenants`:
`apps/admin/app/(internal)/tenants/page.tsx:12-13` (`<RuntimeModulePage
moduleKey="tenants" />`) and
`apps/admin/app/(internal)/tenants/[tenantId]/page.tsx:25-32`
(`<RuntimeRecordRoute moduleKey="tenants" recordId={tenantId} />`). The other
17 entity modules follow the identical two-line pattern (verified for
`customers`, `leads`, `partners`, `contracts`, `plans`, `subscriptions`,
`invoices`, `payments`, `commissions`, `support-cases`,
`contract-templates`, `signature-requests`, `onboarding`,
`partner-onboarding`, `partner-inquiries` — all import the same two
components).

Bespoke (non-runtime) `page.tsx` files, all outside the 18-entity registry:

| Path | Purpose |
|---|---|
| `(internal)/page.tsx` | Dashboard (still routed through the registry — `dashboard` is a module key, `apiBase: "/platform-runtime/dashboard"`, `platform-module-registry.ts:1034-1059`) |
| `(internal)/settings/**` (24 pages) | Configuration screens (branding, plans catalog config, legal, monitoring, tenant-provisioning, users, etc.) — not runtime CRUD entities |
| `(internal)/operations/provisioning/page.tsx` | Provisioning queue (bespoke, backs onto `tenant-control-plane`'s `GET /platform/tenants/provisioning-queue`) |
| `(internal)/agent-rollout/page.tsx`, `app-releases/page.tsx` | Desktop-agent channel assignment / release management (bespoke) |
| `(internal)/billing/page.tsx`, `billing/webhooks/page.tsx` | Stripe billing dashboards (bespoke) |
| `(internal)/notifications/page.tsx`, `account-settings/`, `preferences/`, `profile/`, `security/` | Operator's own account, not tenant/platform data |

## 2. The admin runtime — registry, adapter, API side

- **Client module registry**: `apps/admin/lib/runtime/platform-module-registry.ts`
  (4,916 lines). One `definitions: PlatformModuleDefinition[]` array built by
  `define()` (line 4058) wrapping either an inline object (`dashboard`,
  `leads`, `partners`) or the `simple()` helper (line 4371, used by the other
  15 modules) which fills in `entityType`, `routeBase`, `apiBase`, `views`,
  `permissions` and default `actions`.
- **HTTP adapter**: `apps/admin/lib/runtime/http-module-runtime-adapter.ts:16`
  — every module, regardless of its declared `apiBase`, actually calls
  `/api/platform-runtime/${moduleKey}` (list/get/create/update/delete/
  bulk-delete/assign/bulk-assign/change-status/actions/validate/export/
  timeline/related/process — lines 50-149). **The `apiBase` string on each
  module definition (e.g. `tenants: "/super-admin/tenants"`) is descriptive
  metadata only and is not used to build a request URL** — confirmed by
  `grep apiBase apps/admin` (5 hits: the registry/types files and unrelated
  `getApiBaseUrl()` in `server-api.ts`/`env.ts`). Nothing else in `apps/admin`
  references a module's `apiBase`.
- **Next proxy**: `apps/admin/app/api/platform-runtime/[[...path]]/route.ts`
  forwards to the API's `/platform-runtime/*`.
- **API dispatcher**: `services/api/src/modules/platform-runtime/platform-runtime.controller.ts`
  — one generic REST surface: `GET/POST /platform-runtime/:moduleKey`,
  `GET/PATCH/DELETE /platform-runtime/:moduleKey/:id`, plus
  `.../actions/:action`, `.../timeline`, `.../process`, `.../related/:key`,
  `.../export`, `.../validate` (lines 21-137). Guarded only by class-level
  `@UseGuards(JwtAuthGuard)`; there is **no route-level `@Permissions`/
  `@RequirePermission`** — authorization is done inside
  `PlatformRuntimeService` per call (see below), which the class comment at
  `platform-runtime.service.ts` explicitly defends as deliberate (tenant id /
  platform identity / permission decided together).
- **Authorization inside the service**:
  `platform-runtime.service.ts:1259-1278` — `assertModuleWrite()` calls
  `assertPlatform()` then checks `runtimePermission(key, true)` against
  `userHasPlatformPermission`; `assertAdmin()` (line 1268) additionally
  requires `user.platform.role` to be one of `SUPER_ADMIN`, `PLATFORM_OWNER`,
  `PLATFORM_ADMIN` — used for bulk/single delete (`deleteRecords`,
  lines ~578-628: `this.assertModuleWrite(...); this.assertAdmin(...)`).
- **Action declaration**: actions are typed objects
  (`RuntimeActionDefinition`) with `key`, `scope` (`list`|`record`),
  `selection` (`none`|`one`|`any`), `placement` (`primary`|`secondary`|
  `overflow`), optional `states` (which lifecycle values the action is valid
  in — a **usability filter only**, re-checked server-side), optional
  `destructive`/`confirmTitle`/`confirmDescription`, and `disabledReason` for
  a refused-but-explained action (`refusingDeleteActions`,
  `platform-module-registry.ts:445-454`). Each module's declared actions are
  merged over per-capability defaults by `withDefaultActions()`
  (lines 465-498) and given a stable cross-module order via `COMMAND_ORDER`
  (lines 506-519).
- **Show/hide logic**: (a) `MODULE_CAPABILITIES` map (lines 378-400) drives
  whether New/Edit/Delete/Bulk-delete render at all; (b) `DELETE_REFUSALS`
  map (lines 352-376) supplies an operator-facing reason when Delete is
  withheld instead of just hiding the button; (c) each action's `permission`
  is resolved by `actionPermission()` (lines ~4358-4370, keyed off the
  module's `permissions` record) and checked client-side by
  `hasRuntimePermission()` (`lib/runtime/runtime-permissions.ts:32-46`) —
  **explicitly documented as UI-only**: `apps/admin/AGENTS.md` and the file's
  own header comment state the API is the real authority; role gating here
  only prevents "the header offered an Assign the command bar had already
  hidden."
- **Server-side create/update/delete switch** (mirrors, and is asserted to
  stay in sync with, `MODULE_CAPABILITIES` via
  `platform-module-capabilities.spec.ts`):
  `platform-runtime.service.ts` — `create()` (line 420) handles
  `leads|partners|customers|customer-onboarding|contracts|support-cases`,
  else 400 `"Create is not available for this module through the runtime."`;
  `update()` (line 474) additionally handles `tenants` (→
  `superAdmin.updateTenant`, line ~509) and `plans`, else the same 400;
  `deleteRecords()` (private, ~line 578) handles
  `leads|customers|customer-onboarding|partners|partner-inquiries|
  partner-onboarding`, else 400 `"Delete is not available for this module or
  is prevented by retention policy."` (comment explicitly names `tenants` as
  a case that lands here: "an entire customer workspace behind a cascade").

## 3. Per-entity CRUD matrix

Y = supported, N = not supported/refused, (Y*) = supported but the list
endpoint currently paginates/sorts/searches in Node memory rather than in
Postgres (BUG-3175, still open — see §6). All entities share Search/Filter/
Pagination = Y functionally (ProDataTable + `RuntimeQuery`); the (Y*)
qualifier only flags which backing queries are inefficient, not a UI gap.

| Module (routeBase) | List | View | Create | Edit | Delete | Archive/Status | Restore | Export | Update endpoint (permission) | Delete endpoint (permission) |
|---|---|---|---|---|---|---|---|---|---|---|
| `dashboard` (`/`) | Y | — | N | N | N | — | — | N (refresh only) | — | — (`dashboard.read` only) |
| `leads` (`/leads`) | Y | Y | Y | Y | Y | Y (status incl. Qualify/Disqualify/Convert) | via reopen from terminal status | Y | `PATCH platform-runtime/leads/:id` (`leads.update`) | `DELETE .../leads/:id` + bulk (`leads.update`, delete also requires platform-admin role) |
| `partners` (`/partners`) | Y | Y | Y | Y | Y | Y (Approve/Reject/Suspend/Reactivate) | Y (Reactivate) | Y | `PATCH .../partners/:id` (`partners.manage`) | `DELETE` via `PartnerDeletionService` (`partners.manage` + admin role) |
| `partner-inquiries` (`/partner-inquiries`) | Y (Y*) | Y | N | N | Y | — | — | Y | — | `DELETE` (`partners.manage` + admin role) |
| `partner-onboarding` (`/partner-onboarding`) | Y (Y*) | Y | N | N | Y | — | — | Y | — | `DELETE` (`partners.manage` + admin role) |
| `customers` (`/customers`) | Y — real Prisma `where`/`skip`/`take` | Y | Y | Y | Y | status follows onboarding/provisioning | — | Y | `PATCH .../customers/:id` (`customers.update`) | `DELETE` via `bulkDeleteCustomers` (`customers.update` + admin role) |
| `customer-onboarding` (`/onboarding`) | Y (Y*) | Y | Y | Y | Y | Y (stage workflow) | — | Y | `PATCH .../customer-onboarding/:id` (`onboarding.manage`) | `DELETE` (`onboarding.manage` + admin role) |
| `tenants` (`/tenants`) | Y (Y*, BUG-3175) | Y | **N** (`create: false` — provisioned, never created here) | Y (name/displayName/legalName only — most fields read-only) | **N** — refused with explanation, "Use More → Erase tenant" | Y — 8 governed lifecycle actions, see §4 | Y (Reactivate) | Y | `PATCH platform-runtime/tenants/:id` → `superAdmin.updateTenant` (`tenants.update`) | none via generic delete; **Erase Tenant** is the governed equivalent, `POST /platform/tenants/:tenantId/erase` |
| `contracts` (`/contracts`) | Y (Y*) | Y | Y | Y (state-limited) | **N** — "Supersede or terminate instead" | Y (large lifecycle: Draft→…→Archived) | via Supersede | Y | `PATCH .../contracts/:id` (`contracts.manage`) | refused |
| `contract-templates` (`/templates`) | Y (Y*) | Y | **N** | **N** (`update: false`) | **N** — "Deactivate the template instead" | Y (isActive/deactivate) | — | Y | refused (create/update not in switch) | refused |
| `signature-requests` (`/signature-requests`) | Y (Y*) | Y | **N** | **N** | **N** — "Cancel it instead" | Y (Cancel) | — | Y | refused | refused |
| `support-cases` (`/support/cases`) | Y | Y | Y | Y | **N** — "Resolve or close it instead" | Y (queue states) | Y (Reopen) | Y | `PATCH .../support-cases/:id` (`support.manage`) | refused |
| `subscriptions` (`/subscriptions`) | Y (Y*, BUG-3175) | Y | **N** | **N** (`update: false`) | **N** — "Cancel it instead" | Y (Cancel via tenant-control-plane subscription/cancel) | — | Y | refused via generic update; cancellation via `POST /platform/tenants/:id/subscription/cancel` | refused |
| `plans` (`/plans`) | Y (Y*, BUG-3175) | Y | **N** | Y (`update: true`, but `FORM_EXCLUDED_FIELDS.plans` hides legacy price columns, `platform-module-registry.ts:992-999`) | **N** — "Archive the plan instead" | Y (publish/archive tracked as ITEM-0022, not yet a governed action per `RECORD_HEADER_READ_ONLY_REASON.plans`) | — | Y | `PATCH .../plans/:id` → `superAdmin.updatePlan` (`billing.manage`) | refused |
| `invoices` (`/invoices`) | Y (Y*, BUG-3175) | Y | **N** (arrive automatically on billing) | **N** | **N** — "Void or credit instead" | — | — | Y | refused | refused |
| `payments` (`/payments`) | Y (Y*, BUG-3175) | Y | **N** (arrive from Stripe) | **N** | **N** — "Refund it instead" | — | — | Y | refused | refused |
| `commissions` (`/commissions`) | Y (Y*, BUG-3175) | Y | **N** (calculated automatically) | **N** | **N** — "Adjust or reverse instead" | — | — | Y | refused | refused |
| `monitoring-incidents` (`/settings/monitoring/error-logs`) | Y | Y | **N** (recorded automatically) | **N** | **N** — "Resolve them instead" | Y (resolve) | — | Y | refused | refused |

Notes on the matrix:
- "Delete refused" rows still render a disabled Delete/Bulk-delete button
  carrying `disabledReason` from `DELETE_REFUSALS`
  (`platform-module-registry.ts:352-376`) rather than hiding it — a
  deliberate choice documented in the surrounding comment (an invisible
  Delete read as a missing feature and generated support tickets).
- Every `Y` create/update path is a `class-validator` DTO
  (`dto(CreateXDto, values)` / `dto(UpdateXDto, values)`,
  `platform-runtime.service.ts:420-560`), so `whitelist: true,
  forbidNonWhitelisted: true` applies the same as the rest of the API — an
  unknown field 400s the whole save (this is the mechanism BUG-0220,
  referenced in `apps/admin/AGENTS.md`, warns about).

## 4. Tenant management specifics

**Frontend**: `apps/admin/app/(internal)/tenants/page.tsx` (list) and
`.../[tenantId]/page.tsx` (detail) — both pure runtime wrappers, no bespoke
tenant page code remains (the file's own comment records that a second
`?workspace=operations` screen with its own branding/integrations UI existed
and was removed in favour of one runtime record page with tabbed panels).

**Editable tenant fields** (`platform-module-registry.ts:2686-2853`, tabs:
Overview / Configuration / Access & Security / Commercial / Apps & Modules /
Operations / Timeline / System):
- Writable: `name`, `displayName`, `legalName`.
- Read-only-by-design (with an explanatory `description` shown in the UI):
  `tenantCode`, `slug` ("fixed once addressable"), `status` ("changed
  through the Actions menu so every transition carries a reason and is
  audited"), `environmentType` ("relabelling would reclassify live data"),
  `customerAccountId`, `originatingLeadId`/`originatingPartnerId`, `id`,
  `ownerUserId` ("managed from Access & Security"), audit columns
  (`createdAt/By`, `updatedAt/By`), demo-data provenance fields.

**Status transitions / lifecycle actions** — `TENANT_RECORD_ACTIONS`
(`platform-module-registry.ts:571-711`), each carrying `states` as a
UI-only precondition (server re-validates):
`open-tenant` (ACTIVE only) · `validate-tenant` · `suspend-tenant`
(ACTIVE/PENDING_SETUP/INACTIVE → destructive, confirm dialog) ·
`reactivate-tenant` (SUSPENDED/INACTIVE/DECOMMISSIONING) ·
`activate-tenant` (PENDING_SETUP/ONBOARDING) · `decommission-tenant`
(ACTIVE/SUSPENDED/INACTIVE → destructive) · `create-tenant-owner` ·
`create-service-account` · `retry-provisioning`
(PROVISIONING/PROVISIONING_FAILED/ONBOARDING/PENDING_SETUP) ·
`refresh-tenant` · `erase-tenant` (SUSPENDED/INACTIVE/DECOMMISSIONING/
DECOMMISSIONED/ARCHIVED/CHURNED/PROVISIONING_FAILED → destructive, the
governed replacement for Delete). Full status enum:
`TENANT_STATUS_VALUES` (lines 526-538) — 11 states, `ARCHIVED`/`CHURNED`/
`DECOMMISSIONED` marked `terminal: true`.

**API surface**: `services/api/src/modules/tenant-control-plane/
tenant-control-plane.controller.ts` (`@Controller('platform/tenants')`,
class-level `JwtAuthGuard` only — same "authorize inside the service, with
the tenant id" pattern as platform-runtime, stated explicitly in the file's
header comment, lines 38-45). Endpoint groups:
- Domains: `GET/POST :tenantId/domains`, `.../primary`, `.../verify`,
  `.../disable` (`tenant-domains-admin.service.ts`).
- Read surfaces: `overview`, `readiness`, `configuration`, `commercial`,
  `timeline`, `system`.
- Lifecycle: `POST :tenantId/status` (generic status change),
  `POST :tenantId/subscription/cancel`.
- Access & users: `GET/POST :tenantId/access`, `PATCH .../access/:userId`,
  `POST .../password-reset`, `.../resend-invitation`,
  `.../rotate-credential`, `POST .../access/transfer-ownership`,
  `DELETE .../access/:userId` — this is where tenant admin/user management
  (invite, reset, deactivate, transfer ownership) lives, not on the generic
  runtime record.
- Modules/Apps (feature & plan config): `GET/PATCH :tenantId/modules`,
  `GET :tenantId/apps`, `.../installations`, `.../releases`,
  `PATCH :tenantId/apps/:appKey`.
- Operations: `GET :tenantId/operations`,
  `POST .../repair-workspace`, `POST .../retry-provisioning`.
- Erasure (the "delete" tenants doesn't otherwise offer):
  `GET :tenantId/erasure-preflight`, `POST :tenantId/erasure-dry-run`,
  `POST :tenantId/erase`, `GET erasure-receipts` — implemented in
  `tenant-erasure.service.ts` (932 lines: `preflight`, `erase` inside a
  transaction via `eraseWithin`, `diagnose`, `listReceipts`).
- Branding is explicitly **not** here per the detail page's own comment
  (`tenants/[tenantId]/page.tsx:15-19`): it moved to the tenant application
  and its own authorized users.

**Audit**: every tenant-control-plane service file
(`tenant-access`, `tenant-apps`, `tenant-control-plane`,
`tenant-domains-admin`, `tenant-erasure`, `tenant-modules`,
`tenant-operations`) references `AuditService`/`auditService` (confirmed by
`grep -rl AuditService services/api/src/modules/tenant-control-plane` — all
7 non-DTO/spec files hit). `super-admin.service.ts` (tenant create/update via
`updateTenant`) also calls it.

## 5. Frontend error handling

- **`apps/admin/lib/api-error.ts`** — `normalizeApiError()` maps the API's
  standard envelope (`errorCode`/`code`, `traceId`, `message`,
  `description`) into a `StandardApiError`, with a `DEFAULTS` table
  (lines 14-63) covering `SESSION_EXPIRED`/`AUTH_TOKEN_INVALID` (401),
  `ACCESS_DENIED` (403), `DATABASE_RECORD_NOT_FOUND` (404),
  `DATABASE_TIMEOUT`/`INTEGRATION_TIMEOUT` (504),
  `INTEGRATION_FAILED` (502), `INTEGRATION_UNAVAILABLE` (503),
  `SYSTEM_UNEXPECTED_ERROR` (500) — and a fallback `statusToCode()`
  (lines 136-144) for anything else, so **every status gets a specific,
  human-readable message/description**, not a bare "Something went wrong."
  `isSessionExpiredError()` (line 121) is the hook the shell presumably uses
  to force a re-login.
- **`apps/admin/lib/server-api.ts`** — `apiRequest()` attaches the bearer
  token + `X-DijiPeople-App` header and does a single 401 → refresh → retry
  (lines 27-70, refresh cookie flow at 296-316). `apiRequestJson()`
  (line 72) throws a typed `ApiRequestError` (status/code/traceId/
  description) on any non-2xx. Two proxy helpers deliberately distinguish
  failure modes rather than collapsing them: `proxyApiJsonResponse()`
  (line 108) synthesizes a full error envelope when the API answers with **no
  body** (comment at lines 96-107 explains this used to degrade to a bare
  `{message:"Bad Gateway"}`), and `proxyUnreachableResponse()` (line 150) is
  the distinct case where the request **never reached** the API at all
  (network error/DNS/connection refused) — its envelope explicitly says so
  ("The request never reached the API...") rather than reusing the 502
  wording from the previous case.
- Runtime record/list surfaces get their errors through
  `RuntimeApiError` thrown by `http-module-runtime-adapter.ts:27-34`,
  which reads `payload.message`/`payload.traceId`/`payload.errors` off the
  proxy response body — i.e. the two layers above compose: proxy normalizes
  the API's failure into a full envelope, and the adapter unwraps it for the
  runtime components to render (toast/inline — not confirmed which
  component consumes `RuntimeApiError` without reading `runtime-form.tsx`/
  `runtime-module-list.tsx` bodies, which this pass did not open in full;
  flag as a gap if a caller needs that confirmed).
- **No global generic "Something went wrong" fallback text was found** in
  the two error-normalization files themselves — every default in
  `api-error.ts` is specific to its status/code. Whether every UI surface
  actually *displays* `description` rather than a shorter/generic string is
  a separate, per-component question this pass did not verify beyond the
  files above.

## 6. Existing admin tests

- **Jest** (`apps/admin`, pure-logic only — no jsdom, per
  `apps/admin/AGENTS.md`): 47 `*.spec.ts` files under
  `apps/admin/lib/runtime/` and `apps/admin/lib/`, e.g.
  `platform-module-capabilities.spec.ts` (asserts the `MODULE_CAPABILITIES`/
  `DELETE_REFUSALS` maps agree with the API's create/update/remove switch
  statements), `runtime-write-contract.spec.ts`, `destructive-confirm.spec.ts`,
  `tenant-runtime-definition.spec.ts`, `module-routes.invariant.spec.ts`,
  `platform-rbac.spec.ts`.
- **API-side runtime tests**:
  `services/api/src/modules/platform-runtime/generic-delete.spec.ts`
  (the single-vs-bulk-delete parity contract described in the service's own
  comment), `platform-runtime.dto-contract.spec.ts`,
  `platform-runtime.validate-contract.spec.ts`,
  `platform-runtime-relations.service.spec.ts`.
- **Tenant-control-plane specs**: one `*.spec.ts` per service
  (`tenant-access`, `tenant-apps`, `tenant-control-plane`, `tenant-erasure`,
  `tenant-modules`, `provisioning-operations`, `tenant-provisioning-retry`,
  `tenant-subscription-cancel`, `workspace-health`, `workspace-url`,
  `activation-advisories`, `every-method-asserts` — the last name suggests a
  wiring-completeness check that every controller method asserts platform
  identity/permission, consistent with the "authorize inside the service"
  pattern noted above).
- **E2E (Playwright, `e2e/tests/`)**: `flow-g-admin-tenant-list.spec.ts`
  (196 lines) — a regression test for a real incident ("Customers are
  showing on the tenant page!!": a saved column preference silently hid the
  tenant name column after the module definition changed columns; every
  unit/registry test passed because the *definition* was correct — only a
  rendered browser session catches definition + saved-state + render
  together). `flow-h-tenant-sign-in.spec.ts`, `flow-d-provisioning-operations.
  spec.ts`, `flow-j-tenant-settings.spec.ts` also touch tenant/admin flows.
  `e2e/fixtures/admin-session.ts` provides sign-in helpers.

### BUG-3175 / BUG-3220 — still accurate, verified against current code

- **BUG-3175** (`Status: OPEN`, "nine platform-admin runtime modules fetch
  entire tables into Node memory") — **confirmed still true**:
  `services/api/src/modules/tenants/tenants.repository.ts:137` still calls
  `db.tenant.findMany({ orderBy: ..., include: {...} })` with no
  `skip`/`take`, and `services/api/src/modules/super-admin/
  super-admin.service.ts:974` (`listTenants()`) calls
  `tenantsRepository.findAllForSuperAdmin()` with the same shape — pagination
  happens afterward in `paginateRuntimeRecords`
  (`platform-runtime.service.ts`). The nine affected modules named in the
  record (`tenants`, `subscriptions`, `plans`, `invoices`, `payments`,
  `partner-inquiries`, `partner-onboarding`, `commissions`,
  `contract-templates`) match the modules marked `(Y*)` in §3's matrix.
  `customers` remains the one list with real Prisma-level pagination
  (`platform-lifecycle.service.ts:417-511`), as the bug record states.
- **BUG-3220** (`Status: DEFERRED`, "apps/admin has zero loading and error
  boundary files") — **confirmed still true**: `find apps/admin/app -iname
  loading.tsx -o -iname error.tsx` returns zero hits; only
  `apps/admin/app/global-error.tsx` and `apps/admin/app/not-found.tsx` exist
  at the root. No route-group-level `loading.tsx`/`error.tsx` was added
  under `(internal)/` since the record was filed.

---

## Key files for follow-on work

- `apps/admin/lib/runtime/platform-module-registry.ts` — the single source
  of truth for every admin entity's fields, columns, actions, permissions
  and lifecycle.
- `apps/admin/lib/runtime/http-module-runtime-adapter.ts` — the one HTTP
  client every runtime screen uses.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts`
  (1,659 lines) — the generic list/get/create/update/delete/action dispatcher
  and the `assertModuleWrite`/`assertAdmin` authorization gates.
- `services/api/src/modules/tenant-control-plane/tenant-control-plane.controller.ts`
  and its seven backing services — tenant lifecycle, access, modules, apps,
  domains, operations, erasure.
- `apps/admin/lib/api-error.ts`, `apps/admin/lib/server-api.ts` — error
  normalization and the API proxy's two distinct failure envelopes.
- `docs/bugs/BUG-3175-*.md`, `docs/bugs/BUG-3220-*.md` — both re-verified
  accurate as of this pass.
