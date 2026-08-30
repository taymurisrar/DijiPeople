# Engineering History — Promote open bug sweep to production

| | |
|---|---|
| **Task Title** | Promote open bug sweep to production |
| **Task Type** | RELEASE — promotion of `develop` to `main`, plus one correction release the verification forced. |
| **Date** | 2026-08-28 |
| **Architect Plan** | NOT_APPLICABLE — a release promotes code that has already been planned, reviewed and validated. No new change was authored for it; the one code change here (`main.ts`) was a correction the post-deploy verification demanded, and it is two lines. |
| **Agents Used** | Release/DevOps (deployment, health, drift), Integrator (both PRs, both merges, the ref-push back to `develop`), QA (post-deploy verification, which is what found the failure below), Backend/API (the `main.ts` correction). **Not used:** Database — no migration, `prisma migrate deploy` a no-op both times. Security — no auth, permission or tenant-scope surface moved. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `develop` (the release itself), then `agent/release-closeout` (this record and BUG-0904's closure) |
| **Base SHA** | `e0aeabcd` — production as this task found it |
| **Final Task SHA** | `3d2931c4d008eaeced3fafc17683090fa5fe53de` — the close-out, which targets `develop` |
| **Target Branch** | `main` for the two releases; `develop` for the close-out |
| **Merge Commit** | `6e00395a` (PR #54, head `b6c8ab01`) and `949f461c` (PR #55, head `74746058`) |
| **Final Target SHA** | `main` = `949f461c`; `develop` = `3d2931c4`, which contains it |

### Commits

```
3d2931c4 docs(release): BUG-0904 verified in production, and the release recorded
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            d12495d0 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
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
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     3d2931c4 [agent/release-closeout]
```

### Files Changed

13 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/releases/2026-08-28-open-bug-sweep.md
M	docs/sessions/SESSION-0067-promote-the-open-bug-sweep-to-production.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

None. Both PRs merged clean, and so did both reconciliations of `main` back into
`develop` afterwards — the second was a fast-forward.

That those reconciliations were needed at all is the thing worth recording here.
Merging a PR on GitHub creates a commit that exists only on `main`, so `develop`
is behind production the moment the merge button is pressed, and
`DEVELOP_CONTAINS_MAIN` fails on the next validation run. It happened after both
releases, for the same reason, and it is not a conflict — it is the ordinary
consequence of merging through GitHub rather than locally. One
`git merge origin/main` per release settles it.

## Conflict Resolutions

None to resolve. The reconciliations took `main` wholesale because there was
nothing on the other side to lose: `main` carried only the merge commits, and
`develop` already contained every change inside them.

## QA

| | |
|---|---|
| **QA Report** | No run record. The QA here was post-deploy verification against production — `/api/health`, `npm run smoke:deployment`, `/api/public/plans` and the three site origins. It is recorded in the release record rather than as a scenario run, because it verified a deployment rather than a behaviour. |
| **Bug IDs** | **Closed:** BUG-1822 (VERIFIED — the owner fixed the landing CSP origin; measured on all three sites). **Reclassified PRODUCT_DECISION:** BUG-0898, BUG-0903 — going live on Stripe is a commercial decision, not a defect. **Corrected, then verified:** BUG-0904 — see Post-Merge Validation. |
| **Backlog Items** | None created. The backlog stands at `completed 219 · awaiting triage 0`. |

## CI

| | |
|---|---|
| **CI Run ID** | `33191707693` on `b6c8ab01` (authorised PR #54), `33195450197` on `74746058` (authorised PR #55), `33198618650` on `3d2931c4` (this close-out) |
| **CI Result** | PASS on all three, each read on the exact SHA merged. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

**This section is why this record is worth reading.**

After `6e00395a` deployed, the verification asked production what it reported:

```
GET https://api.dijipeople.com/api/health
  commitShort: 6e00395    status: ok
  outboxWorker: <absent>
```

The field was absent. BUG-0904's entire fix was that field; it had two passing
specs; and the release that shipped it changed nothing about the running system.

`AppService.getHealth()` was the code extended. But `main.ts` registers express
handlers for `/`, `/api` and `/api/health` **before** Nest's router, so
`AppController` never answers those three paths in production. The health
payload has two producers, and both specs asserted the one nothing reaches. A
green suite proves the code under test, not the code being served.

`949f461c` corrected it at the handler that answers, and
`services/api/src/health-payload-is-served.spec.ts` now asserts against
`main.ts`, so the two producers cannot drift apart silently again. After that
deploy:

```
GET https://api.dijipeople.com/api/health
  commitShort: 949f461    status: ok
  outboxWorker: { "enabled": true }
```

`npm run smoke:deployment` then passed in full against production, including
`ok - outbox worker is draining events` — the check that would have caught this
had the field existed. `GET /api/public/plans` still returned 4 plans / 18
prices / 8 checkout-ready, unchanged across both deploys; `admin` and `app`
redirect to login; `www` returns 200.

The lesson generalises past this bug. A deployment verified by reading its own
tests is not verified. What made the difference was asking the deployed service
a question only it could answer.

## Release / Deployment Impact

Production, twice. `MAIN_CHANGE_STATUS = CHANGED` is the expected terminal value
for a RELEASE and is not a failure here.

| | |
|---|---|
| **Release record** | [`docs/knowledge/releases/2026-08-28-open-bug-sweep.md`](../../knowledge/releases/2026-08-28-open-bug-sweep.md) |
| **Rollback class** | Code-only. Revert the merge commit and redeploy; there is no data to unwind. |
| **Migrations** | None. `prisma migrate deploy` in `preDeployCommand` was a no-op for both merges. |
| **Surfaces** | Render deployed the API automatically on each merge. All three Vercel projects reported READY on `6e00395a`. |

Two changes will look like regressions to an operator and are intended:
promotions are now created inactive (BUG-1751), and a partner carrying an
invalid `currencyCode` — production has rows holding `"5"`, because the old form
rendered Currency as a numeric input — will not save until it is corrected
(BUG-1425, BUG-1747).

## Knowledge Capture

- [`docs/knowledge/releases/2026-08-28-open-bug-sweep.md`](../../knowledge/releases/2026-08-28-open-bug-sweep.md)
  — category `release`. Both merges, the correction, the two intended changes
  support may hear about, and what was explicitly *not* verified.
- `services/api/src/health-payload-is-served.spec.ts` — the durable half of the
  lesson. A prose note saying "check the served path" would be forgotten; a spec
  that fails when the express handlers stop carrying the payload will not be.

## Obsidian Sync

`npm run knowledge:dashboards` ran and rewrote the Engineering Dashboard and the
Engineering Control Center; `npm run remediation:sync` refreshed one row.
`sync-obsidian.mjs` publishes into a vault needing local configuration that this
worktree does not carry, so it did not run. The Git-tracked side of the
knowledge base — which is what a future retrieval reads — is current.

## Cleanup

Worktree `wt-open-bug-sweep` retained — the sweep it is named for and this
release both ran in it, and it holds the branch carrying this record. It is
removed with `npm run worktree:remove`, never `git worktree remove`, which
follows the `node_modules` junction and has previously deleted several thousand
tracked files out of the user's primary checkout.

The primary checkout was not written to at any point, and the dirty paths it
carries are the user's own.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0898]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-1425]] · [[BUG-1747]] · [[BUG-1751]] · [[BUG-1822]] · [[SESSION-0067]] · [[TASK-0005]]

<!-- GRAPH:END -->
