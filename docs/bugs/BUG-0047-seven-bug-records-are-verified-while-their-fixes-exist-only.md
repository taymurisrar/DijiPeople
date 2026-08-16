---
ID: BUG-0047
aliases: [BUG-0047]
Title: Seven bug records are VERIFIED while their fixes exist only on unmerged branches
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: SECURITY
Source: ARCHITECT
DetectedDate: 2026-08-16
DetectedInSha: 714632d
AffectedModules: [services/api/src/modules/organization, services/api/src/modules/error-logs, services/api/src/modules/employees, services/api/src/modules/attendance, docs/qa/regressions]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt:
---

# BUG-0047 — Seven bug records are VERIFIED while their fixes exist only on unmerged branches

## Summary

`BUG-0001`–`BUG-0007` all carried `Status: VERIFIED` and
`ResolvedAt: 2026-08-14`, and their regression entries all carried `Active: yes`.
None of the commits implementing those fixes is an ancestor of `origin/main`.
They sit on `agent/authz-*` branches that were never merged.

Two of the seven are `CRITICAL`. The most severe — `BUG-0006`, privilege
escalation through unguarded organization-structure mutations — is still present
in the code on `main` exactly as originally reported, while the backlog reported
it fixed and verified.

The root cause is not the individual fixes. It is that a record was marked
`VERIFIED` on the evidence of a **branch**, and nothing re-checked that the
branch reached the integration target. Every downstream view —
`docs/backlog/open.md`, the dashboards, the regression register, a future agent's
`BACKLOG_PRECHECK` — then reports protection that does not exist.

## Expected Behavior

A bug record reaching `VERIFIED` means the fix and its regression test are
present on the branch the project integrates into, and a regression entry marked
`Active: yes` means the named test exists and runs.

## Actual Behavior

Seven records asserted a fixed state that `main` does not have, and six
regression entries named test files absent from `main`. The defects are live; the
records said they were closed.

## Reproduction

```bash
# None of the fix commits is an ancestor of origin/main
for c in 13e720e 3670b91 d10e7c5 2e73488 7f5eacd; do
  git merge-base --is-ancestor $c origin/main && echo "$c ON MAIN" || echo "$c NOT ON MAIN"
done
# → all five: NOT ON MAIN

# The most severe defect, still unguarded on main
git show origin/main:services/api/src/modules/organization/organizations.controller.ts \
  | grep -n "UseGuards\|@Post\|@Patch\|@Delete\|@Permissions"
# → 20:@UseGuards(JwtAuthGuard)        ← no PermissionsGuard
# → 61:@Post()  69:@Patch(':id')  78:@Delete(':id')   ← no @Permissions on any
```

## Evidence

**Records asserting a state `main` does not have**

| Record | Severity | Status | Fix commit | On `main`? |
|---|---|---|---|---|
| `BUG-0001` compensation/bank behind employee read | HIGH | VERIFIED | `13e720e` | no |
| `BUG-0002` self-approval of attendance corrections | HIGH | VERIFIED | `3670b91` | no |
| `BUG-0003` `readTeam` granted tenant-wide visibility | HIGH | VERIFIED | `3670b91` / `d10e7c5` | no |
| `BUG-0004` search filter overwrote the access scope | HIGH | VERIFIED | `agent/authz-batch0` | no |
| `BUG-0005` cross-tenant error-log read via support role | **CRITICAL** | VERIFIED | `agent/authz-batch0-errorlogs` | no |
| `BUG-0006` organization structure mutable by any authenticated user | **CRITICAL** | VERIFIED | `2e73488` | no |
| `BUG-0007` unguarded duplicate of a permission-gated route | HIGH | VERIFIED | `7f5eacd` | no |

**Regression entries naming tests absent from `main`** — all were marked
`Active: yes`:

```
REG-001  services/api/src/modules/employees/employee-compensation-access.spec.ts
REG-002  services/api/src/modules/attendance/attendance.correction-authorization.spec.ts
REG-003  services/api/src/modules/approvals/approvals.scope.spec.ts
REG-006  services/api/src/modules/organization/organization-structure-authorization.spec.ts
REG-007  services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts
```

Each exists only in `git log --all`, on an `agent/authz-*` branch. `BUG-0007` was
found by the new validator check rather than by the original sweep, which is the
check doing its job on its first run.

