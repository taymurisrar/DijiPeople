# Engineering History — Fixing the six landing QA findings, and releasing them

| | |
|---|---|
| **Task Title** | Fix the six landing QA bugs, run the UI/UX review, unblock provisioning and prod checkout, release to `main` |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-25 |
| **Architect Plan** | NOT_APPLICABLE — six independent, well-specified defects with existing bug records. Nothing needed sequencing the records did not already carry. Two (`BUG-1304`, `BUG-1305`) were dispositioned `PLAN_REQUIRED`; what was done here is the narrow half of each, and the ExecPlan-sized half is left explicitly open in both. |
| **Agents Used** | Architect (scope, triage, release decision), Backend/API (lookups, catalog), Frontend (landing), Database (the sort-band migration), QA (verification run), **UI/UX (Stage 2 — the gap the previous task left)**, Integrator (rebases, ref-push, release PR), Release/DevOps (deployment verification). Deliberately not used: Security — no auth, tenant-scoping or permission surface was touched; Integration — no third-party contract changed. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` @ `bf0d3714` |
| **Task Branch** | `agent/landing-qa-fixes` |
| **Final Task SHA** | `309abe0db90ecfedc823ee09578334dc9d02e264` |
| **Target Branch** | `develop`, then `main` (release, explicitly authorised by the user) |
| **Merge Commit** | `b5e365cb` — PR #49, `develop` → `main` |
| **Final Target SHA** | `develop` = `309abe0d` (fast-forward); `main` = `b5e365cb` |

### Commits

```
36108cbd fix(landing): six QA findings from the landing E2E run
11bef44e qa(landing): verify the six fixes on the running product and close the records
1544b31d test(e2e): the footer tel: link is asserted conditionally, not required
309abe0d fix(test): assert the coordinate-leak invariant over the object, not the JSON
```

### Files Changed

34 files. Product code in `apps/landing`, `services/api/src/modules/lookups` and
`services/api/src/modules/tenant-settings`; one data migration; the rest tests
and records.

## Conflicts

None. `develop` did not move under this branch — unlike the QA task that
preceded it, which rebased twice in one afternoon.

## Conflict Resolutions

Not applicable.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-25-landing-fixes-verification.md`](../../qa/runs/2026-08-25-landing-fixes-verification.md) — **PASS**, 24 scenarios |
| **Bug IDs** | Closed `VERIFIED`: `BUG-1302`, `BUG-1303`, `BUG-1304`, `BUG-1305`, `BUG-1306`, `BUG-1307`. Found, fixed and closed within this task: `BUG-1364`. Re-measured: `BUG-0904`. |
| **Backlog Items** | `ITEM-0100` → `DONE`. |

Regressions added: `REG-252`–`REG-258`. Scenarios added:
`QA-LANDING-017`–`022` and `QA-ATTENDANCE-001`.

## CI

| | |
|---|---|
| **CI Run ID** | `32897955030` (branch); `32899411749` and `32899304528` on the release PR |
| **CI Result** | PASS — `CI required gate: success`, read on `309abe0d`, the exact SHA merged |

**CI failed twice before it passed, and both failures were worth having.**

1. `Browser e2e` — `flow-c-landing-public-surface.spec.ts` required the footer to
   contain a `tel:` link. That assertion pinned the defect `BUG-1306` fixed: the
   only link it guaranteed was a reserved fictional number. Rewritten to assert
   what actually matters — a reachable contact route, and a well-formed number
   *if* one is published.
2. `Database e2e` — an attendance test failed on a branch that changed nothing in
   attendance. It was `BUG-1364`: a coordinate-leak assertion substring-matching
   serialised JSON, failed by a `lastReconciledAt` of `…:51.641Z` spelling the
   coordinate `51.6`. Diagnosed rather than re-run, fixed, and recorded.

The second is the one worth remembering. A red build naming a privacy leak, on a
branch touching only the landing site, is the failure most likely to be waved
through as flake — and a flake that has been dismissed once has stopped being
evidence about the thing it guards.

## Post-Merge Validation

`develop` was fast-forwarded to `309abe0d`, so the integrated tree is
byte-identical to the CI-verified tree. `main` is a merge commit (`b5e365cb`)
from a PR whose head SHA carried the passing gate.

Verified **on production after deployment**, not on the branch:

| Fix | Production check | Result |
|---|---|---|
| `BUG-1302` | `/subscribe?…billingInterval=YEAR` | `estimated QAR 2,000.00 per year` — was "per month" |
| `BUG-1302` | the same page with `MONTH` | `estimated QAR 200.00 per month` — unchanged |
| `BUG-1303` | the checkout-blocked panel's link | `/contact?checkout=DP-CHK-01` — no longer `?ref=` |
| `BUG-1306` | every page's footer | no `tel:` link, no `555-01XX` anywhere |

`npm run validate:framework` — 3863 checks, passing.

## Release / Deployment Impact

**This task released to production.** Ordinarily out of scope — `main` is the
user's to promote — and done here on explicit written authorisation.

