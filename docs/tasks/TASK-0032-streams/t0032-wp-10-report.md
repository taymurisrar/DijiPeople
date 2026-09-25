# WP-10 report — platform audit trail

Stream report of [[TASK-0032]].

TASK-0032, EXECPLAN-0051. Branch `agent/pah-wp10-audit-trail`, worktree
`D:/My Work/hrm-dijipeople/dp-pah-wp10`, cut from the task branch at `b8198c76`
(WP-01..WP-08 already integrated). REG range REG-602..REG-609 (all used).

## IMPLEMENTED

**BUG-3564 — a readable platform audit trail**

1. **`GET`/`GET :id` `/platform/audit-logs`** (new `PlatformAuditController`,
   `services/api/src/modules/audit/platform-audit.controller.ts`) —
   platform-guarded (`JwtAuthGuard` + `PlatformPermissionsGuard`,
   `@RequirePlatformPermission('monitoring.read')` declared per handler, the
   same mechanism `SuperAdminController` uses for its ADR-0018 narrow keys).
   Permission decision: `monitoring.read`, not a new key. It is already held
   by every audit-facing platform role — READ_ONLY_AUDITOR, SUPPORT_MANAGER,
   SUPPORT_AGENT, MONITORING_OPERATOR, PLATFORM_ADMIN, PLATFORM_OPERATIONS,
   SUPER_ADMIN — and by no commercial/presales role, so it satisfies BUG-3564's
   acceptance criteria without a grant decision or a new permission-catalog
   entry. The alternative (`audit.read`, a new key granted to the same five
   roles the bug named) is documented as rejected in the controller's own
   comment.
2. **`AuditRepository.findPlatformAudit`/`findOnePlatformAudit`/
   `getPlatformFilterMetadata`** (`audit.repository.ts`) — server-side
   pagination (`skip`/`take`), filters on actor (`platformActorUserId`),
   action (expanded through `resolveAuditActionAliases`, same as the tenant
   reader), entity type/id, a trace-id filter matching either `traceId` or
   `requestId`, a free-text `search` over `action`/`entityType`, and a date
   range on `createdAt`. Built as an `AND` array of clauses (the
   `platform-monitoring.service.ts` pattern), not an object literal, because
   `traceId` and `search` each need their own `OR` and two `OR` keys on one
   object silently collide.
3. **`AuditService.listPlatform`/`detailPlatform`** (`audit.service.ts`) —
   list rows carry no snapshot (nothing to leak, nothing to ship needlessly);
   `detailPlatform` returns before/after snapshots re-run through
   `redactAuditSnapshot` on read — defence in depth, since `AuditService.log()`
   already redacts at write time and this only guards a historical row or a
   hypothetical future call site that bypassed `log()`.
4. **`GET /audit-logs` (tenant reader) now refuses a platform caller
   explicitly** instead of silently answering 200 with an empty page. Root
   cause: a platform user's `tenantId` is the literal `'platform'`;
   `PermissionsGuard`'s elevated-role bypass (`hasElevatedTenantRole`, via the
   `system-admin` alias SUPER_ADMIN/PLATFORM_OWNER carry) let those two roles
   through the guard, and `listByTenant('platform', ...)` then queried the
   tenant `AuditLog` table, which never holds a `tenantId: 'platform'` row.
   Every other platform role was already refused by the guard itself for
   lacking the tenant `audit.read` permission; this closes the gap only for
   the two roles the bypass let through.

**REST bulk-delete admin tier (WP-02 follow-up)**

