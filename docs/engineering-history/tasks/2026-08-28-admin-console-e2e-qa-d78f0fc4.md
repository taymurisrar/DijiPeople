# Engineering History — Admin console e2e qa

| | |
|---|---|
| **Task Title** | Admin console end-to-end browser QA and go-live assessment |
| **Task Type** | QA — a browser-driven pass against production. No product code was changed; the diff is records. |
| **Date** | 2026-08-28 |
| **Architect Plan** | NOT_APPLICABLE — QA against a deployed environment. PLANS.md requires an ExecPlan for change classes; this task changed no product code. |
| **Agents Used** | QA (the whole pass), Integrator (branch, CI verdict, ref-push to develop). Deliberately NOT used: Backend/API, Frontend, Database, Security — nothing was implemented, so there was nothing for them to own. Architect triage is outstanding and is the follow-up. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` @ `912f4e61` (the generator derived `origin/main`; the session record and the branch were both cut from develop) |
| **Task Branch** | `agent/admin-console-e2e-qa` |
| **Base SHA** | `912f4e610759e3809ad1a77d3123df253f34a158` (production ran `e0aeabcd`, which is what was tested) |
| **Final Task SHA** | `d78f0fc4ff0b370ba1e34e5a73b285dc1369bb1c` |
| **Target Branch** | `develop` — an ordinary task, so main is untouched |
| **Merge Commit** | None — integrated by ref-push (`git push origin HEAD:develop`), so the develop tip is the CI-verified SHA rather than a new merge commit |
| **Final Target SHA** | `d78f0fc4ff0b370ba1e34e5a73b285dc1369bb1c` — origin/develop, byte-identical to the SHA CI passed |

### Commits

```
37a0db54 fix(web): BUG-1644 verified fixed in production, and the reasoning corrected
912f4e61 docs(handoff): browser QA after the release, and what it must not assume
454e4349 docs(qa): the admin console cannot create a lead or edit a customer
b6ef6ec0 docs(qa): a fix scoped to one module, behind a test shaped like that module
d78f0fc4 docs(qa): the paid signups were test-mode, so BUG-0903 is live not stale
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            912f4e61 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   d78f0fc4 [agent/admin-console-e2e-qa]
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
```

### Files Changed

51 file(s) against `origin/main`.

```
A	apps/web/lib/tenant-root-domain.spec.ts
M	docs/backlog/completed.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0103-deployment-check-the-composed-tenant-workspace-host-must-res.md
M	docs/backlog/open.md
M	docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md
M	docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/bugs/BUG-1419-every-incident-on-the-monitoring-overview-links-to-a-route-t.md
M	docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md
M	docs/bugs/BUG-1422-runtime-form-validation-discards-every-field-reason-and-show.md
M	docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md
M	docs/bugs/BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer.md
M	docs/bugs/BUG-1541-generated-agreement-pdfs-render-unsubstituted-template-place.md
M	docs/bugs/BUG-1578-admin-customer-form-stores-a-country-lookup-id-where-every-r.md
M	docs/bugs/BUG-1644-tenant-root-domain-is-misconfigured-so-no-customer-can-reach.md
M	docs/bugs/BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-.md
M	docs/bugs/BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-.md
A	docs/bugs/BUG-1742-lead-creation-is-impossible-the-runtime-form-always-sends-pa.md
A	docs/bugs/BUG-1743-customers-and-partners-cannot-be-edited-the-runtime-form-ech.md
A	docs/bugs/BUG-1744-every-subscription-has-a-zero-length-billing-period-and-a-re.md
A	docs/bugs/BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti.md
A	docs/bugs/BUG-1746-required-fields-on-unselected-tabs-are-undiscoverable-so-cre.md
A	docs/bugs/BUG-1747-partner-currency-is-a-required-numeric-input-so-partner-crea.md
A	docs/bugs/BUG-1748-the-subscription-record-page-cannot-resolve-its-own-tenant-p.md
A	docs/bugs/BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-.md
A	docs/bugs/BUG-1750-the-monitoring-critical-tile-miscounts-and-links-to-a-filter.md
A	docs/bugs/BUG-1751-a-promotion-goes-live-against-every-subscription-the-instant.md
A	docs/bugs/BUG-1752-admin-empty-states-blame-filters-that-are-not-set.md
A	docs/bugs/BUG-1753-lookup-display-labels-mangle-acronyms-and-numeric-ranges-acr.md
A	docs/bugs/BUG-1754-the-incident-queue-counts-routine-401s-and-unknown-route-404.md
A	docs/bugs/BUG-1755-the-plans-list-cannot-show-publication-status-or-sales-model.md
A	docs/bugs/BUG-1756-bulk-delete-confirms-without-naming-how-many-records-or-whic.md
A	docs/bugs/BUG-1757-promotions-cannot-be-deleted-and-the-delete-route-silently-d.md
A	docs/handoff/2026-08-28-post-release-browser-qa.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/known-bug-patterns/README.md
A	docs/qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
A	docs/qa/scenarios/QA-AUTH-006-a-tenant-workspace-url-survives-a-multi-label-root-domain.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-001-authentication.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0065-admin-console-end-to-end-browser-qa-and-go-live-assessment.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

