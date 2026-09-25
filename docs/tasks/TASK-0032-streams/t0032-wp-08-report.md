# WP-08 — Admin CRUD and tenant management sweep

Session interrupted three times mid-task; work preserved as checkpoint
commits `9baf16e1`, `0ec7fd3a`, `91c5e11f` plus normal commits in between
(`1fbcfd97`, `d6746868`, `86be0253`) on `agent/pah-wp08-admin-crud`.

## FINDINGS (Task A — for the Architect to route; not fixed here)

1. **[HIGH] `PlatformAuditLog` is write-only — no endpoint anywhere in
   `services/api` reads it back.** `grep -rn platformAuditLog services/api/src
   --include=*.ts` finds only `.create()` call sites
   (`audit.repository.ts`, `demo-data/demo-data.operations.ts`,
   `platform-users/platform-users.service.ts` x5,
   `app-releases/release-publisher.service.ts`) — zero
   `.findMany`/`.findFirst`/`.findUnique`/`.count`. Every platform-runtime
   mutation (leads/partners/customers/customer-onboarding/contracts/
   support-cases/tenants/plans) that calls `AuditService.log()` with
   `tenantId: 'platform'` writes here. The one exposed read route,
   `GET /audit-logs` (`AuditController` → `AuditService.listByTenant(user.tenantId,
   ...)`), queries the *different* `AuditLog` table by `tenantId` — and a
   platform user's `tenantId` is the literal string `'platform'`
   (`auth-access.service.ts` `loadPlatformAccessContext`), so even an
   authorized SUPER_ADMIN calling it gets a 200 with an empty page, not the
   platform trail. Net effect: none of this WP's "Audit" matrix cells can be
   positively verified through any API. Live evidence for
   leads/partners/customers/customer-onboarding/contracts/support-cases: each
   shows `UNVERIFIABLE` in the matrix below. Owned by `platform-runtime` /
   `audit` / `super-admin` — outside `apps/admin`.

2. **[HIGH] `contract-templates` and `signature-requests`: `view` 404s for a
   real id taken from the module's own list.** Confirmed by reading
   `platform-runtime.service.ts`: `get()`'s switch has no case for either
   module, so both fall to the private `findGeneric(key, id)`, whose fallback
   only recognises `key === 'plans' | 'subscriptions'` plus a literal
   `key === 'payments' ? 'payment' : null` mapping, and throws
   `NotFoundException('Record is not available.')` for every other key. List
   works (each has its own `paginateRuntimeRecords` call site); opening a
   record from that list cannot. Live: 9 contract-templates and 3
   signature-requests listed, `GET :id` on a real id from each → 404. Owned by
   `platform-runtime` — outside `apps/admin`.

3. **[MEDIUM] `partners`: a true partial edit (only the changed field) is
   rejected.** `UpdatePartnerDto extends CreatePartnerDto {}`
   (`partner.dto.ts`) instead of redeclaring every field `@IsOptional()` the
   way `UpdateAdminLeadDto`/`UpdateCustomerDto`/`UpdateContractDto`/
   `UpdateSupportCaseDto` all do — partners is the one create-capable module
   whose PATCH is not actually partial. `PATCH {defaultCommissionRate: 15}` on
   a real partner → 400, naming `type`/`displayName`/etc. as missing. **Not
   exercised by the real admin UI** — `buildWritePayload` always resends every
   editable field's current value on save, never a bare diff — but a true
   partial PATCH, which the HTTP verb implies, 400s today. Owned by
   `partners` — outside `apps/admin`.

4. **[INFO, positive] `customer-onboarding`'s duplicate-create guard already
   returns a clear domain message, not the generic one `BUG-2463` (DEFERRED)
   describes for this same endpoint.** Live: creating a second onboarding
   record for a customer that already has an active one → `409 "Customer
   already has an active onboarding record."` (`ConflictException` in
   `assertOnboardingCreatable`). `BUG-2463`'s evidence for this endpoint was
   from 2026-08-30 at commit `39d8ddc4`; this is current behaviour at
   `10d5d148`. Worth the Architect re-checking `BUG-2463`'s premise for this
   one endpoint specifically — its other three endpoints
   (`leads/actions/bulk-delete`, `tenants/{id}/access-users/{id}/reset-activation`,
   `auth/refresh`) were not exercised by this harness and may still be
   accurate.