**Confirmed live on `main`** — `organizations.controller.ts`:

```
19  @Controller('organizations')
20  @UseGuards(JwtAuthGuard)      ← PermissionsGuard absent
61  @Post()                       ← no @Permissions
69  @Patch(':id')                 ← no @Permissions
78  @Delete(':id')                ← no @Permissions
```

`UpdateBusinessUnitDto` carries `parentBusinessUnitId` and `organizationId`, and
`accessibleBusinessUnitIds` feeds `buildScopedAccessWhere()` — so a PATCH from
any valid tenant JWT reshapes the access-control graph itself. That is the
original `BUG-0006` analysis, unchanged, against current `main`.

## Root Cause

`VERIFIED` was assigned from branch-level evidence. The completion contract
already requires `MERGE_STATUS` and `POST_MERGE_VALIDATION_STATUS`, but nothing
tied *record closure* to them: a record could be closed by a task that later
stopped at `IMPLEMENTATION_COMPLETE_BUT_UNMERGED`, and nothing revisited it. The
regression register has the same hole — `Active: yes` was never cross-checked
against the file actually existing.

## Impact

Two CRITICAL authorization defects are reachable in whatever is deployed from
`main`, and every system designed to surface them reports them resolved:
`docs/backlog/open.md` excludes them, the engineering dashboard counts them under
"Recently Fixed", and an agent running `BACKLOG_PRECHECK` on the organization or
error-logs modules is told there is nothing outstanding.

The secondary impact is trust: every other `VERIFIED` record is now only as
believable as the process that closed it.

## Affected Areas

`organization`, `error-logs`, `employees`, `attendance`, `approvals`,
`tenant-settings`; `docs/bugs/`, `docs/qa/regressions/index.md`, and every
generated view derived from them.

## Proposed Resolution

Two independent halves, both needed.

**Prevention — landed with this record.** `scripts/validate-framework.mjs` now
fails when a regression entry marked `Active: yes` names a test file that does
not exist, and when a `VERIFIED` or `CLOSED` bug record names a `RegressionId`
whose test is absent. That makes this class of drift a red build rather than
something a human notices two months later.

**Remediation — a separate task, and not this one's to do.** The
`agent/authz-batch0*`, `agent/authz-org-bu` and `agent/authz-feature-availability`
branches carry real fixes and real tests, and one has a live worktree attached.
Landing them needs the ordinary lifecycle — rebase onto the current integration
branch, CI, QA retest of each regression, review — and it is authorization work,
not framework work. Folding it into a `FRAMEWORK` task would be exactly the scope
violation the router forbids.

Until then the six records must state the truth: reopened, with the branch that
holds the fix named.

## Acceptance Criteria

- Each of `BUG-0001`–`BUG-0006` is either genuinely fixed on the integration
  branch, or carries a status reflecting that it is not.
- Every `Active: yes` regression entry names a test file present on the
  integration branch.
- `node scripts/validate-framework.mjs` fails if either condition regresses.

## Regression Coverage

`scripts/validate-framework.mjs` — "regression register names tests that exist"
and "a VERIFIED bug's regression test exists". Both fail against the state
recorded here and pass once it is corrected, which is the required
fails-without-the-fix property.

## Dependencies

Landing the fixes depends on branches owned by other work
(`agent/authz-feature-availability` has a worktree attached at
`D:/My Work/hrm-dijipeople/dijipeople-authz-batch0`). The prevention half depends
on none of them.

## Related Items

[[BUG-0001]] · [[BUG-0002]] · [[BUG-0003]] · [[BUG-0004]] · [[BUG-0005]] ·
[[BUG-0006]] · [[premature-completion]] · [[doc-code-drift]] ·
[[declared-but-unwired-step]] · [[TASK-0004]]

## Resolution

Prevention landed on `agent/framework-autonomous-v2`. Remediation outstanding.

## QA Retest

Pending — the retest is the six original regression scenarios, run against the
integration branch rather than against the branches that fixed them.

## History

- 2026-08-16 — found while deriving durable QA test plans for TASK-0004: the
  `AUTOMATED` scenarios needed real test paths, and five of the register's did
  not resolve. Following that back showed the fixes themselves had not merged.
