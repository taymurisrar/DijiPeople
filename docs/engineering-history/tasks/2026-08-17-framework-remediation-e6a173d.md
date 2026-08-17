# Engineering History — Framework remediation

| | |
|---|---|
| **Task Title** | Framework remediation |
| **Task Type** | BUG |
| **Date** | 2026-08-17 |
| **Architect Plan** | NOT_APPLICABLE — remediation of items already recorded in docs/bugs and docs/backlog, not new design |
| **Agents Used** | Architect, QA, Backend/API, Frontend/Landing, Reviewer, Integrator, Release/DevOps. **Not used:** Database (no schema or migration change), Integration (no external boundary changed), UI/UX (no experience change — the landing fix restores a form that could not be submitted) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/framework-remediation` |
| **Base SHA** | `b90f33e00c3845439797b51ef1ceb3ed7820a620` |
| **Final Task SHA** | `e6a173df30aa3b2e917a1ebce2058539d10d6fd3` |
| **Target Branch** | `develop` — main untouched |
| **Merge Commit** | `e6a173d` — fast-forward, no merge commit |
| **Final Target SHA** | `e6a173df30aa3b2e917a1ebce2058539d10d6fd3` on `origin/develop`, verified by reading the ref |

### Commits

```
d992088 feat(framework): autonomous framework v2 — sessions, develop integration, persistent QA
da018c4 merge origin/main: regenerate indexes, correct browser-tooling claims
9e437fa docs(backlog): close ITEM-0038 — the id allocator resolves it
f64ba4e chore: regenerate indexes after closing ITEM-0038
cc346b7 docs: QA run, engineering history, Git/CI cost analysis and task finalization
c77933f fix(repo-health): MAIN_CHANGE_STATUS must name who moved main
08a04b3 chore: close SESSION-0001 and finalize TASK-0004
d024cc4 fix(error-logs): scope support-role log reads to the caller's tenant
70ac613 fix(organization): require organization.manage for structure mutations
079e314 fix(employees): separate compensation visibility from employee-record read
8a9109b fix(attendance): bar self-approval and stop readTeam meaning tenant-wide
dcffe6a fix(approvals): scope approvals.readTeam to direct reports, not the tenant
16e36be fix(tenant-settings): require tenant-settings.resolved.read for feature availability
6c67426 fix(ci): clear the services/api lint error baseline and Flow B selector drift
3fe3292 fix(security,ci,obsidian): land the seven authorization fixes, promote API lint, resolve the vault
ee37560 fix(partners): optional website blank no longer blocks a partner inquiry — BUG-0048
fb9524d style(partners): format the BUG-0048 transform
e6a173d ci: promote browser-e2e to a required gate
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople               b90f33e [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0  7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs          b90f33e [agent/final-parent-implementation]
D:/My Work/hrm-dijipeople/dijipeople-remediation   e6a173d [agent/framework-remediation]
```

### Files Changed

172 file(s) against `origin/main`.

```
M	.agent/agents/architect.md
M	.agent/agents/integrator.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
A	.agent/context/agent-handoffs.md
A	.agent/context/branch-model.md
A	.agent/context/multi-session.md
A	.agent/context/qa-persistence.md
M	.agent/context/task-completion-contract.md
M	.agent/context/task-router.md
M	.github/workflows/ci.yml
M	.gitignore
D	.tmp-landing-err.log
D	.tmp-landing-out.log
M	AGENTS.md
M	apps/landing/app/partners/partner-inquiry-form.tsx
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0038-record-ids-collide-between-concurrent-branches.md
A	docs/backlog/items/ITEM-0040-develop-branch-protection-is-not-applied.md
A	docs/backlog/items/ITEM-0041-repository-ruleset-no-push-matches-no-branch-and-is-inert.md
A	docs/backlog/items/ITEM-0042-burn-down-the-services-api-eslint-warning-baseline.md
A	docs/backlog/items/ITEM-0043-promote-the-security-invariant-job-to-a-required-gate.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md
M	docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md
M	docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md
M	docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md
M	docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md
M	docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md
M	docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md
A	docs/bugs/BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only.md
A	docs/bugs/BUG-0048-partner-inquiry-form-rejects-every-submission-that-leaves-th.md
M	docs/bugs/README.md
M	docs/development/branch-protection.md
A	docs/development/develop-protection.json
A	docs/development/git-ci-cost.md
A	docs/development/removed-ruleset-15523234.json
A	docs/engineering-history/tasks/2026-08-16-framework-autonomous-v2-da018c4.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
A	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/README.md
A	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-16-framework-autonomous-v2-f64ba4e.md
A	docs/qa/scenarios/QA-AGENT-001-desktop-login-does-not-enumerate-accounts.md
A	docs/qa/scenarios/QA-AGENT-002-desktop-request-payloads-satisfy-the-dtos-that-receive-them.md
A	docs/qa/scenarios/QA-AGENT-003-a-replayed-heartbeat-is-not-counted-twice.md
A	docs/qa/scenarios/QA-ATT-001-punch-interpretation-pairs-punches-correctly-across-shift-bo.md
A	docs/qa/scenarios/QA-ATT-002-geofence-evaluation-treats-an-absent-location-as-outside.md
A	docs/qa/scenarios/QA-ATT-003-impossible-travel-between-punches-is-detected.md
A	docs/qa/scenarios/QA-ATT-004-raw-device-ingestion-is-idempotent-under-replay.md
A	docs/qa/scenarios/QA-ATT-005-the-attendance-engine-produces-sessions-end-to-end.md
A	docs/qa/scenarios/QA-ATT-006-an-employee-cannot-approve-their-own-attendance-correction.md
A	docs/qa/scenarios/QA-AUTH-001-every-caller-and-its-auth-route-agree-on-http-method.md
A	docs/qa/scenarios/QA-AUTH-002-sign-out-always-revokes-the-session-and-never-500s-while-cle.md
A	docs/qa/scenarios/QA-AUTH-003-repeated-failed-sign-ins-lock-the-account.md
A	docs/qa/scenarios/QA-AUTH-004-password-policy-is-enforced-on-set-and-on-change.md
A	docs/qa/scenarios/QA-AUTH-005-a-token-minted-for-one-app-client-is-rejected-by-another.md
A	docs/qa/scenarios/QA-AUTHZ-001-every-permission-gated-route-declares-both-permission-famili.md
A	docs/qa/scenarios/QA-AUTHZ-002-no-unguarded-duplicate-of-a-permission-gated-route-exists.md
A	docs/qa/scenarios/QA-AUTHZ-003-a-team-scoped-role-cannot-read-outside-its-subtree.md
A	docs/qa/scenarios/QA-AUTHZ-004-a-search-filter-narrows-the-access-scope-and-never-replaces-.md
A	docs/qa/scenarios/QA-AUTHZ-005-a-permission-change-takes-effect-on-the-next-request.md
A	docs/qa/scenarios/QA-AUTHZ-006-the-rbac-matrix-stays-internally-consistent.md
A	docs/qa/scenarios/QA-DEPLOY-001-deployment-smoke-checks-answer-against-the-deployed-environm.md
A	docs/qa/scenarios/QA-DEPLOY-002-no-url-is-hardcoded-where-configuration-is-required.md
A	docs/qa/scenarios/QA-DEPLOY-003-the-running-api-exposes-the-commit-it-was-built-from.md
A	docs/qa/scenarios/QA-DEPLOY-004-a-release-is-published-with-a-verifiable-artifact-and-sha.md
A	docs/qa/scenarios/QA-DEPLOY-005-the-committed-migration-history-applies-to-an-empty-database.md
A	docs/qa/scenarios/QA-LEAD-001-the-public-lead-endpoint-is-rate-limited.md
A	docs/qa/scenarios/QA-LEAD-002-every-public-write-handler-carries-a-rate-limit-guard.md
A	docs/qa/scenarios/QA-LEAD-003-rate-limiting-identifies-the-visitor-not-the-proxy.md
A	docs/qa/scenarios/QA-LEAD-004-the-public-contact-form-never-fabricates-lead-data.md
A	docs/qa/scenarios/QA-LEAD-005-lead-status-transitions-reject-illegal-moves.md
A	docs/qa/scenarios/QA-ONBOARD-001-a-signed-agreement-cannot-be-edited.md
A	docs/qa/scenarios/QA-ONBOARD-002-onboarding-created-by-lead-conversion-is-born-in-an-editable.md
A	docs/qa/scenarios/QA-ONBOARD-003-commercial-bootstrap-runs-end-to-end-from-lead-to-provisione.md
A	docs/qa/scenarios/QA-ONBOARD-004-the-commercial-onboarding-journey-completes-in-a-real-browser.md
A	docs/qa/scenarios/QA-PARTNER-001-partner-onboarding-review-follows-a-state-machine-not-a-sett.md
A	docs/qa/scenarios/QA-PARTNER-002-a-live-partner-cannot-be-demoted-through-the-generic-update-.md
A	docs/qa/scenarios/QA-PARTNER-003-partner-enquiry-acquisition-records-a-distinguishable-partne.md
A	docs/qa/scenarios/QA-PARTNER-004-the-partner-journey-completes-in-a-real-browser.md
A	docs/qa/scenarios/QA-PAY-001-payroll-operations-privileges-are-separated-from-employee-re.md
A	docs/qa/scenarios/QA-PAY-002-compensation-formulas-evaluate-deterministically.md
A	docs/qa/scenarios/QA-PAY-003-an-outstanding-loan-deducts-exactly-once-per-run.md
A	docs/qa/scenarios/QA-PAY-004-period-generation-respects-boundaries-without-timezone-drift.md
A	docs/qa/scenarios/QA-PAY-005-payslip-notifications-reach-only-the-payslip-s-owner.md
A	docs/qa/scenarios/QA-PAY-006-an-employee-payslip-proxy-never-returns-the-caller-s-own-rec.md
A	docs/qa/scenarios/QA-PROV-001-a-tenant-that-failed-provisioning-can-be-retried.md
A	docs/qa/scenarios/QA-PROV-002-provisioning-is-safe-to-submit-twice.md
A	docs/qa/scenarios/QA-PROV-003-issued-tenant-hostnames-honour-the-configured-base-domain.md
A	docs/qa/scenarios/QA-PROV-004-a-tenant-failing-before-identities-and-billing-is-still-reco.md
A	docs/qa/scenarios/QA-RUNTIME-001-every-declared-runtime-module-has-a-route-that-renders-it.md
A	docs/qa/scenarios/QA-RUNTIME-002-entity-scope-resolution-never-falls-back-to-unscoped.md
A	docs/qa/scenarios/QA-RUNTIME-003-the-entity-query-validator-rejects-filters-it-cannot-safely-.md
A	docs/qa/scenarios/QA-RUNTIME-004-governed-reasons-are-collected-through-the-design-system-nev.md
A	docs/qa/scenarios/QA-RUNTIME-005-a-runtime-module-renders-in-a-real-browser-for-each-access-l.md
A	docs/qa/scenarios/QA-TENANT-001-the-two-tenant-isolation-pattern-scoped-read-and-scoped-writ.md
A	docs/qa/scenarios/QA-TENANT-002-a-support-role-cannot-read-another-tenant-s-error-logs.md
A	docs/qa/scenarios/QA-TENANT-003-attendance-integration-credentials-never-cross-a-tenant-boun.md
A	docs/qa/scenarios/QA-TENANT-004-workspace-domain-resolution-cannot-be-pointed-at-another-ten.md
A	docs/qa/scenarios/QA-TENANT-005-tenant-erasure-removes-rows-in-dependency-order-and-leaves-n.md
A	docs/qa/scenarios/index.md
A	docs/qa/test-plans/PLAN-001-authentication.md
A	docs/qa/test-plans/PLAN-002-authorization.md
A	docs/qa/test-plans/PLAN-003-tenant-isolation.md
A	docs/qa/test-plans/PLAN-004-commercial-onboarding.md
A	docs/qa/test-plans/PLAN-005-lead-management.md
A	docs/qa/test-plans/PLAN-006-partner-lifecycle.md
A	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
A	docs/qa/test-plans/PLAN-008-agent-desktop.md
A	docs/qa/test-plans/PLAN-009-attendance.md
A	docs/qa/test-plans/PLAN-010-payroll.md
A	docs/qa/test-plans/PLAN-011-runtime-modules.md
A	docs/qa/test-plans/PLAN-012-deployment-release.md
A	docs/qa/test-plans/index.md
A	docs/sessions/README.md
A	docs/sessions/SESSION-0001-autonomous-framework-v2-multi-session-develop-integration-pe.md
A	docs/sessions/SESSION-0002-final-framework-remediation-and-ci-debt.md
A	docs/sessions/active.md
A	docs/sessions/completed.md
A	docs/sessions/index.md
A	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
M	docs/tasks/blocked.md
M	docs/tasks/index.md
M	e2e/tests/flow-b-partner-journey.spec.ts
M	package.json
A	scripts/allocate-id.mjs
A	scripts/backlog-review.mjs
M	scripts/generate-dashboards.mjs
A	scripts/lib/agent-state.mjs
M	scripts/lib/backlog-records.mjs
A	scripts/lib/id-allocator.mjs
A	scripts/lib/obsidian-config.mjs
M	scripts/lib/obsidian-mappings.mjs
A	scripts/lib/qa-records.mjs
A	scripts/lib/session-records.mjs
A	scripts/lib/session-registry.mjs
M	scripts/lib/task-records.mjs
A	scripts/new-qa-scenario.mjs
A	scripts/new-test-plan.mjs
A	scripts/qa-select.mjs
A	scripts/rebuild-qa.mjs
A	scripts/rebuild-sessions.mjs
M	scripts/repo-health.mjs
M	scripts/retrieve-knowledge.mjs
A	scripts/session.mjs
M	scripts/sync-obsidian.mjs
M	scripts/validate-framework.mjs
A	scripts/verify-branch-policy.mjs
A	services/api/src/modules/approvals/approvals.scope.spec.ts
M	services/api/src/modules/approvals/approvals.service.ts
A	services/api/src/modules/attendance/attendance.correction-authorization.spec.ts
M	services/api/src/modules/attendance/attendance.service.ts
M	services/api/src/modules/auth/auth.service.spec.ts
M	services/api/src/modules/contracts/contracts.agreement-immutability.spec.ts
A	services/api/src/modules/employees/employee-compensation-access.spec.ts
M	services/api/src/modules/employees/employee-profiles.service.ts
M	services/api/src/modules/error-logs/error-logs.service.spec.ts
M	services/api/src/modules/error-logs/error-logs.service.ts
M	services/api/src/modules/organization/business-units.controller.ts
A	services/api/src/modules/organization/organization-structure-authorization.spec.ts
A	services/api/src/modules/organization/organization-structure-tenant-scope.spec.ts
M	services/api/src/modules/organization/organizations.controller.ts
M	services/api/src/modules/partner-experience/dto/partner-experience.dto.ts
M	services/api/src/modules/super-admin/plan-read-path-purity.spec.ts
A	services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts
M	services/api/src/modules/tenant-settings/tenant-settings.controller.ts
M	services/api/test/commercial-bootstrap.e2e-spec.ts
```

## Conflicts

**None.** `origin/develop` was an ancestor of this branch throughout, so the
integration was a fast-forward. `origin/main` did not move during the task.

Six commits were cherry-picked from the unmerged `agent/authz-*` branches and
every one applied without conflict, which is itself worth recording: those
branches were cut three days earlier and the files they touch — controllers,
guards and specs — had not been edited since.

## Conflict Resolutions

Not applicable — no conflict arose.

One resolution decision is worth recording anyway, because it was not mechanical:
**`REG-003` named its two regression tests by bare filename** where every other
entry in the register uses a repo-relative path. Both tests existed, so the entry
was not wrong about reality — only about how to find it.

Correcting the reference rather than the check was the right way round. The check
is what caught five genuinely absent tests; loosening it to accept bare filenames
would have blinded it to exactly the case it exists for.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-17-framework-remediation-e6a173d.md`](../../qa/runs/2026-08-17-framework-remediation-e6a173d.md) — `PASS` |
| **Bug IDs** | `BUG-0048` created and closed. `BUG-0001`–`BUG-0007` re-verified and closed against the integration branch. `BUG-0047` closed — both halves landed |
| **Backlog Items** | `ITEM-0040` closed (develop protection applied), `ITEM-0041` closed (ruleset removed). `ITEM-0042` and `ITEM-0043` created for the two remaining CI debts |

