# Engineering History — Landing site full E2E: what a go-live actually requires

| | |
|---|---|
| **Task Title** | Landing site full E2E: what a go-live actually requires |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-23 |
| **Architect Plan** | NOT_APPLICABLE — a QA sweep, not a change with a design. The three code fixes it produced were each local and were reviewed against the [Security](../../../AGENTS.md#security) checklist rather than planned in advance. |
| **Agents Used** | Architect (routing, triage), QA (the sweep and its verdict), Backend/API (the three billing/provisioning fixes), Frontend (the landing 404 fix), Integrator (merge and integration). Release/DevOps was **not** used: everything this run found on production is the owner's to action, and the standing agreement on the Render and Vercel credentials is logs, status and health only. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/landing-e2e-go-live` |
| **Base SHA** | `1dd74a25d2cf6179658a3e69e74df096ced79653` |
| **Final Task SHA** | `a92fef5e6a1fb809321918d83e8d8b4049723fac` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `git push origin a92fef5e:refs/heads/develop` moved `develop` from `7b7d0858` to `a92fef5e`, so the integrated SHA and the CI-verified SHA are the same object. |
| **Final Target SHA** | `a92fef5e6a1fb809321918d83e8d8b4049723fac` (`origin/develop`) |

### Commits

```
78ece817 fix(commerce): a paid customer gets the workspace they paid for
539d99ce test(landing): cover the public surface, and stop a soft 404 being indexed
789eeaca test(e2e): make the paid-customer journey a test, and give the inventory a generator
cbf9090e docs(qa): the go-live run, and a disposition for every finding it produced
1fe662c1 fix(test): assert the pricing rule instead of recomputing the implementation
832ce2b0 test(e2e): a responsive sweep, and defer the history record until it can be true
a92fef5e Merge remote-tracking branch 'origin/develop' into agent/landing-e2e-go-live
```

70 files changed against the base: 6,454 insertions, 272 deletions.

## Conflicts

Eleven files, all in one merge of `origin/develop` (`7b7d0858`) taken before
integration. Two kinds:

1. **Generated indexes** — `docs/backlog/index.md`, `docs/backlog/open.md`,
   both dashboards, `docs/qa/coverage-matrix.md`,
   `docs/qa/scenarios/index.md`, `docs/qa/test-plans/index.md`,
   `docs/sessions/{active,index}.md`, `TASK-0005-inventory.json`. Type:
   *regenerable artifact*. Both sides had added records, so both indexes were
   right about their own half and wrong about the other's.

2. **`docs/qa/regressions/index.md`** — type: *concurrent id allocation*. Both
   sides had claimed **REG-235**: `agent/site-ux-and-admin-fixes` for BUG-0877
   (the plan-price DTO contract) and this branch for BUG-0901 (the flat-price
   zero total). The register is hand-maintained and REG ids have no allocator,
   which is the whole cause.

## Conflict Resolutions

**The generated indexes** were resolved by taking `origin/develop`'s side and
then re-running every generator — `rebuild-backlog`, `rebuild-qa`,
`rebuild-sessions`, `remediation:sync`, `generate-dashboards`. Choosing either
side by hand would have produced a file that agreed with neither branch's
records: an index is a function of the records, so the only correct merge is to
recompute it. What would have been lost by hand-merging is the guarantee that
the index matches the record set at all — and `rebuild-backlog --check` would
have caught it, but only after a red CI job that named staleness rather than the
cause.

**The register** was resolved in `origin/develop`'s favour for the id: their
REG-235 was already integrated and referenced from BUG-0877 and
QA-PLATFORM-021, so renumbering it would have broken links on a branch that had
already landed. This branch's four entries shifted to **REG-236, REG-237,
REG-238, REG-239**, and every reference moved with them — four bug records'
`RegressionId`, three QA scenarios, the QA run, the landing knowledge note and
the checkout spec's inline comments. Renumbering highest-first avoided
collisions mid-rename.

What would have been lost by choosing this branch's side: BUG-0877 would have
pointed at a regression describing a different defect, in a register whose whole
value is that a future agent can look up what a REG id guards.

One casualty worth recording: the conflict boundary fell inside their REG-235
table and swallowed its `| **Active** | yes |` row. `rebuild-backlog` caught it
immediately — *"Status FIXED requires RegressionId REG-235 to be active"* — and
it was restored. A conflict marker landing mid-table is exactly the failure mode
that makes a hand-merged register untrustworthy, and the validator earned its
keep.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-23-landing-go-live-e2e-789eeac.md`](../../qa/runs/2026-08-23-landing-go-live-e2e-789eeac.md) — verdict **FAIL for production, not for the code** |
| **Bug IDs** | Created: BUG-0898, BUG-0899, BUG-0900, BUG-0901, BUG-0902, BUG-0903, BUG-0904, BUG-0905, BUG-0906, BUG-0907. Fixed here: BUG-0900, BUG-0901, BUG-0902, BUG-0907 |
| **Backlog Items** | Created: ITEM-0085, ITEM-0086, ITEM-0087, ITEM-0088, ITEM-0089 |

Regressions REG-236 through REG-239 registered, with QA-BILLING-016,
QA-ONBOARDING-001 and QA-LANDING-016 as their reusable scenarios.

## CI

| | |
|---|---|
| **CI Run ID** | [32633359157](https://github.com/taymurisrar/DijiPeople/actions/runs/32633359157) on `a92fef5e` — the exact SHA integrated |
| **CI Result** | PASS — 14 of 14 jobs green, `CI required gate: success`. Third attempt on this branch. |

The two earlier attempts are worth recording, because both were the pipeline
doing its job:

- [32631846270](https://github.com/taymurisrar/DijiPeople/actions/runs/32631846270)
  on `cbf9090e` — **Database e2e** failed. `subscription-order.e2e-spec.ts`
  asserted `billableSeats` by recomputing `SubscriptionOrderService`'s own
  expression, so it encoded the bug BUG-0901 fixed. The gate did not catch the
  bug; it caught the fix. Reproduced locally against a fresh database using
  `docs/development/database-e2e-reproduction.md` — same single failure,
  test-for-test — and the assertion was rewritten to state the product rule.
- [32632695021](https://github.com/taymurisrar/DijiPeople/actions/runs/32632695021)
  on `1fe662c1` — **Framework validation** failed on an engineering-history
  record committed with unresolved TODOs. It was right to: Merge Commit, Final
  Target SHA and CI Result cannot be filled honestly before the merge they
  describe. The record was deferred and is this file.

## Post-Merge Validation

`develop` was fast-forwarded to the exact object CI verified, so the integrated
tree is byte-identical to the tested one and the branch verdict *is* the merged
verdict — the usual "tests passed on the branch, not the integration" caveat
does not apply here.

Run against `a92fef5e` before the push:

| Command | Result |
|---|---|
| `npx jest` (in `services/api`) | 212 suites / 1685 tests pass |
| `npm --workspace e2e run check-types` | clean |
| `npm run validate:framework` | 3595 checks pass |
| `npm run knowledge:verify` | `OBSIDIAN_SYNC_STATUS = PASS` |

`git rev-parse origin/develop` → `a92fef5e6a1fb809321918d83e8d8b4049723fac`.

## Release / Deployment Impact

**None — not deployed, and cannot be.** `main` was not touched;
`MAIN_CHANGE_STATUS = UNTOUCHED`.

That is not only the ordinary-task rule, it is a fact about this repository
right now: [[BUG-0899]] means no deploy of `main` can succeed at all. The
release merged as `1dd74a25` failed at `pre_deploy_failed` and production still
serves `ef57b2a`, fourteen commits behind. The three checkout fixes in this task
are therefore correct, integrated, and **undeployable** until the legal copy is
resolved.

Rollback class: low. Two of the three code fixes are pure arithmetic and wiring
with regression tests; the third is one exported constant in a Next route. No
migration, no schema change, no contract change.

## Knowledge Capture

- `docs/qa/known-bug-patterns/seeded-but-unsellable.md` — **new pattern.** A
  seed writes every row the product needs and the product still cannot be used,
  because the rows depend on state in an external system the seed deliberately
  does not touch. Nothing errors; the one operation the data exists for refuses,
  for a reason recorded on the row that nobody reads. BUG-0898, BUG-0904 and
  BUG-0906 are all this shape.
- `docs/knowledge/architecture/landing-architecture.md` — **corrected.** It
  stated there is no `error.tsx`, `loading.tsx` or `not-found.tsx` anywhere in
  the app. All three exist, and the file it said was absent is the one that
  caused BUG-0907 — an agent trusting the note would have ruled out the actual
  cause. Adds why a root `loading.tsx` makes `notFound()` a soft 404 and why the
  fix is a static param list. The header records that only *Route surface* was
  re-verified, so the pass does not vouch for sections nobody looked at.
- `docs/backlog/README.md` — documents `remediation:sync`, the generator that
  did not exist.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran: 692 files written on the first pass (the
vault was broadly stale from earlier sessions), then 1 file after the pattern
note gained its wikilinks. `knowledge:verify` reports
`OBSIDIAN_SYNC_STATUS = PASS` — every mapped note exists, carries substance,
matches its source, and every generated wikilink resolves. Notes outside the
mapped agent-owned folders were untouched.

The one failure on the way was the known trap: a new pattern file using
markdown links rather than `[[wikilinks]]` is a `GRAPH_ORPHAN`, unreachable in
the graph.

## Cleanup

- Task worktree `D:/My Work/hrm-dijipeople/wt-landing-e2e` **retained** — the
  session is closing but the branch is integrated; removal is recorded in the
  session record.
- Throwaway databases: `dijipeople_e2e_dbci` dropped. `dijipeople_e2e_live`
  retained deliberately — it holds the provisioned test tenants and paid orders
  that are this run's evidence, and it is disposable by name.
- Stripe **test-mode** products and prices were created by
  `tools/sync-stripe-prices.mjs` (36 prices). They live only in test mode and
  are safe to leave or wipe.
- The user's dev servers on `:3000` and `:4000` were stopped by this task —
  `npm --workspace api run start:dev` frees port 4000 regardless of `PORT`
  (ITEM-0088) — and were restarted and confirmed serving before the task closed.
- Primary checkout verified clean and on `develop` throughout.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0877]] · [[BUG-0898]] · [[BUG-0899]] · [[BUG-0900]] · [[BUG-0901]] · [[BUG-0902]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-0905]] · [[BUG-0906]] · [[BUG-0907]] · [[ITEM-0085]] · [[ITEM-0086]] · [[ITEM-0087]] · [[ITEM-0088]] · [[ITEM-0089]] · [[QA-BILLING-016]] · [[QA-LANDING-016]] · [[QA-ONBOARDING-001]] · [[QA-PLATFORM-021]] · [[TASK-0005]]

<!-- GRAPH:END -->