None. `origin/develop` had not moved from `912f4e61` since the branch was cut
(`git rev-list --left-right --count origin/develop...HEAD` reported `0	3`),
so the ref-push was a fast-forward.

## Conflict Resolutions

None required.

Worth recording anyway, because it was a near miss: the first attempt to update
nine existing bug records silently changed nothing in their prose. The
replacements were written with `\n` and the files are CRLF, so every section
regex failed while the frontmatter edits — which used `.*$` and tolerate the
carriage return — succeeded. The result was records whose `Status: VERIFIED`
contradicted a "Not yet retested" body.

`rebuild-backlog.mjs` caught it and refused to regenerate, naming the exact
contradiction. That check is the reason this did not reach the commit.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md`](../../qa/runs/2026-08-28-admin-console-e2e-912f4e6.md) — verdict **FAIL**, the admin console is not go-live ready |
| **Bug IDs** | Created: BUG-1742 … BUG-1757 (16). Moved to VERIFIED: BUG-1419, BUG-1422, BUG-1541, BUG-1578. Evidence added without changing status: BUG-1420, BUG-1423, BUG-1425, BUG-1649, BUG-1654, BUG-0898, BUG-0903, BUG-0904. |
| **Backlog Items** | None created or closed. ITEM-0022 and ITEM-0103 are referenced by the new records but were not advanced. |

## CI

| | |
|---|---|
| **CI Run ID** | `33130491156` |
| **CI Result** | PASS, read on `d78f0fc4` — the exact SHA pushed to develop. Two earlier runs (`454e4349`, `b6ef6ec0`) were CANCELLED as superseded, which is why the verdict was taken only after the final push. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The develop tip is byte-identical to the task SHA CI passed — the ref-push
created no new commit — so the CI verdict on `d78f0fc4` is a verdict on the
integrated result, not merely on the branch:

```
git rev-parse origin/develop == git rev-parse HEAD   ->  d78f0fc4  (equal)
```

Run before the push, on the tree that was pushed:

| Command | Result |
|---|---|
| `npm run validate:framework` | PASS — 4,128 checks |
| `npm run backlog:check` | PASS — 320 records, 0 structural errors |
| `npm run sessions:check` | PASS after rebuild |
| `npm run knowledge:verify` | FAILED — 2 problems, both pre-existing; see Obsidian Sync |

No test suite was run: this task changed no product code, so there was nothing
for a suite to prove. That is a statement about scope, not a skipped step.

## Release / Deployment Impact

None — not deployed. `develop` does not deploy, `main` was untouched, and the
diff is documentation. Production remains `e0aeabcd`.

The task did, however, change production **data**, and that is worth stating in
a deployment section because no diff records it: a customer and a partner were
created and deleted, and a promotion was created and deactivated. See Cleanup.

## Knowledge Capture

One durable lesson, recorded as a bug pattern rather than only as a bug:

- [`docs/qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md`](../../qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md)
  — a shared mechanism fails, one module is repaired, and the regression test is
  written in the shape of that module, so the class stays live everywhere else
  and the closed record reads as coverage. Written from [[BUG-0220]], whose
  plans-only fix left [[BUG-1743]] live on customers and partners for eight
  days. Registered in the pattern index.

Also captured, inside the QA run rather than as separate notes: that a paid
signup completing end to end does not mean money changed hands (Stripe test
mode), and that a mid-load snapshot is not evidence about a list screen.

## Obsidian Sync

`npm run knowledge:sync` ran: **140 notes written, 741 already current, 6
skipped as empty.** The 16 new bug records, the QA run and the new bug pattern
all published into the mapped agent-owned folders. No manual note was touched.

`npm run knowledge:verify` then reported `OBSIDIAN_SYNC_STATUS = FAILED` on two
problems, **both pre-existing and neither produced by this task**:

1. `2026-08-26-tenant-agent-rollout-28edc827.md` carries
   `[[trust-the-runtime-invariant-over-a-static-scan]]`, which resolves to no
   note. Committed by TASK-0027 on 2026-08-26.
2. `TASK-0024-dlp-investigator-review-on-the-employee-record.md` is a
   GRAPH_ORPHAN. Committed by TASK-0024 on 2026-08-26.

Both were left alone deliberately. Fixing the first means authoring another
session's knowledge note from a title, and the second is another task's record
to relate. Neither is damage to repair blindly.

Per the verifier's own instruction — "a documentation-automation failure never
rolls back healthy work — and never hides either" — this task is capped at
**COMPLETE_WITH_DOCUMENTATION_WARNING**.

## Cleanup

**Primary checkout.** Playwright MCP writes into the repository and refuses
scratchpad paths, so this pass left 34 PNGs and `.playwright-mcp/` (85 files) in
the user's own working directory. All removed after checking for reparse points
first — `Remove-Item -Recurse` follows junctions, and node_modules junctions
live in these worktrees. `git status --short` in the primary checkout is now
one line: the user's own `.mcp.json`, which is theirs and was not touched.

**Worktree and branch.** `D:/My Work/hrm-dijipeople/dijipeople-admin-qa` and
`agent/admin-console-e2e-qa` both retained. The branch is merged into develop,
but the worktree holds the scratch artifacts behind this record and the guarded
removal path is the only safe one; `git worktree remove` has previously deleted
3,072 files out of the primary checkout through a node_modules junction.

**Production test data.** Customer `36f984ab` deleted (read-back 404), partner
`56eb244b` deleted (list 2 to 1). No lead was created — creation is broken
([[BUG-1742]]). No plan was created, deliberately, because plans cannot be
deleted ([[BUG-1749]]).

**One item not cleaned up, stated rather than buried.** Promotion
`177c2e07-67d0-4a2f-be69-3e357fb0cac1` ("QA E2E Promo 20260828 DELETE ME")
remains in production, deactivated and never redeemed. `DELETE` on a promotion
deactivates rather than deletes ([[BUG-1757]]), so no supported path removes it.
It needs a database-level delete.

Roughly ten error-log incidents were also generated by probing endpoints,
including one from a shell path-expansion mistake of the tester's. They are
inert noise and an unusually direct illustration of [[BUG-1754]].

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0220]] · [[BUG-0898]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-1419]] · [[BUG-1420]] · [[BUG-1422]] · [[BUG-1423]] · [[BUG-1425]] · [[BUG-1541]] · [[BUG-1578]] · [[BUG-1644]] · [[BUG-1649]] · [[BUG-1654]] · [[BUG-1742]] · [[BUG-1743]] · [[BUG-1744]] · [[BUG-1745]] · [[BUG-1746]] · [[BUG-1747]] · [[BUG-1748]] · [[BUG-1749]] · [[BUG-1750]] · [[BUG-1751]] · [[BUG-1752]] · [[BUG-1753]] · [[BUG-1754]] · [[BUG-1755]] · [[BUG-1756]] · [[BUG-1757]] · [[ITEM-0022]] · [[ITEM-0103]] · [[PLAN-001]] · [[QA-AUTH-006]] · [[SESSION-0065]] · [[TASK-0005]] · [[TASK-0024]] · [[TASK-0027]]

<!-- GRAPH:END -->
