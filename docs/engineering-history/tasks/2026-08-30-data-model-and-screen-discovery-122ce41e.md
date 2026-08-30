# Engineering History — Data model and screen discovery

| | |
|---|---|
| **Task Title** | Data model and screen discovery |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-30 |
| **Architect Plan** | NOT_APPLICABLE — no change class in `PLANS.md` applies. No schema, migration, permission or API contract change; the repository change is documentation plus two generators and two CI steps. |
| **Agents Used** | Architect, Knowledge & Graph, Database (schema **reading** only — `SCHEMA_WRITE: NO`), QA (read-only production navigation), Integrator. Backend/API and Frontend deliberately not used: nothing under `services/api/src` or `apps/*` was modified. Security not used — the one security-shaped observation (BUG-2384) is a labelling defect on an operator screen, not an authorization change. Release/DevOps not used: this integrates to `develop` only. |

## Git

| | |
|---|---|
| **Base Branch** | `2a1a1e06` |
| **Task Branch** | `agent/data-model-discovery` |
| **Base SHA** | `2a1a1e0649739bf47d89cb9507dbf7d23b718f4e` |
| **Final Task SHA** | `122ce41e6364498f1464cddf3f145f8f0727fa81` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `git push origin HEAD:develop` moved `develop` 2a1a1e06..122ce41e, so the integrated tip is byte-identical to the CI-verified SHA. |
| **Final Target SHA** | `122ce41e6364498f1464cddf3f145f8f0727fa81` (`origin/develop`) |

### Commits

```
87cc56c0 docs(knowledge): the data model, and a generator that keeps it true
06d7c849 docs(knowledge): the screen map, verified against production
fac61b86 docs(knowledge): correct the bespoke-screen count in discovery status
122ce41e fix(knowledge): compare generated regions by content, not bytes
b1c0c481 docs(history): data model and screen discovery, start to finish
1af0909f docs(records): close the graph, and find why EXECPLAN-0028 exists twice
dc7af467 docs(graph): link the sessions, QA runs and history records that floated free
```

The last three landed after the first integration. `develop` was moved to
`122ce41e` once its gate passed, and the closure, reconciliation and graph work
followed as separate verified SHAs rather than being held back to make one
tidier commit — a verdict is about the code it ran on, and batching would have
meant the first four sat unintegrated while the graph work was written.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-datamodel                  122ce41e [agent/data-model-discovery]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

41 file(s) against `2a1a1e06`.

```
M	.github/workflows/ci.yml
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/bugs/BUG-2384-tenant-record-shows-primary-tenant-owner-unassigned-while-it.md
M	docs/knowledge/README.md
A	docs/knowledge/architecture/screen-map.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/data-model/README.md
A	docs/knowledge/data-model/data-model-overview.md
A	docs/knowledge/data-model/domain-map.md
A	docs/knowledge/data-model/entity-attendance-day.md
A	docs/knowledge/data-model/entity-business-unit.md
A	docs/knowledge/data-model/entity-customer-account.md
A	docs/knowledge/data-model/entity-employee.md
A	docs/knowledge/data-model/entity-identity.md
A	docs/knowledge/data-model/entity-partner.md
A	docs/knowledge/data-model/entity-pay-component.md
A	docs/knowledge/data-model/entity-payroll-run.md
A	docs/knowledge/data-model/entity-role.md
A	docs/knowledge/data-model/entity-subscription.md
A	docs/knowledge/data-model/entity-tenant.md
A	docs/knowledge/data-model/entity-timesheet.md
A	docs/knowledge/data-model/entity-user.md
A	docs/knowledge/discovery/README.md
A	docs/knowledge/discovery/contradictions.md
A	docs/knowledge/discovery/discovery-status.md
A	docs/knowledge/discovery/known-gaps.md
A	docs/knowledge/discovery/pending-verification.md
A	docs/knowledge/product/glossary.md
A	docs/sessions/SESSION-0081-phase-2-schema-discovery-data-model-knowledge-graph-and-disc.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
A	scripts/generate-data-model.mjs
A	scripts/generate-screen-map.mjs
A	scripts/lib/data-model.mjs
M	scripts/lib/obsidian-mappings.mjs
M	scripts/validate-framework.mjs
```

## Conflicts

The branch was cut from `2007fad4` and `develop` advanced two commits
(BUG-2334, BUG-2335) while the work ran. The rebase onto `2a1a1e06` conflicted
in **four files, all generated indexes**:

| File | Type |
|---|---|
| `docs/sessions/index.md` | Generated index — both sides added a session row |
| `docs/backlog/index.md` | Generated index — their two bug records against my one |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | Generated dashboard |
| `docs/knowledge/dashboards/Engineering Control Center.md` | Generated dashboard |

