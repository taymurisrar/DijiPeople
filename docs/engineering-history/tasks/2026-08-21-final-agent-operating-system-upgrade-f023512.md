# Engineering History — Final agent operating system upgrade

| | |
|---|---|
| **Task Title** | Final agent operating system upgrade |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-21 |
| **Architect Plan** | NOT_APPLICABLE — no ExecPlan class was triggered. `PLANS.md` requires one for schema, migration, auth or payroll changes; this program touches none of them. The decomposition lives in [[TASK-0012]] and its sixteen package files |
| **Agents Used** | Architect, Product & Backlog Steward, Knowledge & Graph, QA, Reviewer, Integrator, Release/DevOps. **Deliberately not used:** Backend/API, Frontend, UI/UX, Database, Security, Integration — their role files changed, their implementation surface did not, and no product code is in scope |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/agent-operating-system` |
| **Base SHA** | `4226e53e7ac573ff605520177c0474b1669b939b` |
| **Final Task SHA** | `f0235124a1925bd675b69d468754a2056bead5b3` |
| **Target Branch** | `develop` |
| **Merge Commit** | None for the verified work — integrated by ref-push, so `develop` took the exact CI-verified SHA. A merge commit would be a commit CI never saw |
| **Final Target SHA** | `f0235124a1925bd675b69d468754a2056bead5b3` at integration. `develop` then advanced by one reconciliation merge, below |

### Commits

```
c0eafd6 Update package.json
0093f67 chore(session): register SESSION-0025 for the production heap-cap deploy
e014991 Merge pull request #36 from taymurisrar/agent/api-heap-cap-deploy
fc54987 feat(framework): durable work-package state and the continuation pointer
a42fdf5 merge: reconcile origin/main into the task branch so develop regains containment
dc0f524 feat(framework): two permanent roles, the question protocol, and four subsystems
01e1c24 feat(framework): the Obsidian node contract, and evidence that expires correctly
0fac4cd feat(framework): role ownership, the evidence hierarchy, and 23 executing simulations
f023512 feat(framework): the Control Center, the Reviewer, and the completion contract
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            e014991 [main]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   f023512 [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-heap-cap                   0093f67 [agent/api-heap-cap-deploy]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa738 [agent/go-live-readiness]
```

### Files Changed

87 file(s) against `origin/develop`.

```
M	.agent/agents/architect.md
M	.agent/agents/backend-api.md
M	.agent/agents/database.md
M	.agent/agents/frontend.md
M	.agent/agents/integration.md
M	.agent/agents/integrator.md
A	.agent/agents/knowledge-graph.md
A	.agent/agents/product-backlog-steward.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
M	.agent/agents/reviewer.md
M	.agent/agents/security.md
M	.agent/agents/ui-ux.md
M	.agent/context/README.md
M	.agent/context/agent-handoffs.md
A	.agent/context/agent-health.md
A	.agent/context/context-budget.md
A	.agent/context/failure-adaptation.md
A	.agent/context/question-protocol.md
A	.agent/context/research-mode.md
M	.agent/context/task-completion-contract.md
A	.agent/context/test-resource-policy.md
M	AGENTS.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0073-agent-role-names-are-spelled-inconsistently-across-bug-and-t.md
A	docs/evidence/README.md
A	docs/evidence/ledger.json
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/reconciliation-2026-08-21.md
A	docs/questions/README.md
A	docs/questions/index.md
A	docs/questions/open.md
A	docs/sessions/SESSION-0025-deploy-api-heap-cap-change-to-production.md
A	docs/sessions/SESSION-0026-final-agent-operating-system-upgrade.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
M	docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md
M	docs/tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md
M	docs/tasks/TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-.md
M	docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
M	docs/tasks/TASK-0010-go-live-readiness.md
M	docs/tasks/TASK-0011-first-production-release.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-01-framework-reconciliation-and-gap-register.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-02-question-escalation-protocol-and-decision-memory.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-03-product-and-backlog-steward.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-04-knowledge-and-graph-agent.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-05-large-task-persistence-and-context-budget.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-06-evidence-cache-and-invalidation.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-07-test-resource-lifecycle-and-cleanup-registry.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-08-agent-role-enhancements.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-09-failure-adaptation-and-research-mode.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-10-agent-health-and-improvement-budget.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-11-control-center-expansion.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-12-behavioural-simulations.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-13-semantic-validation-and-evidence-hierarchy.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-14-reviewer-and-completion-contract.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-15-exact-sha-ci-and-develop-integration.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-16-obsidian-projection-and-cleanup.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
A	scripts/agent-health.mjs
M	scripts/backlog-review.mjs
A	scripts/check-work-packages.mjs
A	scripts/evidence.mjs
M	scripts/generate-dashboards.mjs
M	scripts/lib/backlog-records.mjs
A	scripts/lib/evidence-ledger.mjs
M	scripts/lib/id-allocator.mjs
M	scripts/lib/obsidian-mappings.mjs
A	scripts/lib/obsidian-node.mjs
M	scripts/lib/qa-records.mjs
A	scripts/lib/question-records.mjs
M	scripts/lib/task-records.mjs
A	scripts/lib/test-resources.mjs
A	scripts/lib/work-package-records.mjs
A	scripts/new-question.mjs
A	scripts/rebuild-questions.mjs
M	scripts/retrieve-knowledge.mjs
M	scripts/sync-obsidian.mjs
M	scripts/validate-framework.mjs
M	services/api/package.json
```

## Conflicts

Two, both reconciliations of the same moving target rather than collisions
with the framework changes. Nothing in this program conflicted with anything.

**First**, before CI. SESSION-0025 deployed the API heap cap to production
mid-program, leaving `origin/develop` three commits behind `origin/main`.
`origin/main` was merged into the task branch at `a42fdf5`. Three files
conflicted, all generated: `docs/sessions/active.md`, `docs/sessions/index.md`
and the Engineering Control Center.

**Second**, after integration. SESSION-0025 landed PR #37 — heap cap 320 to
1536 MB — between this program’s CI verdict and its ref-push, so `develop`
was behind production again the moment it caught up. Merged at `7c82cf5`; the
same three generated files conflicted.

## Conflict Resolutions

Regenerated, never hand-merged. Either side was taken and
`rebuild-sessions.mjs` and `generate-dashboards.mjs` were re-run.

A hand-merged index is a file that agrees with neither branch, and it passes
review precisely because it looks plausible.

The first merge commit was also separated from the in-progress work: the
feature files were unstaged so it carries only the reconciliation and the
regenerated indexes. A merge commit containing new feature work hides the diff
a reviewer needs to see.

**What would have gone wrong without care:** taking "ours" on the session
indexes would have silently dropped SESSION-0025 from the active list, so the
Control Center would have under-reported concurrent sessions — and the
database single-writer count with it.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record — this program ships no product behaviour to exercise. QA evidence is the framework suite itself: 3,078 checks, of which 23 simulations are new and each was observed to fail under mutation |
| **Bug IDs** | None created or closed. No product defect was in scope |
| **Backlog Items** | ITEM-0073 created — agent role names spelled six ways across the record tree. Disposed `DEFER`, owned by product-backlog-steward |

## CI

| | |
|---|---|
| **CI Run ID** | [32454788133](https://github.com/taymurisrar/DijiPeople/actions/runs/32454788133) — `CI required gate` at `f023512`, all 14 jobs green |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Re-run against the integrated SHA, in the task worktree whose tip is identical
to `develop`:

```
node scripts/validate-framework.mjs        3,084 checks, 0 failures
node scripts/rebuild-backlog.mjs --check   156 records, 0 structural errors
node scripts/rebuild-tasks.mjs --check     12 tasks
node scripts/rebuild-qa.mjs --check        19 plans, 113 scenarios
node scripts/rebuild-sessions.mjs --check  valid, indexes current
node scripts/rebuild-questions.mjs --check valid, indexes current
node scripts/check-work-packages.mjs       12 tasks, 16 package files
node scripts/sync-obsidian.mjs --verify    OBSIDIAN_SYNC_STATUS = PASS
```

Ref-push means the integrated tip and the verified tip are the same commit, so
this is a re-run rather than a validation of something new — which is the
reason for integrating that way.

## Release / Deployment Impact

None. This program changes the agent framework — role definitions, record
libraries, validators and generated documentation. It adds no runtime surface,
no route, no migration and no environment variable.

`DEPLOYMENT_REQUIRED = no`. Rollback class: revert the commit range on
`develop`; nothing is deployed and no state is migrated.

## Knowledge Capture

- `docs/knowledge/framework/reconciliation-2026-08-21.md` — the WP-01 gap
  register: every one of the brief's sixty-five sections marked PRESENT, PARTIAL
  or ABSENT, with the file that provides it, re-derived at `4226e53`.
- `.agent/context/question-protocol.md`, `context-budget.md`,
  `failure-adaptation.md`, `research-mode.md`, `test-resource-policy.md`,
  `agent-health.md` — six new cross-role invariants.
- `.agent/agents/product-backlog-steward.md`, `knowledge-graph.md` — two new
  permanent roles; the other eleven extended.
- `docs/evidence/README.md` — why invalidation is by content and never by age.
- ITEM-0073 — role names are spelled six ways across the record tree, which was
  splitting single roles in half in every derived signal.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran against the configured vault at
`D:/My Work/hrm-dijipeople/DijiPeople-Vault`, then `--verify` read it back.
Not the exit code — the files.

Every count is zero:

```
OBSIDIAN_SYNC_STATUS          PASS
OBSIDIAN_REPO_TO_VAULT_DIFFS  0     OBSIDIAN_VAULT_TO_REPO_DIFFS  0
OBSIDIAN_PARITY_DIFFS         0     OBSIDIAN_MISSING_PROVENANCE   0
OBSIDIAN_PATH_MISMATCHES      0     OBSIDIAN_NODE_TYPE_MISMATCHES 0
OBSIDIAN_STATUS_MISMATCHES    0     OBSIDIAN_SEMANTIC_LINK_ERRORS 0
OBSIDIAN_SOURCE_ORPHANS       0     OBSIDIAN_GRAPH_ORPHANS        0
OBSIDIAN_DUPLICATE_NODES      0     OBSIDIAN_STALE_NODES          0
OBSIDIAN_UNRESOLVED_LINKS     0     OBSIDIAN_GRAPH_NODES        511
```

Four of those started non-zero and each was a defect worth the trip:

- **607 semantic link errors** — the relationship grammar had been written as an
  allow-list, and reading the failures showed almost every one was a *good* link.
  The grammar was describing its author's guess, not the graph. Replaced with the
  rule that is defensible: knowledge may link to knowledge, and nothing may link
  into a generated listing surface.
- **53 duplicate nodes**, then 29 — first every folder `README`, because
  `source_id` falls back to the filename and every mapping has one; then all
  sixteen work packages, because `deriveSourceId` read `TASK_ID` before
  `WP_ID` so each package claimed its parent's identity. Duplicate detection is
  now scoped to allocated ids, and a work package uses the composite
  `TASK-0012-WP-01`.
- **2 status mismatches** — `readKey` used `\s*` after the colon, which is
  greedy across newlines, so a key with an empty value captured the *next* line.
  A note read its status as `last_verified: 2026-08-17`. Same defect family as
  the section parsers, fixed the same way.
- **17 graph orphans** — the sixteen work packages and the reconciliation note.
  Fixed by declaring the relationship each already had (`[[TASK-0012]]`), never
  by adding a link to remove a dot.

**5 unresolved links** were also real. Four were `REG-075` hand-written in
BUG-0080 and ITEM-0071: REG ids are sections inside the regression register, not
notes, and the framework already forbids linking them — the generated output had
been careful, the prose had not. The fifth was the Control Center linking to
SESSION-0023, a 103-word stub the empty-note policy correctly skips. Fixed in the
dashboard generator, which now degrades to plain text rather than emitting a
wikilink to a note that will never exist. Editing another session's record to
make a link resolve would have been reaching into work that is not this one's.

## Cleanup

Recorded in the WP-16 package file. The task worktree
`D:/My Work/hrm-dijipeople/dijipeople-agent-os` is separate from the user's
primary checkout, which was CLEAN at session start and is not written by this
task.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0080]] · [[ITEM-0071]] · [[ITEM-0073]] · [[SESSION-0023]] · [[SESSION-0025]] · [[SESSION-0026]] · [[TASK-0004]] · [[TASK-0005]] · [[TASK-0007]] · [[TASK-0008]] · [[TASK-0009]] · [[TASK-0010]] · [[TASK-0011]] · [[TASK-0012]]

<!-- GRAPH:END -->
