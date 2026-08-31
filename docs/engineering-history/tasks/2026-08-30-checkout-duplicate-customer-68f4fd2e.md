# Engineering History — Checkout duplicate customer

| | |
|---|---|
| **Task Title** | One customer per self-service signup — the middle of a three-part fix |
| **Task Type** | BUGFIX, promoted to HOTFIX_PRODUCTION at the owner's request |
| **Date** | 2026-08-30 |
| **Architect Plan** | NOT_APPLICABLE — a one-field wiring fix on an existing, already-designed mechanism. No new model, migration, permission or contract. `PLANS.md` requires an ExecPlan for none of it. |
| **Agents Used** | Architect (routing, triage, the `FIX_NOW` disposition), Backend/API (the fix and its guards), QA (the production browser pass and the read-only measurement), Integrator (branch, CI verdict, `develop` ref-push, `main` PR and merge), Release/DevOps (deploy verification against `/api/health`). **Deliberately not used:** Database (no schema change), Frontend and UI/UX (the client half already shipped and was verified correct as deployed), Security (no auth, permission or tenant-scope surface is touched — the changed value is a hint the service re-verifies, never an authorisation). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` @ `c18b5024` |
| **Task Branch** | `agent/checkout-duplicate-customer` |
| **Base SHA** | `c18b50249e891796672e3659c8c7d48e01af47ea` |
| **Final Task SHA** | `68f4fd2eecc0ffe86fb1c942b7b25727e675b7e2` |
| **Target Branch** | `develop`, then `main` under SESSION-0086 |
| **Merge Commit** | `54f79ac51dce9a245f941774e99ee6283163ac06` (PR #62, `develop` → `main`) |
| **Final Target SHA** | `develop` = `68f4fd2e` (ref-push of the CI-verified SHA) · `main` = `54f79ac5` |

> The generator recorded the base as `origin/main` with **0 changed files**,
> because by the time this record was filed `main` already contained the work.
> That is an artefact of filing after the merge, which the framework requires;
> the real base is the one in the table above.

### Commits

```
84a0654b  fix(billing): the middle of a three-part fix, and one customer per signup
68f4fd2e  chore(records): regenerate the record graph develop left stale
```

### Files Changed

14 files against `c18b5024`, then 2 more in the second commit.

```
services/api/src/modules/billing/services/billing.service.ts                       +29
services/api/src/modules/billing/services/checkout-draft-id-reaches-the-order.spec.ts  +288 (new)
docs/bugs/BUG-2530-…                                                              (new)
docs/backlog/items/ITEM-0118-…                                                    (new)
docs/qa/scenarios/QA-COMMERCIAL-001-…                                             (new)
docs/qa/regressions/index.md                                                       +15
docs/sessions/SESSION-0085-…                                                      (new)
+ generated indexes, dashboards, remediation inventory, record graph
```

The behavioural change is two lines: one declared field on
`createPublicSubscriptionCheckout`'s input type, and one argument forwarded to
`openOrder`. Everything else is a guard, a record, or a regenerated index.

## Conflicts

None. The branch fast-forwarded onto `develop`, and `develop` fast-forwarded
onto `main` — `main` was one docs commit behind `develop` and nothing else.

## Conflict Resolutions

None to make. Worth recording what was *chosen* instead, because it was a real
decision and the alternative was cheaper:

`develop` was already red when this task started — its tip `c18b5024` had failed
CI at 19:04 because a previous session committed SESSION-0082 and the
prod-monitoring history record without running `generate-record-graph.mjs`. The
branch inherited that failure. The alternatives were to merge anyway on the
grounds that the failure was not this task's, or to regenerate the two blocks.

Regenerating was chosen. Merging past a red gate to production, on a hotfix, on
the grounds that somebody else broke it, would have made the gate advisory — and
the blocks in question are generated artefacts the tooling owns, so regenerating
them alters no hand-written content. **What would have been lost by the other
choice** is the property that a green gate on `main` means something; the cost of
this choice was one extra CI cycle.

## QA

| | |
|---|---|
| **QA Report** | QA-COMMERCIAL-001 — **PASS**, production, 2026-08-30 on `54f79ac` |
| **Bug IDs** | BUG-2530 created and closed `VERIFIED`. BUG-1516 shown to have been closed on insufficient evidence — its `VERIFIED` predates this and was not warranted. |
| **Backlog Items** | ITEM-0118 created — the eight pre-existing orphan rows, measured but deliberately not touched by this task. |

## CI

| | |
|---|---|
| **CI Run ID** | `33333357398` (PR #62 on `68f4fd2e`), preceded by `33332688069` on the branch |
| **CI Result** | PASS — `CI required gate` green on `68f4fd2e`, the exact SHA merged |

A verdict must be read **on the exact SHA being merged**. The first branch run,
`33331920572`, was **FAILED** on `84a0654b` — recorded here rather than omitted,
because it is the run whose failure produced the second commit.

## Post-Merge Validation

Against the merged and deployed result, not the branch:

- `GET https://api.dijipeople.com/api/health` → `commit: 54f79ac5…`, `status: ok`,
  `outboxWorker.enabled: true`. Confirmed by polling until the hash changed —
  a merge does not guarantee a deploy, and this one took ~420s.
