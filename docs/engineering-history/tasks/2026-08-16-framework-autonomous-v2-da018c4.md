# Engineering History — Framework autonomous v2

| | |
|---|---|
| **Task Title** | Framework autonomous v2 |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-16 |
| **Architect Plan** | [`docs/tasks/TASK-0004`](../../tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md) — parent record with 11 work packages and a 5-row assumption register |
| **Agents Used** | Architect, QA, Reviewer, Integrator, Release/DevOps. **Not used:** Backend/API, Frontend, UI/UX, Database, Integration — a FRAMEWORK task changes `.agent/`, `scripts/` and `docs/` and touches no product code, no schema and no UI |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/framework-autonomous-v2` |
| **Base SHA** | `b90f33e00c3845439797b51ef1ceb3ed7820a620` |
| **Final Task SHA** | `da018c43c175608fd6c0cc7223c2f01b2bb7e133` |
| **Target Branch** | `develop` — this task is what makes that the default; `main` is untouched |
| **Merge Commit** | NOT_APPLICABLE — integrated by fast-forward, not a merge commit. `develop` was created at this task's tip: the first commit after it, `9e437fae2c995d918ab06650732f27f25feff1d9`, has `da018c4` as its sole parent. |
| **Final Target SHA** | `08a04b3e9468385851249ead23176aec6e7187ef` — `develop` at task close, "chore: close SESSION-0001 and finalize TASK-0004" |

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

`origin/main` advanced **twice** while this task was open, from a concurrently
running session: `714632d → c179ea3 → b90f33e` (PRs #30 and #31). The second
advance was merged into the task branch; four files conflicted.

| Files | Type | What each side intended |
|---|---|---|
| `docs/backlog/index.md`, `docs/tasks/index.md`, `docs/tasks/active.md`, `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | **TYPE 7 — generated file** | Both sides added records and regenerated. `main` added `ITEM-0038`, `ITEM-0039`, `BUG-0039`, `BUG-0040`; this branch added `BUG-0047`, `ITEM-0040`, `ITEM-0041`, `TASK-0004`, `SESSION-0001` and reopened `BUG-0001`–`BUG-0007`. |

`docs/qa/regressions/index.md` auto-merged: `main` appended new entries while
this branch flipped `Active` on six existing ones, and the edits did not overlap.

**No id collided.** `main` took `BUG-0039/0040` and `ITEM-0038/0039`; this branch
took `BUG-0047` and `ITEM-0040/0041`. That is the first time two concurrent
branches in this repository have not collided, and it is the direct effect of the
allocator landed here — the previous two attempts both required renumbering.

## Conflict Resolutions

**All four resolved by regenerating from the records, not by hand-merging.**

```bash
node scripts/rebuild-backlog.mjs
node scripts/rebuild-tasks.mjs
node scripts/rebuild-sessions.mjs
node scripts/rebuild-qa.mjs
node scripts/generate-dashboards.mjs
```

*What choosing either side would have lost:* taking `--ours` would have dropped
`ITEM-0038`, `ITEM-0039`, `BUG-0039` and `BUG-0040` from every index while the
record files themselves remained — the indexes would then have disagreed with
their own inputs, and `--check` in CI would have caught it, but only after the
merge. Taking `--theirs` would have dropped this branch's five new records the
same way. Hand-merging the hunks would have produced an index that matched
neither generator's output and drifted on the next rebuild.

A generated file has exactly one correct resolution: run the generator. This is
the case the nine-type taxonomy calls TYPE 7, and it is why generated indexes are
worth having a rule for at all.

### A second, non-Git conflict: the merge falsified four documents

`main` brought a Playwright `e2e` workspace with two journey specs. Four test
plans, one scenario and `.agent/agents/qa.md` all asserted that **no browser
automation exists in any workspace** — true when written that morning, false by
the time the branch merged.

Corrected against the code per the Staleness Rule, and two scenarios added for
the journeys that now genuinely have browser coverage (`QA-ONBOARD-004`,
`QA-PARTNER-004`). Where the tooling now exists but no spec does,
`AUTOMATION_STATUS` is `MANUAL` rather than `BLOCKED_INFRASTRUCTURE` — an
unwritten test and absent tooling are different facts, and the coverage matrix is
read as evidence of which.

