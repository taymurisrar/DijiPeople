# QA Run — tenant-control-plane

> **This is a retrospective validation record, not a standard QA run.** The
> implementation was completed in an earlier task that never produced one. QA's
> normal discipline — expected behaviour written *before* execution — could not
> be applied to code that already existed, and no scenario here should be read
> as having predicted its own result. What this record does establish is what
> was independently verified against the merged code, and what was not.
>
> Recorded during the finalization recovery described in
> [`.agent/context/task-completion-contract.md`](../../../.agent/context/task-completion-contract.md).

## Metadata

| | |
|---|---|
| Date / time | 2026-08-14T19:42:41Z |
| Branch | `agent/tenant-control-plane` |
| Commit SHA | `ba1e81825661827e57f4eeda72925631d2d333f7` |
| Worktree | `D:\My Work\hrm-dijipeople\DijiPeople` |
| Environment | working tree clean; **no live database**; no external services; no jsdom |
| QA agent | Claude Opus 5 (finalization recovery) |
| Scope | Static authorization audit + full automated suite set. **No runtime, database or UI execution.** |

## Requirement

A unified platform control plane for tenant administration: one API module
(`services/api/src/modules/tenant-control-plane/`) covering tenant overview,
readiness, configuration, commercial data, timeline, system state, access
management, module/app assignment, provisioning operations and tenant erasure —
with the `apps/admin` tenant record page rebuilt on the platform runtime,
replacing ten bespoke `tenant-*` components.

No ExecPlan exists. The implementing task did not produce one, which is itself
part of what the finalization recovery is recording.

## Risk Areas

This is a **cross-tenant control plane**, so the repository's usual primary
control — filter every query by `request.user.tenantId` — deliberately does not
apply. That inverts the normal risk profile:

| Risk | Why it matters here | Bug pattern |
|---|---|---|
| Authorization enforced in services, not decorators | The controller carries only `JwtAuthGuard`; no `@Permissions` / `@RequirePermission`. A handler that forgets its service-side assertion is an authenticated-only cross-tenant endpoint | [`service-authorization-hidden`](../known-bug-patterns/service-authorization-hidden.md) |
| Missing assertion on any reachable method | Would expose every tenant's data to any authenticated platform user | [`authorization-missing`](../known-bug-patterns/authorization-missing.md) |
| Tenant id taken from the request path | Must be looked up and confirmed, never trusted | [`tenant-filter-missing`](../known-bug-patterns/tenant-filter-missing.md) |
| Irreversible erasure | Permission alone is the wrong bar for destroying a tenant | — |
| Migration compatibility | Old API code must run against the new schema during rollout | — |
| Admin UI gating vs backend truth | Frontend gating is cosmetic; the API is authority | [`ui-permission-backend-mismatch`](../known-bug-patterns/ui-permission-backend-mismatch.md) |

Regression register: **no entries exist for `tenants`, `super-admin` or
`platform-*`**, so there was nothing to re-check. That is a gap, not a clean
bill of health.

## Scenarios

Static verification against the merged code. Results are observations, not
predictions.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every service method the controller can reach asserts platform authorization | permission | all reachable methods assert | **PASS** — 26/26 | script walked all `this.<svc>.<method>(` call sites in the controller and matched each to its service body |
| S2 | `readiness()` — flagged as having no inline assertion | permission | either asserts or is a defect | **PASS** — delegates to `overview()`, which calls `assertTenantPlatformAccess(user, 'tenants.read')` (`tenant-control-plane.service.ts:62,151-154`). Authorized transitively | see S2 note below |
| S3 | Platform identity required before permission is considered | permission | non-platform caller rejected | **PASS** — `assertTenantPlatformAccess` throws `ForbiddenException` when `user.platform?.id` is absent (`tenant-control-plane.guard.ts:22-24`) | code read |
| S4 | Tenant erasure requires more than a permission | permission | elevated platform role required | **PASS** — `assertPlatformAdministrator` restricts to `SUPER_ADMIN`, `PLATFORM_OWNER`, `PLATFORM_ADMIN` (`guard.ts:40-49`) | code read |
| S5 | Tenant addressed by path param is validated | tenant | id parsed and looked up, not trusted | **PASS** — `ParseUUIDPipe` on every `:tenantId`; `loadTenantOrThrow` resolves it before use | controller + guard |
| S6 | Migration is backward compatible | migration | no destructive statement | **PASS** — 4 `CREATE TABLE`, 10 `CREATE INDEX`, 2 unique indexes, 4 enum `ADD VALUE IF NOT EXISTS`, 1 nullable `ADD COLUMN`, 5 FK constraints. **Zero** `DROP`/`TRUNCATE`; no `NOT NULL` added without a default | `20260814190000_tenant_control_plane/migration.sql` |
| S7 | Module's own unit tests pass | regression | green | **PASS** — 7 spec files, contributing to +6 suites / +56 tests over `main` | `npm --workspace api run test` |
| S8 | Admin runtime definition covered | contract | green | **PASS** — `tenant-runtime-definition.spec.ts` added; admin suites 4→5, 23→40 tests | `npm --workspace admin run test` |
| S9 | Generated runtime schema contract intact | contract | sensitive/system fields stay non-writable | **PASS** — 3/3 | `npm run test:runtime-schema` |