No source file conflicted, and no hand-written record conflicted. Both sides
intended the same thing in every case: to have their own record appear in an
index that is regenerated from the records themselves.

## Conflict Resolutions

**Took `origin/develop`'s side wholesale on all four, then re-ran the
generators** — `rebuild-sessions`, `rebuild-backlog`, `generate-dashboards` and
`sync-remediation-inventory`.

Choosing either side's hunks by hand would have produced an index matching
neither branch: these files are derived from the record set, so the only correct
content is whatever the generator emits from the *combined* records. Merging the
conflict markers manually would have silently dropped either their two attendance
bug records or my one, and a generated index that disagrees with its own sources
is the failure the `--check` steps exist to catch — it would have surfaced as a
CI failure at best, and as a wrong dashboard count at worst.

Verified after resolution: `rebuild-backlog --check`, `rebuild-sessions --check`,
`generate-dashboards --check` and `remediation:check` all pass, and the backlog
totals include both sides' records (394 records, 279 bug / 115 item).

## QA

| | |
|---|---|
| **QA Report** | None — no `docs/qa/runs/` record. This was discovery, not a QA campaign: the browser work was read-only navigation to verify documentation claims, not scenario execution against acceptance criteria. Filing a run record for it would misrepresent what was tested. |
| **Bug IDs** | [[BUG-2384]] — created, triaged **DEFER**. The platform admin tenant record labels two different facts "Tenant Owner" and they contradict each other on screen. [[BUG-2413]] — created, triaged **PLAN_REQUIRED**. `allocate-id.mjs` issues `PLAN-` ids that ExecPlans already hold, because the `plan` kind scans only `docs/qa/test-plans`. |
| **Backlog Items** | None created or advanced. |

## CI

| | |
|---|---|
| **CI Run ID** | `33315443906` |
| **CI Result** | **PASS** — all 14 required jobs `success` on `122ce41e`, the exact SHA pushed to `develop`. Two earlier runs (`33315014618`, `33315152496`) were superseded by later pushes and carry no authority here: they were verdicts about different code. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `122ce41e` after `develop` was moved to it. Because the integration
was a fast-forward, the merged tree is byte-identical to the CI-verified SHA —
but the checks were re-run rather than assumed.

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | **PASS** — 4668 checks |
| `node scripts/generate-data-model.mjs --check` | PASS |
| `node scripts/generate-screen-map.mjs --check` | PASS |
| `node scripts/generate-component-index.mjs --check` | PASS |
| `node scripts/rebuild-backlog.mjs --check` | PASS |
| `node scripts/rebuild-tasks.mjs --check` | PASS |
| `node scripts/rebuild-sessions.mjs --check` | PASS |
| `node scripts/rebuild-qa.mjs --check` | PASS |
| `node scripts/sync-remediation-inventory.mjs --check` | PASS |
| `node --test scripts/index-drift.test.mjs` | PASS |
| `node scripts/generate-dashboards.mjs --check` | **FAILED, then fixed** |

The dashboard failure was self-inflicted and expected: the Engineering Dashboard
counts engineering-history records, and this record is a new one, so writing it
made the count stale (65 → 66). Regenerated and committed in the same change.

**Not run, and why:** no application code was modified — the diff is
documentation, two new scripts, `package.json`, `ci.yml`, `obsidian-mappings.mjs`
and `validate-framework.mjs` — so `npm run test`, `check-types` and `build` would
have proven nothing this task could have broken. CI ran them anyway on the same
SHA and they passed.

## Release / Deployment Impact

None — not deployed. `MAIN_CHANGE_STATUS = UNTOUCHED`; `origin/main` is at
`ec1d58da`, exactly where this task found it. Nothing here is runtime code, so
there is nothing to roll back: the two new CI steps are the only change with any
effect outside the documentation tree, and reverting the commit removes them.

## Knowledge Capture

Two new categories, both mapped for publication in
`scripts/lib/obsidian-mappings.mjs` and both now checked by
`validate-framework.mjs`:

| Path | Category | Contents |
|---|---|---|
| `docs/knowledge/data-model/` | **entity** → `12 - Data Model/Generated` | 13 entity notes, the generated [[domain-map]], [[data-model-overview]], README |
| `docs/knowledge/discovery/` | **framework-knowledge** → `11 - Agent Knowledge/Discovery` | [[discovery-status]], [[known-gaps]], [[contradictions]], [[pending-verification]], README |

Also written: `docs/knowledge/product/glossary.md` (product-knowledge) and
`docs/knowledge/architecture/screen-map.md` (architecture, generated).