This is the `doc-code-drift` pattern arriving through a merge rather than through
neglect, which is a shape worth recording: nobody edited those documents, and
they became wrong anyway.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-framework-autonomous-v2-f64ba4e.md`](../../qa/runs/2026-08-16-framework-autonomous-v2-f64ba4e.md) — `PASS_WITH_RISKS` |
| **Bug IDs** | `BUG-0047` created (CRITICAL). `BUG-0001`–`BUG-0007` **reopened** — they were `VERIFIED` against fixes that are not on the integration branch |
| **Backlog Items** | `ITEM-0040`, `ITEM-0041` created. `ITEM-0038` **closed** — the id allocator resolves it |

The task's own durable QA output is the twelve test plans and fifty-eight
scenarios under `docs/qa/`, which are the artefact rather than a by-product.

## CI

| | |
|---|---|
| **CI Run ID** | `31982441049` on `08a04b3` (`develop`). Earlier green runs on the same integration sequence: `31981397052` on `cc346b7`, `31981992386` on `c77933f`. |
| **CI Result** | **PASS** — `CI required gate` green on `08a04b3`. **With a stated gap:** no workflow run exists for `da018c4` itself, so the task tip was never independently verified; the first verdict covering this work is `cc346b7`, three commits later. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

> **Finalized 2026-08-17.** The gap recorded above is the honest reading of
> `gh run list --commit da018c43c175608fd6c0cc7223c2f01b2bb7e133`, which returns
> no runs. Because integration was a fast-forward rather than a PR merge, no
> pull-request event fired and the tip was never built on its own. This is
> precisely the case the rule under this table warns about, and it is left
> visible rather than smoothed over with a later SHA's green.

## Post-Merge Validation

Validation against the **merged** SHA, `08a04b3`:

| Check | Result | Evidence |
|---|---|---|
| `CI required gate` (all 11 required jobs) | PASS | run `31982441049`, `conclusion: success` |
| Preceding integration commits `cc346b7`, `c77933f` | PASS | runs `31981397052`, `31981992386` |

No local post-merge command log was captured at the time, and it cannot be
reconstructed after the fact — `LOCAL_POST_MERGE_EVIDENCE = NOT_RECOVERABLE`.
The CI verdict on the merged SHA is the whole of the post-merge evidence for
this task. Recording that plainly is the point; inventing a command log to fill
the row would be worse than the gap.

## Release / Deployment Impact

**None — not deployed, and `main` untouched.** Rollback class `CODE_ONLY`: the
task changes `.agent/`, `scripts/`, `docs/` and `.github/workflows/ci.yml` and
touches no product code, no schema and no runtime configuration.

`MAIN_CHANGE_STATUS = UNTOUCHED` against baseline `714632d` — the baseline
recorded when the branch was cut. `main` did advance twice during the task, from
a different session; that is visible in `MAIN_SYNC_STATUS`, and is the reason the
two fields are separate.

One deployment-relevant change: `develop` was fast-forwarded from `37a7142`
(2026-05-08, 201 commits behind) to the current shared baseline, so it is a
usable integration branch rather than an abandoned one. Lossless — `develop` had
zero unique commits and was a strict ancestor of `main`, verified with
`git merge-base --is-ancestor` before the push.

## Knowledge Capture

Four new context documents, which are the durable knowledge this task produced:

| Document | Category |
|---|---|
| [`.agent/context/multi-session.md`](../../../.agent/context/multi-session.md) | `ARCHITECTURE_RULE` — concurrency model, leases, id allocation |
| [`.agent/context/branch-model.md`](../../../.agent/context/branch-model.md) | `PROCESS_RULE` — develop integrates, main deploys |
| [`.agent/context/agent-handoffs.md`](../../../.agent/context/agent-handoffs.md) | `PROCESS_RULE` — handoff contract, required-agent matrix |
| [`.agent/context/qa-persistence.md`](../../../.agent/context/qa-persistence.md) | `PROCESS_RULE` — durable plans, scenarios, coverage |

Plus [`docs/development/git-ci-cost.md`](../../development/git-ci-cost.md), which measures what
the branch model changes rather than asserting it is faster.

The lesson worth carrying forward is in `BUG-0047`: **a record closed on
branch-level evidence is not closed.** Seven records read `VERIFIED` for two days
against fixes no integration branch had, two of them CRITICAL, and every derived
view reported protection that did not exist. The prevention is now two checks in
`validate-framework.mjs` rather than a paragraph asking people to be careful.

## Obsidian Sync

`SKIPPED_NO_LOCAL_CONFIG` — no `.obsidian-sync.local.json` exists in this
checkout, so no vault is reachable and nothing was published.

The outbound path was extended and is verifiable when a vault is configured:
`docs/sessions`, `docs/qa/test-plans` and `docs/qa/scenarios` are now mapped, the
Engineering Control Center publishes to `00 - Home/Generated/`, and
`node scripts/sync-obsidian.mjs --verify` reads the vault back — checking that
every expected note exists, carries substance, matches its source, and that every
generated wikilink resolves. **None of that was executed against a real vault
here**, and the validation covers the mechanism rather than any vault's contents.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-framework` and branch
`agent/framework-autonomous-v2` retained until the integration into `develop` is
verified by reading `origin/develop`. Session `SESSION-0001` released its
`framework` lease and left the merge queue on finish.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0001]] · [[BUG-0002]] · [[BUG-0003]] · [[BUG-0004]] · [[BUG-0005]] · [[BUG-0006]] · [[BUG-0007]] · [[BUG-0039]] · [[BUG-0040]] · [[BUG-0047]] · [[ITEM-0038]] · [[ITEM-0039]] · [[ITEM-0040]] · [[ITEM-0041]] · [[PLAN-001]] · [[PLAN-002]] · [[PLAN-003]] · [[PLAN-004]] · [[PLAN-005]] · [[PLAN-006]] · [[PLAN-007]] · [[PLAN-008]] · [[PLAN-009]] · [[PLAN-010]] · [[PLAN-011]] · [[PLAN-012]] · [[QA-AGENT-001]] · [[QA-AGENT-002]] · [[QA-AGENT-003]] · [[QA-ATT-001]] · [[QA-ATT-002]] · [[QA-ATT-003]] · [[QA-ATT-004]] · [[QA-ATT-005]] · [[QA-ATT-006]] · [[QA-AUTH-001]] · [[QA-AUTH-002]] · [[QA-AUTH-003]] · [[QA-AUTH-004]] · [[QA-AUTH-005]] · [[QA-AUTHZ-001]] · [[QA-AUTHZ-002]] · [[QA-AUTHZ-003]] · [[QA-AUTHZ-004]] · [[QA-AUTHZ-005]] · [[QA-AUTHZ-006]] · [[QA-DEPLOY-001]] · [[QA-DEPLOY-002]] · [[QA-DEPLOY-003]] · [[QA-DEPLOY-004]] · [[QA-DEPLOY-005]] · [[QA-LEAD-001]] · [[QA-LEAD-002]] · [[QA-LEAD-003]] · [[QA-LEAD-004]] · [[QA-LEAD-005]] · [[QA-ONBOARD-001]] · [[QA-ONBOARD-002]] · [[QA-ONBOARD-003]] · [[QA-ONBOARD-004]] · [[QA-PARTNER-001]] · [[QA-PARTNER-002]] · [[QA-PARTNER-003]] · [[QA-PARTNER-004]] · [[QA-PAY-001]] · [[QA-PAY-002]] · [[QA-PAY-003]] · [[QA-PAY-004]] · [[QA-PAY-005]] · [[QA-PAY-006]] · [[QA-PROV-001]] · [[QA-PROV-002]] · [[QA-PROV-003]] · [[QA-PROV-004]] · [[QA-RUNTIME-001]] · [[QA-RUNTIME-002]] · [[QA-RUNTIME-003]] · [[QA-RUNTIME-004]] · [[QA-RUNTIME-005]] · [[QA-TENANT-001]] · [[QA-TENANT-002]] · [[QA-TENANT-003]] · [[QA-TENANT-004]] · [[QA-TENANT-005]] · [[SESSION-0001]] · [[TASK-0004]]

<!-- GRAPH:END -->
