# Engineering History — Framework autonomous v2

| | |
|---|---|
| **Task Title** | Framework autonomous v2 |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-16 |
| **Architect Plan** | TODO — path to the ExecPlan, or NOT_APPLICABLE with a reason |
| **Agents Used** | TODO — and which were deliberately not used |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/framework-autonomous-v2` |
| **Base SHA** | `b90f33e00c3845439797b51ef1ceb3ed7820a620` |
| **Final Task SHA** | `da018c43c175608fd6c0cc7223c2f01b2bb7e133` |
| **Target Branch** | `main` |
| **Merge Commit** | TODO — filled after the merge |
| **Final Target SHA** | TODO — filled after the target is pushed |

### Commits

```
d992088 feat(framework): autonomous framework v2 — sessions, develop integration, persistent QA
da018c4 merge origin/main: regenerate indexes, correct browser-tooling claims
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople               b90f33e [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0  7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs          b90f33e [agent/final-parent-implementation]
D:/My Work/hrm-dijipeople/dijipeople-framework     da018c4 [agent/framework-autonomous-v2]
```

### Files Changed

136 file(s) against `origin/main`.

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
M	AGENTS.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0040-develop-branch-protection-is-not-applied.md
A	docs/backlog/items/ITEM-0041-repository-ruleset-no-push-matches-no-branch-and-is-inert.md
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
M	docs/development/branch-protection.md
A	docs/development/develop-protection.json
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
A	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
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
A	docs/sessions/active.md
A	docs/sessions/completed.md
A	docs/sessions/index.md
A	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	package.json
A	scripts/allocate-id.mjs
A	scripts/backlog-review.mjs
M	scripts/generate-dashboards.mjs
A	scripts/lib/agent-state.mjs
M	scripts/lib/backlog-records.mjs
A	scripts/lib/id-allocator.mjs
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
```

## Conflicts

TODO — Integrator. For each conflict: the files, the type from the nine-type
taxonomy in [`.agent/agents/integrator.md`](../../../.agent/agents/integrator.md),
and what each side intended.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

TODO — Integrator. For each conflict above: what was chosen, and **what would
have been lost by choosing the other side**. This is the field a script cannot
fill and the reason this record is prose.

## QA

| | |
|---|---|
| **QA Report** | TODO — `docs/qa/runs/…` and the verdict |
| **Bug IDs** | TODO — `BUG-nnnn` records created or closed by this task |
| **Backlog Items** | TODO — `ITEM-nnnn` records created, advanced or closed |

## CI

| | |
|---|---|
| **CI Run ID** | TODO — the run whose `CI required gate` verdict authorised the merge |
| **CI Result** | TODO — PASS / FAILED / PENDING / BLOCKED_BY_ACCESS / UNAVAILABLE |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

TODO — QA. The commands actually run against the **merged** SHA, and their
results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

TODO — Release/DevOps. Whether this reaches an environment, the rollback class,
and the release record if one exists. `None — not deployed.` is a complete
answer.

## Knowledge Capture

TODO — which `docs/knowledge/` files were written or updated, and their
categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

TODO — whether `node scripts/sync-obsidian.mjs` ran, and which `Generated/`
folders changed.

## Cleanup

TODO — worktree removed, local branch deleted, or the reason neither was.