## CI

| | |
|---|---|
| **CI Run ID** | `32008161370` on `e6a173d` — all 14 jobs green |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `e6a173d` after the fast-forward — the same tree CI validated:

```
node scripts/validate-framework.mjs           1080 checks, 0 failures
node scripts/rebuild-backlog.mjs --check      91 records, 0 structural errors
node scripts/rebuild-qa.mjs --check           12 plans, 58 scenarios
node scripts/rebuild-sessions.mjs --check     2 records
node scripts/generate-dashboards.mjs --check  current
node scripts/backlog-review.mjs --untriaged   0 TRIAGE_REQUIRED
node scripts/repo-health.mjs --main-baseline b90f33e --task-sha e6a173d   PASS
```

`MAIN_CHANGE_STATUS = UNTOUCHED`, `DEVELOP_SYNC_STATUS = SYNCED`,
`DEVELOP_CONTAINS_MAIN = PASS`.

## Release / Deployment Impact

**None — not deployed, and `main` untouched.** Rollback class `CODE_ONLY`: the
product change is two lines (a landing form field and a DTO transform), with no
schema, migration or configuration change.

Two platform changes were made and both are outside Git, so they are recorded
here rather than in a diff:

- `develop` branch protection **applied** — no PR required, no approvals, no
  force pushes, no deletions, `enforce_admins: true`. Verified by GET, not by
  the write's response.