- QA-COMMERCIAL-001 driven in a browser against `www.dijipeople.com` on that
  deployed commit: **one** customer row where the defect always produced two,
  both orders resolving to it, and the row carrying the buyer's real address
  rather than the placeholder.
- Placeholder rows in production: 8 before the run, 8 after — the run created
  none. Total `CustomerAccount`: 18 → 19, plus one rather than plus two.

## Release / Deployment Impact

**Reaches production.** `main` = `54f79ac5`, Render deploy triggered at
20:39:54Z and live at 20:47:37Z.

Rollback class: **trivial**. No migration, no schema change, no data
transformation, no contract change. Reverting the two lines restores the previous
behaviour exactly, and nothing written while the fix was live depends on it.

Production Stripe is in `TEST` mode; the verification run charged nothing. It
leaves one abandoned prospect, `REG374 Verify 20260830`.

> **Correction.** This first said that prospect "the order TTL sweeper ages out".
> There is no sweeper running. `abandonExpired` exists and is e2e-tested but has
> **no caller anywhere in the codebase**, and the API registers no scheduler at
> all — no `@Cron`, no `ScheduleModule`. Found while scoping the placeholder
> follow-up and measured against production: three workspace names are locked by
> expired-but-unswept orders, the oldest since 2026-08-22, under a unique index
> on `requestedSlug`. Filed separately. The claim was wrong in a way that would
> have let a reader assume this row self-cleans, so it is corrected rather than
> quietly dropped.

## Knowledge Capture

- `docs/knowledge/regressions/a-fix-wired-at-both-ends-only.md` — new. The
  transferable lesson: a fix built at both ends of a multi-hop path passes both
  its tests while the middle is missing; TypeScript declines to
  excess-property-check through a spread, which is the idiom every thin
  controller here uses; and a guard belongs on the seam rather than on either
  end.

Not written: no module note changed, because nothing about how `billing` works
changed — a field that was always supposed to be forwarded now is.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran; `11 - Agent Knowledge/Regressions/Generated`
gained the new note, and the `00 - Home/Generated` dashboards were refreshed by
the same pass. Verified with `npm run knowledge:verify`.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/DijiPeople-checkout-dup` retained while
ITEM-0118 is open and awaiting the owner's decision on the eight orphan rows;
it is removed via the guard script, never `git worktree remove`.

The primary checkout was left as it was found: one untracked file,
`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`,
which predates this task and belongs to someone else.
`.playwright-mcp/` artefacts written into it by the browser pass were deleted.
`UNEXPLAINED_DIRTY_FILES = 0`.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1516]] · [[BUG-2530]] · [[ITEM-0118]] · [[QA-COMMERCIAL-001]] · [[SESSION-0082]] · [[SESSION-0085]] · [[SESSION-0086]]

<!-- GRAPH:END -->