**The durable lesson is the arrangement itself.** Entity documentation rots on a
*migration* rather than on a decision — nobody sets out to invalidate it — which
is how `database-architecture.md` came to describe "~285 models, ~255 enums"
against a schema holding 318 and 299. So each entity note carries a
`GENERATED:schema-facts` region the generator owns and rewrites, with
hand-written prose around it, and `--check` runs in CI. The generated half is
what makes the hand-written half worth trusting.

**A second durable lesson came from the graph work.** An exemption whose stated
reason asserts a fact should be checked against that fact. `STANDALONE_CATEGORIES`
in `sync-obsidian.mjs` excused four folders, and two of its reasons — "the
scenarios it ran carry the relationships", "is reached from that task" — named a
relationship as if it existed. It did not: history records and QA runs cite their
records as plain text. The exemption is what stopped anyone noticing, and
`OBSIDIAN_GRAPH_ORPHANS 0` was true and useless at the same time.
`scripts/generate-record-graph.mjs` now emits those edges, and
`OBSIDIAN_STANDALONE_ALLOWED` is the number to read beside the orphan count.

Two findings worth carrying forward independently of the notes: **13 models have
no Prisma call site anywhere** (`ProcessingCycle` is the one that matters — two
live models hold a foreign key to it, so that column is always null), and
**`SubscriptionStatus` carries both `CANCELLED` and `CANCELED`** with a different
writer for each.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran — 51 notes written, 1070 already current,
6 skipped as empty. Two folders appeared in the vault for the first time:
`12 - Data Model/Generated` (16 notes) and
`11 - Agent Knowledge/Discovery` (5 notes).

`--verify` reports **`OBSIDIAN_SYNC_STATUS = PASS`** — 1126 graph nodes, **0
orphans**, 0 duplicate nodes, 0 semantic link errors, 0 parity diffs, 0 missing
provenance.

It did not start that way, and the route from there to here is the useful part
of this section.

The first verify failed on two graph orphans, both under
`06 - Implementation Plans/Generated/ExecPlans/` and both carrying
`EXECPLAN-0028` in their filename — committed to `develop` on 2026-08-29
(`dca93c47`, `84a7e0b5`) by two different sessions, and already in the vault at
14:00 on 2026-08-30 from another session's sync, before this task synced. So they
were pre-existing, and the first instinct was to record them as such and leave
them.

Asking *why* they had no frontmatter found the cause rather than the symptom.
`ID_KINDS.plan` in `scripts/lib/id-allocator.mjs` points at `docs/qa/test-plans`
and never sees `docs/plans`, so **two record families share the `PLAN-` number
space and only one of them is allocated**. Asking the allocator for a plan id
during this investigation returned `PLAN-027` — a number an ExecPlan already
held. The ledger shows the same split from the other side: SESSION-0076
allocated `PLAN-026` for the BUG-0084 ExecPlan, and the file it wrote is named
`EXECPLAN-0028`. Filed as [[BUG-2413]], triaged `PLAN_REQUIRED`.

The orphans themselves were then resolved the way the verifier explicitly asks —
by **declaring the relationship each already had**, a link to the bug named in
its own title ([[BUG-0084]], [[BUG-1952]]) — and not by adding a link to remove a
dot, and not by renumbering. Renumbering needs an allocator that works, and each
plan now carries a caveat pointing at the bug that explains why its number is
what it is.

Two reservations, `PLAN-027` and `PLAN-028`, were taken during the investigation
and abandoned. `--prune` deliberately does not release a reservation with no
record, so they stand as gaps — cheaper than a collision, which is the point.

## Cleanup

Session `SESSION-0081` closed. Worktree
`D:/My Work/hrm-dijipeople/dijipeople-datamodel` removed via
`node scripts/remove-worktree.mjs` — never `git worktree remove`, which follows
the `node_modules` junction and has deleted thousands of tracked files from the
user's primary checkout before.

The primary checkout ends as it began: one untracked file,
`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`,
which was present before this task started and belongs to someone else. It was
recorded as the baseline and is not this task's to explain, stage or remove.

MCP browser artefacts were cleaned: four screenshots that landed in the repo
**root** (a relative `filename` does not go to `.playwright-mcp/`) were moved to
the scratchpad, and only this session's `page-2026-08-30T13-2*/13-3*.yml`
snapshots were deleted — another session's files in that directory were left
alone.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0084]] · [[BUG-1952]] · [[BUG-2334]] · [[BUG-2335]] · [[BUG-2384]] · [[BUG-2413]] · [[PLAN-026]] · [[PLAN-027]] · [[SESSION-0076]] · [[SESSION-0081]] · [[TASK-0005]]

<!-- GRAPH:END -->