**S2 note.** Transitive authorization is correct but harder to audit: a future
refactor that stops `readiness()` delegating to `overview()` would silently
remove its only check, and no test would fail. Recorded as a LOW observation and
a follow-up, not a defect.

## Automated Suites

All against `ba1e818` (task branch reconciled with `main`).

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm run prisma:validate` | schema | valid | 0 | — | — |
| `node scripts/validate-framework.mjs` | framework | 204 | 0 | 0 | <1s |
| `npm run typecheck` | 7 workspaces | 7 | 0 | 0 | — |
| `npm --workspace api run test` (CI gate pattern) | API | 133 suites / 820 tests | 0 | 1 | 27.2s |
| `npm --workspace web run test` | web | 16 suites / 379 tests | 0 | 0 | 4.3s |
| `npm --workspace admin run test` | admin | 5 suites / 40 tests | 0 | 0 | 3.2s |
| `npm run test:runtime-schema` | runtime contract | 3 | 0 | 0 | 0.18s |
| `npx eslint` (web, admin, landing) | lint | clean | 0 | — | — |
| `npm run build` | 6 packages | 6 | 0 | — | — |

Baseline for comparison, `main` before this work: API 127 suites / 764 tests,
admin 4 suites / 23 tests. The deltas are this module's own coverage.

The one skipped API test and the excluded dual-permission wiring invariant are
pre-existing known baselines — see [`ci.md`](../../development/ci.md).

### Regression-test proof

| Test | With fix | Without fix (stashed) |
|---|---|---|
| — | — | **Not applicable** — this is a feature, not a bug fix. No defect was found, so there is nothing for a regression test to prove absent. |

## Manual Validation

**None.** No application was started, no request was issued, no screen was
opened. Everything above is static analysis or automated suite output. This is
the single largest limitation of this record.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| — | — | No register entries exist for the modules in scope (`tenants`, `super-admin`, `platform-*`). Nothing to re-check. |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| — | — | None. The one candidate (S2, `readiness()` without an inline assertion) resolved to correct-but-indirect on inspection. | — | — |

## Known Limitations

Specific, because the verdict depends on them:

- **No live database.** Migration was read, never applied. Forward application,
  the four enum additions against existing rows, and the FK constraints were not
  executed anywhere.
- **No runtime execution.** No endpoint was called. Authorization is verified by
  reading assertions, not by observing a 403.
- **No negative-path role testing.** "A non-platform user receives 403" is
  verified by code reading, not by a request.
- **No UI validation.** Web and admin jest run in a node environment with no
  jsdom, so the rebuilt tenant record page and its ten replacement panels were
  never rendered. Loading, error, empty and access-denied states are unverified.
- **No e2e.** The 9 e2e suites require a live database and were not run.
- **Tenant erasure was never exercised**, in any form. It is the most
  destructive operation in the module and has unit tests only.
- **Retrospective.** Scenarios were derived after the code existed.

## Final QA Verdict

**PASS WITH RISKS**

Every automated suite in the repository's gated set passes, the authorization
model is coherent and — verified method by method — complete across all 26
reachable service methods, and the migration is strictly additive so old code
keeps running against the new schema. Nothing found here blocks the merge.

The risks are what was *not* done, and they are substantial: no live database,
no executed request, no rendered UI, no e2e, and no exercise of tenant erasure.
This record establishes that the code is internally consistent and that the
suites are green. It does not establish that the feature works end to end,
because nothing here ran it.

## Follow-up

1. **Exercise tenant erasure against a disposable database** before it is used
   in anger. Unit tests are not sufficient evidence for an irreversible
   operation.
2. **Add a regression entry** for the platform control plane once the module has
   its first real defect — the register currently has no coverage of
   `platform-*` at all.
3. **Make S2 auditable**: either inline the assertion in `readiness()` or add a
   test that fails if it stops delegating to `overview()`.
4. **Apply the migration** in a real environment and confirm the enum additions
   and FK constraints land cleanly.