- The repository ruleset "No push" (`15523234`) **removed**. Its ref condition
  was the literal string `refs/heads/"main", "develop"`, so it matched no branch
  and enforced nothing while appearing active. Its full definition is captured at
  `docs/development/removed-ruleset-15523234.json` before deletion.

Deployment observability: `/api/health` exposes `commit`, so `DEPLOYED_SHA` is
readable **in principle**. No environment is reachable from here —
`api.dijipeople.com` and `www.dijipeople.com` both answer HTTP 000 — so
`DEPLOYMENT_DRIFT_STATUS` stays `UNKNOWN`. The blocker has moved from "the system
does not expose it" (`ITEM-0010`, closed) to "no environment is reachable".

## Knowledge Capture

No new `docs/knowledge/` file. The durable lessons landed as **executable
checks** rather than prose, which is the stronger form:

| Lesson | Where it now lives |
|---|---|
| A report-only job holds nothing still — it only stops anyone noticing growth | `validate-framework.mjs`: a report-only job must state a promotion path. The API lint baseline grew 2 → 15 while nobody read it |
| A verifier that cries wolf gets skipped | Vault verification resolves `aliases:` and ignores code spans — it was reporting 300+ phantom failures |
| Config that lives in one worktree is invisible to every other | `obsidian-config.mjs` resolution order, plus a simulation that a placeholder never counts as configured |
| `@IsOptional()` does not skip `""` | `BUG-0048`, and a DTO transform on the public endpoint |