5. `DELETE /super-admin/customers` and `/customer-onboarding`
   (`PlatformLifecycleService.bulkDeleteCustomers`/
   `bulkDeleteCustomerOnboardings`) decided who may run them on a weaker rule
   than the identical action through the generic runtime delete path
   (`PlatformRuntimeService.assertAdmin`, `remove`/`execute 'bulk-delete'`): a
   non-admin-tier role holding `customers.update`/`onboarding.update`
   (PLATFORM_OPERATIONS, MEMBER, PRESALES_MANAGER) could still bulk-delete
   records it "owned" via `assignedToUserId`/`onboardingOwnerUserId`, where the
   runtime path refuses those roles outright regardless of ownership.
   Extracted the runtime path's role check into `isPlatformAdminTier()`
   (`platform-auth/platform-permissions.ts`, exported alongside a
   `PLATFORM_ADMIN_TIER_ROLES` set) and made both `PlatformRuntimeService`'s
   `assertAdmin` and the two `PlatformLifecycleService` methods call it, so the
   two paths cannot decide the same action differently again. The now-dead
   ownership-restriction branch in both methods was removed (unreachable once
   the hard tier check runs first).

**Admin UI**

6. **"Audit trail" tab** added to `MonitoringNav`
   (`app/_components/monitoring/monitoring-nav.tsx`), routing to
   `/settings/monitoring/audit-logs`.
7. **`AuditTrailTable`** (`app/_components/monitoring/audit-trail-table.tsx`)
   — `ProDataTable` with filters (action, entity type, entity id, actor,
   trace/request id, search, date range, page size), server-driven pagination,
   loading/empty states from `ProDataTable` itself, and an expandable row
   fetching the detail lazily from a new thin proxy route
   (`app/api/platform/audit-logs/[id]/route.ts`, same shape as the existing
   `logs/events/[traceId]` proxy — never decides authorization itself). The
   detail panel renders before/after as a **field-level diff table**
   (`diffAuditSnapshotFields`, `lib/audit-trail.ts`) rather than two raw JSON
   blobs. No explanatory helper text was added to any control.
8. **New page** `app/(internal)/settings/monitoring/audit-logs/page.tsx` —
   same `requireSystemAdminUser` + `hasPermission(..., "monitoring.read")`
   pattern as the sibling `error-logs/page.tsx`; inherits the monitoring
   segment's `loading.tsx`/`error.tsx` from WP-06 (no bespoke boundary
   needed).
9. **"View in audit trail" link** added to the incident detail view's existing
   "related audit events" panel (`error-logs-table.tsx`, WP-06's
   `findRelatedAuditEvents`, reused unchanged — not duplicated), for
   `platform`-scope rows only, filtering the audit trail list by the
   incident's own trace id. Deliberately **not** a per-record route
   (`audit-logs/${event.id}`) — there is no dynamic segment under
   `settings/monitoring/audit-logs`, and building one would have been the
   exact BUG-1419 shape (`monitoring-incident-link.spec.ts` already guards
   that mistake for the incidents queue; `audit-trail-link.spec.ts` guards it
   here too). A `tenant`-scope row gets no link — this admin app has no screen
   for a tenant's own audit trail.

## CHANGED_BEHAVIOR

- `GET /audit-logs` (tenant reader): a caller whose `tenantId === 'platform'`
  now gets `400 PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT` instead of `200`
  with an empty page. No change for any real tenant caller.
- `DELETE /super-admin/customers` and `/customer-onboarding`: PLATFORM_
  OPERATIONS, MEMBER and PRESALES_MANAGER are now refused outright
  (`403 Forbidden`), even for records they previously could delete by
  "ownership". SUPER_ADMIN, PLATFORM_OWNER and PLATFORM_ADMIN are unaffected.
- New additive routes: `GET/GET :id /platform/audit-logs`,
  `GET /api/platform/audit-logs/[id]` (admin proxy). New additive admin route:
  `/settings/monitoring/audit-logs`.

## RISK_AREAS

- **`findPlatformAudit`'s `search` is a substring match over `action`/
  `entityType` only** — it does not search snapshot contents (which are
  redacted and not what a `contains` filter should touch anyway) or actor
  name. An operator searching by a person's name will need the Actor filter,
  not the search box; this is a deliberate scope limit, not an oversight, but
  worth a UX note if it comes up in QA.