PR #49 carried 31 commits, because `develop` is the integration branch and had
accumulated other completed work: TASK-0020 and TASK-0023 (desktop-agent DLP
capture, off by default) and BUG-1261 (the admin theme bootstrap). Two migrations
shipped: `20260825120000_dlp_capture` (additive) and
`20260825210000_country_priority_sort_band` (data-only, non-destructive — no
column added, dropped or retyped, no row deleted).

Deployment confirmed rather than assumed, per the
`merging-main-does-not-guarantee-deploy` lesson:

- **Vercel (landing)** — deployed and `Ready` in Production within minutes of the
  merge, which is how three of the four landing fixes were verified live above.
- **Render (API)** — `b5e365c` was picked up and ran through `preDeployCommand`,
  the step `BUG-0899` used to kill. That record is now `VERIFIED`, and the chain
  ran rather than aborting.

## Knowledge Capture

- [`docs/knowledge/product/landing-website.md`](../../knowledge/product/landing-website.md)
  gained **"What a purchase actually needs, end to end"** — the five conditions a
  completed purchase depends on, of which only two are visible on the page. The
  other three look like success right up to the point where the customer has
  paid and has nothing.
- `REG-252`–`REG-258` each carry a `Note` that is the lesson rather than the
  repair. The two that generalise furthest:
  - **A price is only verified when the payment processor has been asked what it
    will charge.** Every check short of opening the Stripe session agreed with
    itself, because the arithmetic was right and only the period was wrong.
  - **A structural claim asserted as a substring is not the same claim** — and
    when the replacement turns out to be *stronger*, the original was
    under-specified rather than merely fragile.
- The `two-writers-one-field` pattern from the preceding QA task earned a second
  and third instance here, and both fixes were shaped by it: reserve a band, and
  assert the band rather than the numbers.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` followed by `npm run knowledge:verify`; the
resulting counts are in the session record.

## Second phase — what unblocking checkout revealed

The task continued after the release above, on the user's instruction to
complete the production purchase and fix anything else found. It is recorded
here rather than in a separate history because it is the same branch and the
same session, and because the sequence is the point.

**The sync worked.** With the user's decision to sync in test mode, the twelve
QAR prices went from 0 to 12 checkout-ready and `/subscribe` rendered a live
form for a Qatar visitor for the first time.

**And within minutes it quoted the wrong price** — QAR 249 flat against an
advertised QAR 8 per employee. Tracing that produced two records:

- [[BUG-1369]] — `findPlanPrice` matched two of the three dimensions that
  identify a price. The symptom.
- [[BUG-1378]] — `/public/plans` published `SALES_ASSISTED` internal pricing to
  anonymous callers and marked it `checkoutReady`, while
  `/public/commercial-config` over the same rows had always excluded it. The
  cause. **And neither public write path checked the channel at all**, so a
  caller holding an id could buy an internal rate outright — the ids having been
  public until the fix.

Released as PR #50 (`21032aea`).

Three things worth carrying forward:

1. **Making a thing reachable is how its defects become findable.** Both
   defects predated this task and were invisible while no market had two
   sellable models. The sync did not create them; it removed the condition
   hiding them. The instinct to treat "it broke right after I changed
   something" as "I broke it" would have been wrong here — and the instinct to
   treat it as "not my problem" would have been worse.
2. **A read filter with no matching write check is a listing preference.**
   Fixing `getPublicPlans` alone would have looked complete, passed review, and
   changed nothing an attacker cares about.
3. **The mutation test earned its place twice.** The first version of the
   write-path wiring test failed only 2 of 5 cases when both guard calls were
   deleted: two ordering assertions compared `indexOf` results, and `-1` is less
   than every real index, so they passed with the guard gone — the one failure
   they existed to catch. Running the mutation, rather than reasoning about it,
   is what surfaced that.

The production purchase was **deliberately not completed** at the wrong price.
Buying at a figure the site does not advertise would have created a real
subscription on a rate no customer was offered, and demonstrating a pricing
defect by paying it is not evidence anyone needs.

## Cleanup

- Local dev servers stopped and their ports released. Two stale servers from the
  preceding session were still holding `:3000` and `:4000` and had to be killed —
  `TaskStop` had ended the npm wrapper without its node child.
- `apps/landing/.env.local` and the worktree's `services/api/.env` are gitignored
  and local-only. The **primary** checkout's `services/api/.env` was verified
  byte-identical to a pre-task backup; nothing was written to it.
- Screenshot and snapshot artifacts removed from both checkouts.
- Primary worktree left `DIRTY_USER_OWNED` with one generator-owned path,
  `apps/landing/next-env.d.ts`, which predates this task.
- Task worktree and branch: see the session record.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0899]] · [[BUG-0904]] · [[BUG-1261]] · [[BUG-1302]] · [[BUG-1303]] · [[BUG-1304]] · [[BUG-1305]] · [[BUG-1306]] · [[BUG-1307]] · [[BUG-1364]] · [[BUG-1369]] · [[BUG-1378]] · [[ITEM-0100]] · [[QA-ATTENDANCE-001]] · [[QA-LANDING-017]] · [[TASK-0020]] · [[TASK-0023]]

<!-- GRAPH:END -->