5. **[INFO] No optimistic concurrency is enforced on any platform-runtime
   `PATCH`, despite the adapter always sending `version`.** `update()`'s body
   type in `platform-runtime.service.ts` declares `version?: number`, but no
   call site inside `update()` ever reads `body.version` back out — a stale
   edit with `version: 999999` still succeeds (200) wherever the underlying
   DTO validation itself doesn't separately reject the payload. Confirmed live
   for leads/customers/customer-onboarding/contracts/support-cases (all
   `NOT_ENFORCED`); `partners`/`customer-onboarding`'s own edit-validation
   quirks happened to mask it there. Not a regression of anything — it appears
   to never have been implemented — but worth a product decision on whether
   the runtime's declared `version` field is meant to do anything.

6. **Minor discovery-doc correction (not a defect):** `dashboard` is not a
   platform-runtime CRUD module despite `platform-module-registry.ts`
   declaring `apiBase: "/platform-runtime/dashboard"` for it (as
   `D6-admin-crud-inventory.md` notes). `'dashboard'` appears nowhere in
   `platform-runtime.service.ts`/`platform-runtime.types.ts`; the real
   dashboard data comes from its own
   `services/api/src/modules/dashboard/dashboard.controller.ts`
   (`GET /dashboard/summary`, `GET /dashboard/views/:viewKey}`). Excluded from
   the CRUD matrix below for this reason.

## CRUD matrix (live run against the throwaway stack)

Harness: `e2e/tools/admin-crud-matrix.mjs`. Run at
`2026-09-25T05:47:39.947Z` against `http://localhost:4100/api` (commit
`10d5d148`, i.e. before the parallel RBAC fixes).

| Module | List | View | Create | Edit | Delete | Search | Filter(malformed/missing id) | Pagination | Validation(create/edit) | Audit |
|---|---|---|---|---|---|---|---|---|---|---|
| leads | PASS | PASS | PASS | PASS | PASS(deferred to cleanup) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| partners | PASS | PASS | PASS | **FAIL** | PASS(deferred to cleanup) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| partner-inquiries | PASS | PASS | PASS(refused) | PASS(refused) | - | PASS | PASS/PASS | PASS | -/- | - |
| partner-onboarding | PASS | PASS | PASS(refused) | PASS(refused) | - | PASS | PASS/PASS | PASS | -/- | - |
| customers | PASS | PASS | PASS | PASS | PASS(deferred to cleanup) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| customer-onboarding | PASS | PASS | PASS | PASS | PASS(deferred to cleanup) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| tenants | PASS | PASS | PASS(refused) | - | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |
| subscriptions | PASS | N/A(no rows) | PASS(refused) | N/A | N/A | PASS | PASS/PASS | PASS | -/- | - |
| plans | PASS | PASS | PASS(refused) | - | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |
| invoices | PASS | N/A(no rows) | PASS(refused) | N/A | N/A | PASS | PASS/PASS | PASS | -/- | - |
| payments | PASS | N/A(no rows) | PASS(refused) | N/A | N/A | PASS | PASS/PASS | PASS | -/- | - |
| commissions | PASS | PASS | PASS(refused) | PASS(refused) | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |
| contracts | PASS | PASS | PASS | PASS | PASS(refused) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| contract-templates | PASS | **FAIL(404)** | PASS(refused) | PASS(refused) | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |
| signature-requests | PASS | **FAIL(404)** | PASS(refused) | PASS(refused) | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |
| support-cases | PASS | PASS | PASS | PASS | PASS(refused) | PASS | PASS/PASS | PASS | PASS/PASS | UNVERIFIABLE |
| monitoring-incidents | PASS | PASS | PASS(refused) | PASS(refused) | PASS(refused) | PASS | PASS/PASS | PASS | -/- | - |