`.agent/context/qa-persistence.md` and the four affected test plans were updated
where they asserted things that had become false.

## Obsidian Sync

**`OBSIDIAN_SYNC_STATUS = PASS`** — the first time this framework has actually
published, rather than reporting `SKIPPED_NO_LOCAL_CONFIG`.

`OBSIDIAN_CONFIG_STATUS = FOUND_PRIMARY` — resolved from
`D:/My Work/hrm-dijipeople/DijiPeople/.obsidian-sync.local.json` while running in
a task worktree that has no config of its own. That resolution is the fix; the
vault was configured all along.

`OBSIDIAN_VAULT_PATH = D:/My Work/hrm-dijipeople/DijiPeople-Vault`.
105 notes written, 20 mapped folders, and verification read back
**294 notes / 1419 wikilinks / 0 unresolved**. Manual notes untouched — the sync
writes only into mapped agent-owned folders.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-remediation` removed and the
local branch deleted after `origin/develop` was confirmed to contain the work.
`SESSION-0002` released its `permissions` lease and left the merge queue.

Two tracked `.tmp-*.log` files from 2026-04-11 — a UTF-16 npm ENOENT capture —
were deleted and `.tmp-*.log` added to `.gitignore`; `*.tmp` never matched them.
`uat-out`, `uat-out-prod` and `uat-runtime-tests` (~100 MB) are untracked and
already gitignored, so they are local disk rather than repository clutter, and
they belong to another session's runs — classified `EXPECTED_IGNORED` and left
alone.