- **The audit trail's date-range filter and the tenant reader's are separate
  implementations** (same `buildDateRange` shape, different files) — not
  factored into one shared helper because `audit.repository.ts` already had
  `buildDateRange` as a module-private function used by both readers via
  ordinary code reuse within the file; no duplication was introduced, but a
  future third reader should extract it rather than adding a third copy.
- **`isPlatformAdminTier` is a role-list check, not a permission check** — by
  design (it mirrors `PlatformRuntimeService.assertAdmin`'s existing shape
  exactly), but it means a future new platform role intended to sit at
  "admin tier" needs an explicit addition to `PLATFORM_ADMIN_TIER_ROLES`
  rather than inheriting it from a permission grant.
- **The "View in audit trail" link only appears for `platform`-scope related
  audit events** — a `tenant`-scope one (a platform admin editing a tenant's
  own data, which writes to that tenant's `AuditLog`) has no link anywhere in
  this admin app. This is the documented, deliberate boundary (this app has no
  tenant audit screen), not a bug, but it is asymmetric and could read as
  inconsistent in a QA pass.

## KNOWN_MISTAKES_AVOIDED

- **BUG-1419 pattern** (a record route composed under a screen with no
  dynamic segment) — the "related audit events" link filters the existing list
  by trace id instead of inventing `audit-logs/${event.id}`; `git diff`-proven
  to 404 without the fix (see TESTS_ADDED), and a dedicated regression spec
  (`audit-trail-link.spec.ts`) pins the shape.
- **BUG-3175 pattern** (a list that fetches everything and slices in memory) —
  `findPlatformAudit` is proven, by inspecting the actual Prisma call
  arguments, to page with `skip`/`take`, not in memory (REG-609).
- **BUG-0072 pattern** (a mutating action satisfied by a read permission) —
  does not apply to a read-only controller, but the admin-tier fix
  deliberately mirrors the exact predicate the runtime path already uses
  rather than reconstructing a role list that could drift from it a second
  time (REG-607/608's whole point).
- **Single point of redaction with no defence in depth** — `detailPlatform`
  re-runs `redactAuditSnapshot` on read, proven by a fake historical row that
  was never redacted at write time (REG-606).
- **Mention-only specs** — every new spec below was confirmed to fail against
  the pre-fix code by temporarily reverting the fix and re-running (see
  RECORD_CLOSURES), not merely asserted to pass.
- **Two paths, one decision, decided differently** (the WP-02-documented risk
  this package closes) — `PlatformRuntimeService.assertAdmin` and the two
  `PlatformLifecycleService` bulk-delete methods now call the same exported
  predicate rather than each carrying their own role list.

## TESTS_ADDED

All under `services/api/src/`, run with
`DATABASE_URL=postgresql://u:p@localhost:5432/x` (no live DB needed) unless
noted:

| File | Proves |
|---|---|
| `modules/audit/platform-audit-trail.spec.ts` (18 tests) | `findPlatformAudit`'s filters reach the real Prisma `where`/`skip`/`take` (no unbounded `findMany`); the `AND`-array shape keeps a `traceId` filter and a `search` filter from colliding; action-alias expansion; date range; `listPlatform`/`detailPlatform` mapping, 404 on a missing id, snapshots omitted from list rows, snapshots re-redacted on detail even when the write path already redacted them |
| `modules/audit/audit.controller.spec.ts` (4 tests) | `GET /audit-logs`/`:id` refuse a platform caller with `PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT` and never call the tenant service; an ordinary tenant caller is unaffected |
| `modules/audit/platform-audit-authorization.spec.ts` (16 tests) | `PlatformAuditController` declares `monitoring.read` on both handlers; every audit-facing role admitted, every commercial/presales role refused; `PlatformPermissionsGuard` refuses a tenant subject and an unauthenticated request, admits READ_ONLY_AUDITOR, refuses PRESALES_MANAGER |
| `modules/super-admin/bulk-delete-admin-tier.spec.ts` (12 tests) | PLATFORM_OPERATIONS/MEMBER/PRESALES_MANAGER refused outright on both bulk-delete methods even when they "own" every targeted record; SUPER_ADMIN/PLATFORM_OWNER/PLATFORM_ADMIN proceed |
| `apps/admin/lib/audit-trail.spec.ts` (9 tests) | `buildAuditTrailQueryString` keeps only the DTO's declared params, drops empty values, takes the first of a repeated param; `diffAuditSnapshotFields` reports only changed fields, includes added/removed fields with the missing side as `undefined`, returns nothing for identical or absent snapshots, falls back to a whole-value diff for a non-field-shaped snapshot, sorts alphabetically |
| `apps/admin/app/_components/monitoring/audit-trail-nav.spec.ts` (1 test) | `MonitoringNav` wires the audit trail route into its tab list (source-scan, matching `monitoring-incident-link.spec.ts` — admin's jest has no jsdom) |
| `apps/admin/app/_components/monitoring/audit-trail-link.spec.ts` (3 tests) | The related-audit-events link does not compose the non-existent `audit-logs/${event.id}` route; it does compose `audit-logs?traceId=${log.referenceNumber}`; the `scope` field it reads still exists on the type |

Total new specs: 63. Every load-bearing one (platform reader existence and
filters, the tenant-route refusal, the authorization matrix, the bulk-delete
tier, the nav link, the audit-trail link shape) was confirmed to fail against
the pre-fix code — see RECORD_CLOSURES for exactly how each was reverted and
re-run.

## TEST_HOOKS

- `GET /platform/audit-logs` — platform-guarded, `monitoring.read`. Filters:
  `action`, `entityType`, `entityId`, `actorUserId`, `traceId`, `search`,
  `fromDate`, `toDate`, `page`, `pageSize`.
- `GET /platform/audit-logs/:id` — same guard; returns
  `beforeSnapshot`/`afterSnapshot`/`scope`, redacted.
- `GET /audit-logs` as a platform caller (any role) → `400
  PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT`.
- `DELETE /super-admin/customers` / `/customer-onboarding` as
  PLATFORM_OPERATIONS/MEMBER/PRESALES_MANAGER → `403 Forbidden`, "Platform
  administrator access is required to bulk delete …".
- Admin: `/settings/monitoring/audit-logs` — filters, expand a row for the
  before/after diff. `/settings/monitoring/error-logs`, expand an incident
  with a related platform audit event → "View in audit trail" link, filtered
  by that incident's trace id.
- To see a real row end to end: edit a tenant's profile as SUPER_ADMIN
  (`PATCH /platform-runtime/tenants/:id`, per WP-02), which writes
  `TENANT_PROFILE_UPDATED` to `PlatformAuditLog`; it appears in the new list
  and its before/after diff shows the changed field(s).

## RECORD_CLOSURES

| Record | Commit(s) | Regression | Spec | Fails without fix |
|---|---|---|---|---|
| BUG-3564 (reader) | `1712e957` | REG-602, REG-603, REG-604, REG-605, REG-606, REG-609 | `platform-audit-trail.spec.ts`, `audit.controller.spec.ts`, `platform-audit-authorization.spec.ts` | yes — `AuditService.listPlatform`/`detailPlatform` and their repository methods did not exist before this commit; with the `assertNotPlatformCaller` guard removed, 3/4 `audit.controller.spec.ts` cases fail (verified by temporary revert) |
| BUG-3564 (bulk-delete tier) | `cac4a93c` | REG-607, REG-608 | `bulk-delete-admin-tier.spec.ts` | yes — with the `isPlatformAdminTier` guard clause removed from both methods, all 6 non-admin-tier refusal cases resolve successfully instead of rejecting (verified by temporary revert) |
| BUG-3564 (admin UI) | `7e625f14` | — (UI, not separately REG'd; covered by the specs above) | `audit-trail-nav.spec.ts`, `audit-trail-link.spec.ts` | yes — both verified by temporary revert: removing the nav entry fails the nav spec; removing the link block fails 1 of 3 link-spec assertions |

## VALIDATION

| Command | Result |
|---|---|
| `npm --workspace api run check-types` | PASS |
| `npm --workspace admin run check-types` | PASS |
| Targeted: `modules/audit`, `modules/super-admin/bulk-delete-admin-tier.spec.ts`, `modules/platform-auth/platform-permissions.spec.ts`, `modules/platform-runtime`, `wiring-invariants`, `rbac-matrix` | PASS — 25 suites, 229 tests (plus 7 suites/32 tests for wiring-invariants+rbac-matrix run separately) |
| `DATABASE_URL=... NODE_OPTIONS=--max-old-space-size=6144 npx jest -w 2` (full API suite, from `services/api`) | **7286/7288 passed, 2 failed** — both in `modules/auth/mfa/mfa.service.spec.ts` ("refuses to start while MFA is already on" — timeout; "accepts a current code and refuses the same code a second time" — `base32Decode` null). **Pre-existing, not caused by this package**: this file is untouched by WP-10 (`git diff b8198c76 HEAD -- services/api/src/modules/auth/mfa/` is empty for this spec's own directory beyond WP-10's own files, none of which live there), and running it in isolation (`npx jest modules/auth/mfa/mfa.service.spec.ts`) passes 21/21 — the two failures are order/resource-contention flakiness under the full parallel run, not a regression from this package. |
| `cd services/api && npx eslint --fix <every api file changed>` | PASS — 0 errors. Pre-existing-shape warnings only (`no-unsafe-*` in `platform-runtime.service.ts`, unrelated to the lines this package touched; a few `no-unsafe-assignment`/`no-unsafe-member-access` warnings in the new Prisma-mock-heavy spec files, matching the style already accepted in `platform-monitoring-list-filters.spec.ts`) |
| `npm --workspace admin run test` | PASS — 55 suites, 482 tests (469 pre-existing + 13 new) |
| `npx eslint --fix` on every admin file changed | PASS — 0 errors, 0 warnings |
| `npx prettier --check` on every admin file changed | The 2 pre-existing files this package edited (`error-logs-table.tsx`, `monitoring-nav.tsx`) already fail prettier at `HEAD` (confirmed via `git show HEAD:<path> | prettier --stdin-filepath <path> --check`, exit 1 before any change of mine) — left alone, matching the precedent WP-02 documented ("four pre-existing admin pages already failed prettier at base and were left alone"). Every wholly new file this package added was formatted with `prettier --write` and passes. |

## UNRESOLVED

- **Owner decision, not mine to make**: whether `findPlatformAudit`'s `search`
  should also match actor name — flagging rather than guessing, since it
  changes the query shape (a join or a second `OR` branch against
  `PlatformUser`).
- **`error-logs-table.tsx`/`monitoring-nav.tsx` prettier drift** — pre-existing
  at `HEAD`, not introduced or worsened by this package, not fixed here per
  AGENTS.md's "do not reformat files you are not otherwise changing" (a full
  `prettier --write` on either file would reformat unrelated regions).
- No e2e/browser validation was run in this worktree — `next dev`/`next build`
  are out of scope per `COMMON-RULES.md` (WP-09 owns browser validation
  centrally); the admin proxy route and page were validated by `check-types`
  and the component's pure-logic tests only.

Exact commit SHAs on `agent/pah-wp10-audit-trail` (oldest to newest, all in
this package): `1712e957` (platform audit reader + tenant-route refusal),
`cac4a93c` (bulk-delete admin tier), `7e625f14` (admin UI), plus this report's
own commit. The Architect assigns the final merged SHA when integrating.