`Delete` = "PASS(refused)" means the module's `deleteRecords()` switch
refused the call with a 400 domain message (never 500) — confirmed safe to
call against real, non-demo records because the refusal happens before any
Prisma delete. `Delete` = "PASS(deferred to cleanup)" means the module
genuinely deletes, and the harness's own cleanup pass removed the record it
created (see Cleanup below). `duplicateCreate` for customer-onboarding: PASS
(409 with a domain message — see Finding 4).

### Authorization sweep (list / edit), per module, live

Format: `ROLE(list)=status, ROLE(edit)=status`. Full detail in the harness's
own stdout (not reproduced per-module here to keep this report readable);
the two invariants the harness checks unconditionally passed for every one
of the 17 modules: **an anonymous caller always got 401**, and **the tenant
admin (`system-admin@dijipeople.local`) never reached a platform-runtime
route** (always 403). Role-specific differences observed (all consistent
with `ROLE_PERMISSIONS` in `platform-permissions.ts`, not bugs):
`PLATFORM_OPERATIONS` lacks `partners.update`/`contracts.manage`/
`monitoring.*`-write and gets 403 on those edits while `PLATFORM_ADMIN`
passes them (then hits the same DTO-shape 400s as SUPER_ADMIN where
applicable); `leads` interestingly refused `PLATFORM_OPERATIONS` at the
**list** stage too (403) — `PLATFORM_OPERATIONS`'s `ROLE_PERMISSIONS` entry
has no `leads.*`/`leads.read`, matching D1's role table.

### Tenant control plane

Per this WP's instructions, tenant creation is not possible through the
runtime (`create: false`), so only **read-only** checks were performed
against the real seeded demo tenant — no suspend/reactivate/erase, no field
edit. `GET /platform-runtime/tenants` (list, 1 tenant), `GET
/platform/tenants/{id}/overview` (200) both pass. The seeded demo tenant was
never mutated.

## Cleanup

The harness creates real records for the 6 create-capable modules
(leads/partners/customers/customer-onboarding/contracts/support-cases),
exercises them, and deletes what it can. Per
`.agent/context/test-resource-policy.md`, cleanup failures are reported, not
swallowed:

- leads, partners, customers, customer-onboarding: deleted successfully
  every run (customer-onboarding also cascades away if its parent customer
  is deleted first, via `onDelete: Cascade` on `CustomerOnboarding.customer`
  — not relied on; the harness deletes it directly).
