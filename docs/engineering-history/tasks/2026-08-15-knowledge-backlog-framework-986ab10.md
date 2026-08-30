# Engineering History — Operational knowledge-management layer

| | |
|---|---|
| **Task Title** | Operational knowledge-management layer |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-15 |
| **Architect Plan** | NOT_APPLICABLE — no ExecPlan. `PLANS.md` requires one for schema, auth, payroll, provisioning and integration changes; this task touched none of them. The audit in Part 1 of the request served the same purpose and is summarised in the final report. |
| **Agents Used** | Single-agent, all phases. Architect (audit, record design, triage), QA (evidence verification, seeding), Reviewer (self-review against the Security checklist), Integrator (branch, worktree, merge, this record). **Deliberately not used:** Backend/API, Frontend, Database, Integration, UI/UX and Release/DevOps — no product code, no schema and no deployment was touched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/knowledge-backlog-framework` |
| **Base SHA** | `3c759ce1c7de6f855b7dbfbf03c17cca4ee512c8` |
| **Final Task SHA** | `986ab10a14f9641c2160677ec87a0bd97beceac6` |
| **Target Branch** | `main` |
| **Merge Commit** | `827701eb5ed035c7cae1bf8bf88a55bfdc0d689d` — PR #2, merge commit |
| **Final Target SHA** | `827701eb5ed035c7cae1bf8bf88a55bfdc0d689d` at merge time. `origin/main` has since advanced to `ee9828b` (`41c24f5` tenant erasure fixes, pushed by the repository owner); this merge is an ancestor of it. |

### Commits

```
17d69a6 feat(framework): durable bug, backlog and engineering-history systems
53407a3 Merge remote-tracking branch 'origin/main' into agent/knowledge-backlog-framework
986ab10 docs(backlog): reduce ITEM-0003 after the DB-backed erasure suites landed
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                      3c759ce [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0         7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-knowledge-framework  986ab10 [agent/knowledge-backlog-framework]
```

### Files Changed

124 file(s) against `origin/main`.

```
M	.agent/agents/README.md
M	.agent/agents/architect.md
M	.agent/agents/backend-api.md
M	.agent/agents/database.md
M	.agent/agents/frontend.md
M	.agent/agents/integration.md
M	.agent/agents/integrator.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
M	.agent/agents/reviewer.md
M	.agent/agents/ui-ux.md
M	.agent/context/knowledge-architecture.md
M	.agent/context/task-completion-contract.md
M	.obsidian-sync.example.json
M	AGENTS.md
A	docs/backlog/README.md
A	docs/backlog/blocked.md
A	docs/backlog/completed.md
A	docs/backlog/deferred.md
A	docs/backlog/index.md
A	docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md
A	docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md
A	docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md
A	docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md
A	docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md
A	docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md
A	docs/backlog/items/ITEM-0007-should-duplicate-website-leads-be-deduplicated.md
A	docs/backlog/items/ITEM-0008-customeraccount-has-no-origin-channel.md
A	docs/backlog/items/ITEM-0009-no-observability-platform-exists.md
A	docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md
A	docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md
A	docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md
A	docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md
A	docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md
A	docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md
A	docs/backlog/open.md
A	docs/backlog/product-decisions.md
A	docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md
A	docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md
A	docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md
A	docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md
A	docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md
A	docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md
A	docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md
A	docs/bugs/BUG-0008-session-expired-sign-in-again-returned-405.md
A	docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md
A	docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md
A	docs/bugs/BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate.md
A	docs/bugs/BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable.md
A	docs/bugs/BUG-0013-public-lead-endpoint-had-no-rate-limiting.md
A	docs/bugs/BUG-0014-no-tenant-that-failed-provisioning-could-be-retried.md
A	docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md
A	docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md
A	docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md
A	docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md
A	docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md
A	docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md
A	docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md
A	docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md
A	docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md
A	docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md
A	docs/bugs/README.md
M	docs/deployment/release-history/README.md
M	docs/deployment/release-report-template.md
M	docs/development/agent-orchestration.md
M	docs/development/final-report-template.md
A	docs/engineering-history/README.md
A	docs/knowledge/architecture/agent-engineering-architecture.md
A	docs/knowledge/architecture/api-architecture.md
A	docs/knowledge/architecture/authentication.md
A	docs/knowledge/architecture/database-architecture.md
A	docs/knowledge/architecture/deployment-architecture.md
A	docs/knowledge/architecture/integration-architecture.md
A	docs/knowledge/architecture/multi-tenancy.md
A	docs/knowledge/architecture/qa-and-ci-architecture.md
A	docs/knowledge/architecture/rbac.md
A	docs/knowledge/architecture/runtime-module-system.md
A	docs/knowledge/architecture/system-architecture.md
A	docs/knowledge/architecture/tenant-workspace-routing.md
A	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
A	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
A	docs/knowledge/decisions/decision-a-bug-record-is-its-own-backlog-item.md
A	docs/knowledge/decisions/decision-ci-verdict-gates-shared-merges.md
A	docs/knowledge/decisions/decision-platform-admin-is-a-separate-identity.md
A	docs/knowledge/decisions/decision-tenantid-is-the-isolation-identity.md
A	docs/knowledge/modules/approvals.md
A	docs/knowledge/modules/attendance.md
A	docs/knowledge/modules/audit-and-events.md
A	docs/knowledge/modules/billing.md
A	docs/knowledge/modules/contracts-and-agreements.md
A	docs/knowledge/modules/customer-onboarding.md
A	docs/knowledge/modules/customers.md
A	docs/knowledge/modules/employees.md
A	docs/knowledge/modules/leads.md
A	docs/knowledge/modules/organization.md
A	docs/knowledge/modules/partner-onboarding.md
A	docs/knowledge/modules/partners.md
A	docs/knowledge/modules/payroll.md
A	docs/knowledge/modules/platform-admin.md
A	docs/knowledge/modules/settings.md
A	docs/knowledge/modules/tenant-application.md
A	docs/knowledge/modules/tenant-provisioning.md
A	docs/knowledge/product/commercial-onboarding-journey.md
A	docs/knowledge/product/dijipeople-platform-overview.md
A	docs/knowledge/product/employee-hr-platform.md
A	docs/knowledge/product/partner-program.md
A	docs/knowledge/product/product-areas.md
A	docs/knowledge/product/tenant-lifecycle.md
A	docs/knowledge/requirements/requirement-commercial-onboarding.md
A	docs/knowledge/requirements/requirement-lead-conversion.md
A	docs/knowledge/requirements/requirement-partner-onboarding.md
A	docs/knowledge/requirements/requirement-tenant-workspace-domains.md
M	docs/qa/README.md
M	package.json
A	scripts/generate-dashboards.mjs
A	scripts/lib/backlog-records.mjs
A	scripts/lib/obsidian-mappings.mjs
A	scripts/new-backlog-item.mjs
A	scripts/new-bug.mjs
A	scripts/new-engineering-history.mjs
A	scripts/rebuild-backlog.mjs
M	scripts/retrieve-knowledge.mjs
M	scripts/sync-obsidian.mjs
M	scripts/validate-framework.mjs
```

## Conflicts

**None.** `origin/main` advanced by one commit (`3c759ce`, "tenant fixes") while
this task was in progress. The merge was clean: that commit touched
`services/api/src/modules/tenant-control-plane/**`, `apps/admin/app/_components/tenants/**`
and two new e2e specs; this task touched only `.agent/`, `docs/`, `scripts/`,
`AGENTS.md`, `package.json` and `.obsidian-sync.example.json`. Disjoint file
sets, so no hunk overlapped.

## Conflict Resolutions

No textual conflict to resolve — but the merge produced a **semantic** one that
a clean `git merge` would not have surfaced, and it is worth recording because
it is the exact failure mode this framework exists to catch.

`3c759ce` added `services/api/test/tenant-erasure-order.e2e-spec.ts` and
`tenant-erasure-dry-run.e2e-spec.ts`, which resolve the original gap behind
`ITEM-0003` — "tenant erasure has never been exercised against a database".
That item had been seeded an hour earlier from the 2026-08-14 QA run, and was
already stale when it was written.

**Resolution:** the item was re-verified against the merged code and reduced in
scope rather than closed. The new suites prove the delete order (including the
payslip cascade that had made every tenant holding a payslip un-erasable) and
the dry run's non-destructiveness; neither asserts that erasing one tenant
leaves another intact. Severity HIGH → MEDIUM, priority P1 → P2, retitled, and
the acceptance criteria rewritten against `TENANT_ERASURE_DELETE_ORDER` so a
model added to the plan later is covered automatically. Commit `986ab10`.

**What closing it instead would have lost:** the cross-tenant survival
assertion — the single property that a missing `tenantId` predicate in a delete
walk across ~285 models would violate. **What leaving it untouched would have
lost:** the record's credibility, in the first place anyone looks.

## QA

| | |
|---|---|
| **QA Report** | NOT_REQUIRED — no runtime behaviour changed. This task added documentation, agent instructions and Node tooling; the tooling is covered by the behavioural checks inside `validate-framework.mjs` rather than by a QA run. |
| **Bug IDs** | `BUG-0001`…`BUG-0024` **seeded**, not found — imported from the regression register and three existing QA runs. None was discovered by this task. |
| **Backlog Items** | `ITEM-0001`…`ITEM-0015` seeded. `ITEM-0003` reduced in scope post-merge (see Conflict Resolutions). |

## CI

| | |
|---|---|
| **CI Run ID** | `31887909562` on `d016622` (pre-merge, authorised the merge) · `31888341970` on `827701e` (post-merge, on `main`) |
| **CI Result** | **PASS** — `CI required gate` succeeded on both. `Lint services/api` reported failure on both; it is a documented non-gating known baseline per `docs/development/ci.md`, and it also fails on the preceding commits on `main`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

To run against the merged SHA:

```bash
node scripts/validate-framework.mjs     # 503 checks, includes both --check gates
node scripts/rebuild-backlog.mjs --check
node scripts/generate-dashboards.mjs --check
```

`validate-framework.mjs` already invokes the latter two, so the first command is
sufficient; the other two are listed because a failure in either is reported
through a single aggregated check and the distinction matters when diagnosing.

Tests that passed on the task branch prove the branch, not the integrated
result — and this branch merged `origin/main` in, so the branch run was already
against the integrated tree. It was repeated on the merge commit regardless.

**Executed against `827701e`:**

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | PASS — 503 checks, 0 warnings |
| `node scripts/rebuild-backlog.mjs --check` | PASS — 39 records, 0 structural errors, indexes current |
| `node scripts/generate-dashboards.mjs --check` | PASS — dashboards current |
| `node scripts/retrieve-knowledge.mjs partner onboarding` | PASS — bug records rank above knowledge notes, no duplicated vault copies |
| Remote CI on `827701e` (run `31888341970`) | PASS — `CI required gate` green |

`npm run build`, `npm run typecheck` and the workspace test suites were not run
locally: no build input changed, and CI ran all of them on the merge commit.

## Release / Deployment Impact

**None — not deployed.** No runtime code, no schema, no configuration consumed
by a deployed process. Rollback class `CODE_ONLY` if it ever needed one.

It does change what Release/DevOps must **record**: release reports now carry
Backlog/Bug References, Engineering History and Health Checks sections, and
`docs/deployment/release-history/README.md` states that only real evidence may
populate an outcome.

## Knowledge Capture

43 notes under `docs/knowledge/`, all generated from verified repository
evidence:

| Category | Count | Location |
|---|---|---|
| ARCHITECTURE_CHANGE | 12 | `architecture/` |
| DOMAIN_RULE | 15 | `modules/` (13 new, 2 pre-existing) |
| PRODUCT | 6 | `product/` |
| REQUIREMENT | 4 | `requirements/`, labelled by source type |
| DECISION | 4 | `decisions/` |
| DASHBOARD | 2 | `dashboards/`, generated |

Modules with only a directory listing as evidence — timesheets, leave,
recruitment, projects, documents, policies — were **not** given notes. Writing
them would have been inventing knowledge, which the empty-note policy exists to
prevent.

## Obsidian Sync

**Ran after the merge**, per the ordering in the completion contract: knowledge
is captured from the code that landed, and Obsidian publishes what was captured.

`node scripts/sync-obsidian.mjs` → **103 written, 22 already current, 5 skipped
as empty**, 0 mappings without a source. The vault went from 52 notes to 148.
Manual notes were untouched — the script writes only into the mapped agent-owned
folders and reads nothing else.

The 5 skips were stub folder READMEs under `docs/knowledge/`, correctly withheld
by the empty-note policy.

Folders receiving content for the first time: `00 - Home/Generated`,
`00 - Home/Generated/Backlog`, `01 - Product/Generated`,
`02 - Architecture/Generated`, `04 - Requirements/Generated`,
`05 - Decisions/Generated`, `07 - Bugs/Generated`.

## Cleanup

Worktree `d:/My Work/hrm-dijipeople/dijipeople-knowledge-framework` created for
this task because the primary checkout was dirty with in-flight tenant-erasure
work that was not this task's — since committed by its owner as `3c759ce`.

Removed after the merge, verified clean first. The pre-existing worktree
`dijipeople-authz-batch0` was left alone.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0001]] · [[BUG-0002]] · [[BUG-0003]] · [[BUG-0004]] · [[BUG-0005]] · [[BUG-0006]] · [[BUG-0007]] · [[BUG-0008]] · [[BUG-0009]] · [[BUG-0010]] · [[BUG-0011]] · [[BUG-0012]] · [[BUG-0013]] · [[BUG-0014]] · [[BUG-0015]] · [[BUG-0016]] · [[BUG-0017]] · [[BUG-0018]] · [[BUG-0019]] · [[BUG-0020]] · [[BUG-0021]] · [[BUG-0022]] · [[BUG-0023]] · [[BUG-0024]] · [[ITEM-0001]] · [[ITEM-0002]] · [[ITEM-0003]] · [[ITEM-0004]] · [[ITEM-0005]] · [[ITEM-0006]] · [[ITEM-0007]] · [[ITEM-0008]] · [[ITEM-0009]] · [[ITEM-0010]] · [[ITEM-0011]] · [[ITEM-0012]] · [[ITEM-0013]] · [[ITEM-0014]] · [[ITEM-0015]]

<!-- GRAPH:END -->