- **contracts and support-cases cannot be deleted through the API at all,
  by product design** (`deleteRecords()` refuses both — "Supersede or
  terminate instead" / "Resolve or close it instead"). Every harness run
  therefore leaves exactly one contract and one support-case behind in
  `dijipeople_pah_test` (the throwaway database named in this WP's brief).
  This task iterated the harness live several times while fixing fixture
  bugs (see `git log` on `e2e/tools/admin-crud-matrix.mjs`); each run's
  leftover ids are named in that run's own console output. Total
  accumulated across the whole debugging session: **5 contracts + 6
  support-cases**, all tagged `zzzharnessXXXXXXXX` in their
  title/companyName/displayName fields for easy identification, all in the
  throwaway database, none reachable through any delete endpoint. Nothing
  else was left over.

## TASK B — fixes owned by `apps/admin`

### 1. BUG-3546 — Edit lands the operator on a tab with nothing editable

- `apps/admin/lib/runtime/edit-tab-selection.ts` (new): pure function
  `editEntryTab(tabs, fields, values, currentTab)` — generic, not
  tenant-specific. Returns the first tab (in the record's own tab order)
  containing a field that would actually render as an editable input (not
  `readOnly`, not blocked by `readOnlyWhen`, not `hidden`, its
  `visibleWhen`/`visibleWhenAny` condition met, not one of the non-input
  field types `timeline`/`relatedRecords`/`process`) — or `null` if the
  current tab already has one, or if no tab does.
- Wired into `apps/admin/app/_components/runtime/runtime-record-page.tsx`'s
  `enterEditMode` (previously `() => setMode("edit")` with no tab logic at
  all).
- `apps/admin/lib/runtime/edit-tab-selection.spec.ts` (new, 7 cases):
  switches to the first editable tab when the current one has none; leaves
  the tab alone when it already has something editable; returns `null` for a
  fully read-only record; respects `readOnlyWhen`, `hidden`, conditional
  `visibleWhen`, and the non-input field types.
- REG-590 filed in `docs/qa/regressions/_incoming/wp08.md`.

### 2. BUG-3220 (admin part) — zero loading/error boundaries under `(internal)/`

- `apps/admin/app/(internal)/loading.tsx` (new): skeleton, mirrors
  `apps/web`'s `(authenticated)/loading.tsx` pattern (one file covers every
  nested segment without its own).
- `apps/admin/app/(internal)/error.tsx` (new): shows a status/message-derived
  title and description, an error reference id when the thrown error carries
  one (`traceId`/`digest`/`code`), and a "Try again" retry button
  (`reset()`). Renders inside `(internal)/layout.tsx`'s `<AdminShell>`, so
  nav/topbar stay mounted.
- `apps/admin/app/(internal)/_lib/classify-internal-error.ts` (new, pure):
  `describeInternalError()` maps `status`/`statusCode` (401/403/404/5xx) to a
  specific title+description, falls back to a genuine client-side
  `error.message` (run through the existing `humanizeErrorMessage` so an
  internal-detail message like "Database constraint failed" still gets
  rewritten per BUG-1549) when no status is present, and recognises the
  React Server-Component production placeholder
  (`isServerComponentPlaceholder`, mirroring `apps/web`'s
  `classify-dashboard-error.ts`) rather than surfacing it verbatim as "the
  error message".
- **Deliberately did not add anything under `operations/monitoring`** — that
  segment did not exist yet in this worktree (only `operations/provisioning`
  does); per the brief it is WP-06's to add, and the route-group-level
  boundary above will cover it automatically until/unless WP-06 gives it a
  more specific one.
- `apps/admin/app/(internal)/_lib/classify-internal-error.spec.ts` (new, 10
  cases).

### 3. Generic "Something went wrong" audit (apps/admin)

Searched `apps/admin` for a generic fallback swallowing a meaningful API
message (`grep -rn "went wrong"`, plus tracing every runtime catch path and
`api-error.ts`/`server-api.ts`/`http-module-runtime-adapter.ts`). Found two
hits, both already correct and left unchanged:

- `humanize-field-error.ts`'s `INTERNAL_MESSAGES` table is the *designed*
  mechanism (BUG-1549) that replaces genuinely opaque messages like
  "Database constraint failed" with actionable text — it does not swallow a
  meaningful message, it replaces a meaningless one.
- `permission-assignment-panel.tsx`'s `"Something went wrong while saving
  permissions."` fires only in the `catch` block for a *network*-level fetch
  failure (no response ever came back), not for a failed-but-answered
  request (that branch already surfaces `data?.message`) — there is no API
  message available to lose here.

Every other catch path checked
(`runtime-record-page.tsx`, `runtime-module-list.tsx`, `module-action-bar.tsx`,
`record-status-group.tsx`, `tenant-*-panel.tsx`, `http-module-runtime-adapter.ts`)
follows `reason instanceof Error ? reason.message : "<specific fallback>"`,
and every adapter throws with `payload?.message` first
(`RuntimeApiError`/`ApiRequestError`/`describeError`) — the fallback string
is a specific, non-generic sentence per call site, not a `"went wrong"`
catch-all, and is only reached when the caught value isn't even an `Error`.
No fix was needed here.

## Task A harness

`e2e/tools/admin-crud-matrix.mjs` (Node 22, global `fetch`, no new
dependencies). Configurable via `ADMIN_CRUD_*` env vars (see the file's own
header comment); refuses to run unless the API host resolves to
`localhost`/`127.0.0.1`. Enumerates modules from
`packages/config/platform-runtime-schema.generated.json`. Logs in as
SUPER_ADMIN, PLATFORM_ADMIN, PLATFORM_OPERATIONS and a tenant admin
(`system-admin@dijipeople.local` in the seeded demo tenant, tenant slug
`dijipeople-demo`), plus an anonymous caller. Creates real records for the
six create-capable modules, exercises list/view/create/edit/delete/
malformed-id/missing-id/search/pagination/validation/authorization/audit/
concurrency, and cleans up everything deletable (see Cleanup above for what
is not, by design).

## KNOWN_MISTAKES_AVOIDED

- BUG-2463 (generic Prisma-constraint messages reaching operators) —
  checked directly rather than assumed accurate; Finding 4 above is evidence
  it may already be resolved for the `customer-onboarding` endpoint
  specifically, so the harness reports the current live behaviour instead of
  repeating the record's premise unverified ("measure a bug record before
  fixing it").
- BUG-3175 (nine admin modules paginate/sort/search in Node memory) — not
  touched; that is backend `services/api` code outside `apps/admin`'s
  ownership. The harness's `(Y*)` modules from D6 all still passed
  list/search/pagination functionally (the bug is about efficiency, not
  correctness, exactly as BUG-3175 states).
- BUG-2013/BUG-3220's own prior fix in `apps/web` — the React
  Server-Component placeholder-message problem — was mirrored rather than
  rediscovered: `classify-internal-error.ts` recognises it the same way
  `apps/web/app/(authenticated)/_lib/classify-dashboard-error.ts` does.
- Did not add any explanatory helper/description text to a UI control (per
  the standing instruction) — the error boundary's description text is the
  error state's own content, not helper text on a control, and no new label
  or hint was added to any input.

## TESTS_ADDED

- `apps/admin/lib/runtime/edit-tab-selection.spec.ts` — 7 cases (BUG-3546).
- `apps/admin/app/(internal)/_lib/classify-internal-error.spec.ts` — 10 cases
  (BUG-3220).
- `e2e/tools/admin-crud-matrix.mjs` — not a Jest spec; a live-stack exerciser
  per the brief.

## TEST_HOOKS (for WP-09 browser QA)

- Tenant record: `/tenants/:tenantId` (any seeded tenant, e.g. the demo
  tenant `d12b2637-8b27-408f-ab00-953ab4a19b5d`, slug `dijipeople-demo`) —
  land on Overview, click Edit, should jump to Configuration (BUG-3546).
- Any `(internal)` route with the network cut or the API stopped — should
  show the styled loading skeleton then the new error boundary with a
  reference id and "Try again", not Next's default screen (BUG-3220).
- `e2e/tools/admin-crud-matrix.mjs` can be re-run any time against a fresh
  throwaway stack for a live CRUD regression sweep.

## RECORD_CLOSURES

- REG-590 / commit (this WP's final commit, see below) /
  `apps/admin/lib/runtime/edit-tab-selection.spec.ts` / fails without the fix
  (yes — before this change, `enterEditMode` had no tab-switching logic at
  all, so `editEntryTab` did not exist for the spec to call).

## VALIDATION

- `npm --workspace admin run test` → **49 suites, 440 tests, all passed.**
- `npm --workspace admin run check-types` → **passed** (`next typegen && tsc
  --noEmit`, no errors).
- `npx eslint --fix` on every file this WP changed under `apps/admin` → **no
  errors, no changes needed** (already clean).
- `node --check e2e/tools/admin-crud-matrix.mjs` → **passed**, and the
  harness itself was run live against the throwaway stack (multiple
  iterations while fixing fixture bugs found by running it; see git log).
- Full `npm --workspace api run test` was **not** run by this stream — no
  `services/api` source was changed by WP-08 (only `apps/admin`,
  `e2e/tools/`, and `docs/qa/regressions/_incoming/`), so per COMMON-RULES
  ("Run the full `npm --workspace api run test` once before your final
  commit") this is `NOT_REQUIRED` for this package; another stream that
  touches `services/api` covers it.

## UNRESOLVED

- None owned by `apps/admin`. Findings 1–5 above are for the Architect to
  triage against `platform-runtime`/`audit`/`super-admin`/`partners`
  ownership — not fixed here per the brief ("Do NOT fix code owned by other
  packages").
- 5 contracts + 6 support-cases remain in `dijipeople_pah_test` from this
  session's harness iterations (see Cleanup) — by product design, nothing
  through the API can remove them; they are tagged
  `zzzharnessXXXXXXXX` for identification if the throwaway database is ever
  inspected directly.
