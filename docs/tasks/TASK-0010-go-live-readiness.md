---
TASK_ID: TASK-0010
aliases: [TASK-0010]
TITLE: Go-live readiness
TYPE: FEATURE
SIZE: MEDIUM
STATUS: COMPLETE
PRIORITY: P0
CREATED_AT: 2026-08-20
AFFECTED_MODULES: [auth, users, legal, billing]
AGENTS: [Architect, Backend/API, Database, Security, QA, Reviewer, Integrator]
DEPENDENCIES: origin/develop 95551bc; TASK-0009
CURRENT_PACKAGE: NONE
NEXT_READY_WORK_PACKAGE: NONE
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS: COMPLETE - the merge hold WP-04 waited on was released and discharged by later release tasks; main now contains every develop commit but one. Stripe PKR/QAR presentment remains an owner action, tracked as BUG-0903 rather than as an open package
---

# TASK-0010 — Go-live readiness

## Objective

Clear what stands between `develop` and a production release, so `main` is
updated deliberately rather than hopefully. A reader knows this is finished when
every item the owner accepted as a launch blocker is closed or explicitly
carried as a recorded risk, and the release itself has a readiness verdict.

## The owner's four decisions

Asked before any work, because each changes what gets built:

| ID | Question | Answer |
|---|---|---|
| OD-01 | Placeholder PKR prices, no QAR — what should real visitors see? | **Give me the real prices.** Awaiting the numbers; nothing ships to a market without them. |
| OD-02 | Nothing legal is published, so purchases record no consent | **Wire publication into the release command.** |
| OD-03 | [[ITEM-0069]] — a lockout weapon on the public endpoint | **Fix before releasing.** |
| OD-04 | [[BUG-0052]] — P0 dependency advisories, against a checklist demanding zero HIGH | **Accept for this release, with the risk recorded.** |

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | ITEM-0069 — discovery throttle, decoupled from the credential lock | DONE | — | Backend/API, Database, Security | agent/go-live-readiness | 97b4cc5 | PASS | ITEM-0069 | PASS | INTEGRATED |
| WP-02 | Legal publication wired into the release command | DONE | — | Backend/API | agent/go-live-readiness | 97b4cc5 | PASS | — | PASS | INTEGRATED |
| WP-03 | Real prices for every launched market | DONE | owner | Backend/API | agent/go-live-readiness | — | — | — | — | — |
| WP-04 | Release readiness assessment and the PR to `main` | DONE | WP-01..WP-03, WP-05, WP-06 | Release/DevOps, Reviewer, Integrator | (later release tasks) | 7d91c8a | PASS | BUG-0903 | PASS | DONE |
| WP-05 | The xlsx parse path, off an advisory that was reachable after all | DONE | — | Backend/API, Security | agent/go-live-readiness | 97b4cc5 | PASS | BUG-0052, ITEM-0070 | PASS | INTEGRATED |
| WP-06 | The first-deploy dry run, and the two defects it found | DONE | — | Release/DevOps, Database, QA | agent/go-live-readiness | 97b4cc5 | PASS | BUG-0084, BUG-0085 | PASS | INTEGRATED |
| WP-07 | ITEM-0071 — a record may not claim a fix it cannot describe | DONE | — | QA, Reviewer | agent/go-live-readiness | 97b4cc5 | PASS | BUG-0005, BUG-0009, BUG-0010, ITEM-0071 | PASS | INTEGRATED |
| WP-08 | Per-seat public pricing, flat as a sales-assisted instrument | DONE | WP-03 | Backend/API, Database, Integration, QA, Frontend | agent/go-live-readiness | 97b4cc5 | PASS | BUG-0080, ITEM-0072 | PASS | INTEGRATED |

## WP-01 — the lockout weapon, removed

[[ITEM-0069]] carries the full reasoning. In short: the public discovery
endpoint counted its failures against the **credential** lock, so twenty
unauthenticated requests locked a known address out of every workspace for an
hour. Anybody could run it against anybody.

The counter could not be removed — discovery has no tenant, so without one it is
unlimited guessing the per-tenant lockout never sees — and it could not move to
the request, because counting per address is defeated by rotating addresses.

**So the fix is separation.** `Identity.discoveryFailedAttempts` and
`discoveryBlockedUntil`, 10 attempts and 15 minutes. Exhausting it blocks
discovery; the credential lock is untouched, so the victim still signs in at
their workspace URL.

The residual harm is stated rather than waved away: a stranger can still cost
one address its generic login screen for fifteen minutes. That is a different
order of thing from losing the product.

Mutation-checked by putting the weapon back — reinstating
`registerIdentityFailure` in discovery's path fails the test that names it.

## WP-02 — consent starts being recorded

`npm run release:api` now ends with `seed:legal && legal:publish -- --confirm`,
so a deployment publishes the ten legal documents rather than leaving it to
somebody to remember. Until this, a purchase recorded **no consent at all** — the
wizard requires only agreements carrying a published version, and there were
none.

Proven against a real database: the release command publishes ten, and a second
run publishes zero and archives zero. A redeploy is a no-op, which matters
because Render runs `preDeployCommand` on every deploy.

**Two assertions had to be inverted, and that is the third time in this
programme.** `legal-seed` asserted *nothing* was published, and
`legal-documents` asserted `resolvePublished` returned null. Both were correct
while publication was a decision nobody had taken; both became false the moment
the release command took it.

Deleting them would have removed real protection. What they actually guard is
narrower and still true:

- **seeding is not publishing** — asserted now as a delta rather than an
  absolute: run the seed again and the published count must not move;
- **a draft is never served** — asserted against a document the test owns,
  rather than against an empty table.

The suites now pass in **both** shapes: a database where the release command has
published, and one where it has not. That is what makes them invariants rather
than fixtures tuned to one environment.

## WP-03 — the schedule arrived

The owner supplied a complete price schedule on 2026-08-20: three markets, two
billing models, both cycles, with minimum seat commitments and flat overage
rates. Implemented as WP-08.

**Checked for internal consistency before a line of it was written down.** Every
annual figure is exactly ten times its monthly figure, and every stated minimum
charge equals `minimumSeats × seat rate`, across all three currencies and both
cycles. The schedule agrees with itself, which is not something to assume of a
table with 54 numbers in it.

## WP-05 — a reachability claim that was wrong

This package exists because verifying **A-03** falsified the claim sitting next
to it. The false part was not a slip in this task's summary: it was written into
[[BUG-0052]] on 2026-08-17 and had been carried as settled ever since.

The record said `xlsx` was "export, so it writes workbooks rather than parsing
untrusted ones". The file it cited,
`services/api/src/common/excel/excel-export.service.ts`, did both. Its
`parseFirstWorksheet` called `XLSX.read` on an uploaded buffer, and two
authenticated endpoints handed it one:

- payroll payment-result import — `payroll-operations.service.ts`;
- timesheet import — `timesheets.service.ts`.

Both `xlsx` advisories are parse-side. The one input the disposition assumed
could never arrive was exactly what those two endpoints accept.

**The reachability check had looked at the file's name.** `excel-export.service`
does export, and it also did import, and only the call sites would have said so.
That is the same failure shape as `assertion-without-a-check`: something was
asserted from a plausible proxy rather than from the thing itself.

Authentication is why this is not a critical — an attacker needs a tenant account
with import rights. It is not a reason to ship it. A tenant user is not a trusted
party in a multi-tenant product, and prototype pollution in a shared Node process
does not stay inside the tenant that caused it.

### The fix

Parsing moved to **ExcelJS** — already a dependency, already doing this exact job
in `import-analysis.service.ts`, and maintained, which the registry copy of
`xlsx` is not. There is now **no `XLSX.read` call site anywhere in the
repository**, verified by search across `services`, `apps`, `packages` and
`scripts`.

Cell flattening had to be written by hand, because ExcelJS returns objects where
SheetJS returned primitives: a formula cell is `{ formula, result }`, a hyperlink
is `{ text, hyperlink }`, rich text is `{ richText: [...] }`. Passing those
through `String()` yields `[object Object]`, which would land in an imported
payroll row looking like something a person typed. A formula cell now imports its
**result**, not `=SUM(A1:A9)`.

Proven by round trip: `payroll-export.providers.spec.ts` writes a workbook with
SheetJS and reads it back with ExcelJS, asserting the row values and the total
survive the crossing. That is the compatibility evidence for the swap.

### What was deliberately not done

Writing still uses SheetJS, so the package is still installed and `npm audit`
still reports the two highs — **present but unreachable** rather than accepted as
reachable.

Removing it entirely means moving `buildWorkbookBuffer` to ExcelJS, which changes
the bytes of every generated workbook. Payroll exports are consumed by banks,
which reject files for formatting the exporter cannot see. Doing that in the same
release that first meets paying customers trades a real customer-visible risk for
the removal of an advisory with no call site. Carried by [[ITEM-0070]], with the
verification it actually needs — a golden-file diff, not a round trip, because a
round trip only proves the writer and reader agree with each other.

## WP-06 — the first-deploy dry run

Every prior task validated code. Nothing had ever run **the actual deployment
command against an empty database**, which is what a production launch is.

So that is what this package did: create a throwaway database, apply all 216
migrations from zero, and run `npm --workspace api run release` — the literal
`preDeployCommand` from `render.yaml`. It found two defects, one of which would
have stopped the launch outright.

### It aborted — [[BUG-0085]]

```text
> api@0.0.1 seed:admin
PLATFORM_SUPER_ADMIN_EMAIL is required.
npm error Lifecycle script `release` failed with error: code 1
```

`seed:admin` requires that variable and `render.yaml` never declared it, so the
first deploy of a new environment fails in `preDeployCommand`. And because
`seed:admin` sits *before* `seed:legal` and `legal:publish`, the abort would also
have suppressed WP-02 — an environment that failed here would have had no
published legal documents, so a purchase would still have recorded no consent.
The work of WP-02 was real; it just could never have run.

Setting the variable then revealed the second half. The upsert wrote
`passwordHash` in its `update` branch, so **every deploy reset the super admin's
password** to the dashboard value. Proven rather than read:

```text
before: $2b$12$nyZMFbE7d.yPW
after:  $2b$12$17uYhjdHW2gTa
VERDICT: password OVERWRITTEN by redeploy
```

The two available configurations were "every deploy fails" and "every deploy
silently reverts the super admin's credential" — including a credential rotated
*because it leaked*. There was no third one.

**CI could not have caught this.** `ci.yml` sets both variables against a fresh
database, so it only ever exercised the create path. The defect lived entirely
where CI does not go, which is why it survived to the eve of a release.

Fixed by extracting the decision into a pure, tested function
(`admin-seed.util.ts`) under one rule: **a deploy never modifies an existing
platform user unless explicitly told to.** Re-activation was deliberately left
out of the default path — restoring role and status on every deploy would
silently undo the suspension of a compromised account.

Redeploy is now verified idempotent end to end: 216 migrations applied, 10 legal
documents published on the first run, `published: 0, alreadyPublished: 10,
skipped: 0` on the second.

### The schema promises constraints the database will not keep — [[BUG-0084]]

Diffing the from-empty database against `schema.prisma` gives 195 statements.
Almost all of it is cosmetic — 55 index renames, 54 foreign-key renames, 17
default changes, and no `DROP TABLE`, `DROP COLUMN` or `SET NOT NULL` anywhere.

But 53 indexes are declared and absent, and **seven of those are UNIQUE**.
Confirmed against `pg_index`, not inferred from the diff.

My first reading of the consequence was wrong and is worth recording. I expected
`supportCaseIncident.upsert` to fail outright, since Postgres rejects
`ON CONFLICT` with no matching constraint. A query-log probe shows Prisma
emitting `SELECT` then `INSERT` instead, so it does not fail — it silently
degrades to a read-then-write race. Checking beat reasoning, again.

**Deferred, not fixed.** It is pre-existing, identical on `main`, and nothing is
broken today. Adding unique indexes is trivial on an empty database and can abort
a deployment on a populated one, so doing it alongside 216 migrations and a first
production deploy would leave a failure with too many candidate causes. It should
be the first migration *after* launch.

## WP-04 — the readiness verdict

Assessed against [`docs/deployment/readiness-checklist.md`](../deployment/readiness-checklist.md).

**Verdict: `READY_WITH_RISKS` for the platform, `NOT_READY` for the commercial
surface.** The two are separable and the distinction is the whole finding.

The verdict has survived two revisions and the reason has narrowed each time:
first the blocker was a missing price list (WP-03), then — once the schedule
arrived — it became the absence of any Stripe-synced price and unverified PKR
and QAR presentment. The software has been in good shape throughout.

| Gate | Result |
|---|---|
| Git | PASS — `16fcaa3`, pushed, clean tree, `agent/*` → `develop` policy satisfied |
| Architecture | PASS — database → API → frontends; gateway and desktop agent contracts unchanged |
| QA | PASS — 189/189 unit suites (1446 tests), 33/33 e2e suites (369 tests) against a database built from all 216 migrations |
| Reviewer | PASS — **re-derived after WP-07**; see below |
| Database | PASS — see below |
| Configuration | PASS — 12 new variables, 4 needing dashboard values, all now declared in `render.yaml` |
| Build | PASS — all six workspaces |
| Smoke plan | **NOT_OBSERVED** — `smoke:deployment` runs against a deployed URL and nothing is deployed |

### The Reviewer gate had to be re-derived

The first pass recorded *"0 unresolved CRITICAL"*. That was true of the
**records**, and the records were wrong.

WP-07's new check found [[BUG-0005]] — a CRITICAL cross-tenant error-log read —
carrying `Status: VERIFIED` above a QA Retest section reading *"Pending WP-03
retest of the expanded regression cases."* Had that prose been the accurate half,
this release would have shipped with an unverified CRITICAL tenant-isolation
defect, counted as closed.

It was the stale half: the expanded cases exist and pass. But **the verdict was
right by luck rather than by evidence**, which is not a distinction a release
assessment is allowed to blur. It now rests on executed tests:

| Record | Was | Now |
|---|---|---|
| [[BUG-0005]] CRITICAL | `VERIFIED` on stale prose | `VERIFIED` on 10 executed tests, including a support user denied a platform-scope log in both `null` and `'platform'` shapes |
| [[BUG-0009]] | `VERIFIED` on a source-shape assertion | `VERIFIED` on 7 behavioural tests, mutation-proven |
| [[BUG-0010]] | `VERIFIED` on a source-shape assertion | same |

0 unresolved CRITICAL, and now it is a measurement.

### The database gate, in detail

16 migrations. **Zero destructive statements** — no `DROP TABLE`, `DROP COLUMN`,
`DROP TYPE`, `SET NOT NULL` or type narrowing anywhere in the set. Fifteen are
`DATABASE_ADDITIVE`; one, the identity backfill, is `DATA_MIGRATION`.

Rollback classification: **`ROLLBACK_SAFE`**, with the backfill
`FORWARD_FIX_PREFERRED`. What makes the code rollback safe is the decision taken
in TASK-0009 to **hold the contract phase**: `User.identityId` is still nullable,
so an older build simply ignores a column it does not know about. Had
`identityId NOT NULL` shipped in this release, rolling back would have left old
code unable to create users at all.

The backfill was tested against **populated** data, not just an empty database:
four users across two tenants with the same address in three spellings produced
two identities, deduped across case and whitespace, with the credential taken
from the most recently used account and lockout counters carried forward as the
maximum. Zero users left unlinked. Its `RAISE EXCEPTION` guard was
mutation-tested by breaking the invariant, and it fired.

### Risks accepted to reach `READY_WITH_RISKS`

1. **[[BUG-0052]]** — `xlsx` advisories present but unreachable after WP-05; the
   `tar` critical reaches only the Electron agent, verified. Owner-accepted.
2. **[[BUG-0084]]** — seven unique constraints declared and absent. Nothing is
   broken today; deferred to the first post-launch migration.
3. **No staging environment.** This release's first contact with a real Render
   environment is production. Mitigated as far as it can be by running the
   actual `preDeployCommand` end to end against a virgin database — which is
   what found [[BUG-0085]] — but a dry run on a laptop is not a deploy.

### Why the commercial surface is still `NOT_READY` — and the reason has changed

**This section was rewritten on 2026-08-20 after WP-08.** It previously said the
blocker was WP-03: no real prices. That is resolved — the owner supplied a
complete schedule, it is seeded, and its arithmetic is verified.

What blocks now is narrower and entirely external:

**No price is synced to Stripe.** All 36 carry `stripeSyncStatus = NOT_SYNCED`,
`stripeActive = false`, and no `stripePriceId`. `deriveCheckoutReadiness`
therefore refuses every one, so **nothing can be bought yet** — the schedule is
live in the database and the commercial surface is closed until somebody performs
the deliberate act of syncing a price. That is the correct default and it is why
seeding real numbers is safe.

**Stripe presentment for PKR and QAR is unverified.** Nothing in this repository
can establish it; it depends on the live account. If either currency is
unsupported, that market cannot take self-service payment. It fails safely —
`deriveCheckoutReadiness` renders it as "checkout not available" rather than a
wrong charge — but a market that cannot take money is not launched.

So the platform is deployable and the commercial surface is one owner action and
one external confirmation away.

It is also worth being exact about what is *not* wrong here, because this task
got it wrong once and put a settled question back to the owner: the billing model
disagreement of [[BUG-0080]] was genuinely fixed in `e9f977c`, and when the owner
changed the model later the same day the Terms were rewritten in the same change.
Code and words have not been out of step since.

## WP-08 — two billing models, and the channel decides

The owner's decision: **per active employee** on the public site and
self-service checkout, **flat per plan** only when a salesperson arranges it.
Full reasoning and the verified schedule are in
[`EXECPLAN-0002`](../plans/EXECPLAN-0002-per-seat-public-pricing-with-sales-assisted-flat.md).

Four things the system did not have:

1. **Two models could not coexist.** The active-price uniqueness key was
   `(planId, marketId, billingCycle, currency)` — `billingModel` was not in it,
   so a plan held one price per slot. The key now includes it. Strictly more
   permissive, so no existing row can be rejected.
2. **Overage had no price.** The seat engine has measured overage since it
   landed and had nowhere to say what an extra employee costs, so a flat plan
   could exceed its allowance and never be billed. `PlanPrice.overageUnitAmount`,
   nullable — and null on every per-seat row, because there is no "above
   included" when every seat is billed.
3. **Qatar was not a market.** Pakistan defaulted to USD; Qatar sat inside a
   disabled GCC market. Now PK/PKR, QA/QAR and INTL/USD are launched; US and GCC
   stay planned and disabled, so nothing that was closed silently opened.
4. **Enterprise+ did not exist.** Added as `CUSTOM_ONLY`, carrying **no price** —
   which is what makes the resolver answer `CUSTOM_CONTRACT_ONLY` instead of
   quoting a figure.

### The defect this package existed to prevent

`resolveCommercialOffer` filtered candidate prices by plan, market, currency and
interval — **not by sales model** — then let `selectEffectivePrice` pick the most
recently effective one, and only *then* refused if that one was sales-assisted.

Both prices are seeded in the same run, milliseconds apart. So which model a
visitor was offered came down to insertion order, and when the flat row won the
answer was `SALES_ASSISTED_ONLY` — **the plan vanished from public sale**, for a
reason invisible in the data.

Filtering now happens before selection. The regression asserts **both orderings**
deliberately: a test fixing one would have passed against the defect half the
time, which is worse than no test. Mutation-proven — restoring select-then-check
fails 4 tests.

### Two more found while building it

**The minimum seat commitment was a refusal, not a charge.** The resolver
returned `SEATS_BELOW_MINIMUM` for a buyer wanting fewer seats than the plan's
minimum. The owner's rule is the opposite — *"applies even when the customer has
fewer active employees"* — and the published Minimum Monthly Charge table only
means anything if such a customer can buy. Now billed at `max(quantity,
minimumSeats)`, with `quantity` still reported so a page can say "6 employees,
billed at the 10-seat minimum" rather than silently changing the number somebody
typed.

**The landing estimate disagreed with the server.** `estimateCost` ignored
`minimumSeats` entirely, so a six-person Starter customer would have been quoted
PKR 1,800 and charged PKR 3,000. That is the same shape as [[BUG-0080]] — a page
and an invoice disagreeing — and it nearly recurred because the arithmetic lives
in two places and only one of them was changed when the rule did.

### Verified against a real database

- 36 prices seeded across three markets; every Pakistan figure matches the
  owner's table exactly.
- Re-running the seed creates **0** and reports 36 slots already served.
- The migration moves country `QA` from GCC to Qatar and is a no-op on a second
  run — proven by putting it back and replaying.
- Enterprise+ carries 0 prices and `CUSTOM_ONLY`.
- The published Terms now describe per-seat self-service with flat by
  arrangement.

`api` 1468 unit tests and 369 e2e; `landing` 111; `admin` 108.

**One caveat worth stating plainly:** an e2e run failed five suites mid-way with
*"the database system is in recovery mode"* — PostgreSQL crashed and restarted.
Re-running on a healthy server gave 33/33 and 369/369. The failures were the
crash, established by re-running rather than assumed.

### Recorded, not fixed

[[ITEM-0072]] — a database built from migrations alone carries six active,
published, self-service, market-less prices at `0.00`, created by a 2026-04-10
plan insert feeding a 2026-05-23 legacy backfill. Not exploitable, but it fires
twelve spurious warnings on every seed, and a warning that always fires is one
people stop reading.

### Still blocking a sale

**Stripe presentment for PKR and QAR is unverified.** Nothing in this repository
can establish it. If either is unsupported on the live account, that market
cannot take self-service payment — and `deriveCheckoutReadiness` renders that as
"checkout not available" rather than a wrong charge, which is the right failure
but still a failure.


## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `preDeployCommand` runs `npm --workspace api run release` on every deploy, so wiring publication there is sufficient and repeatable | `render.yaml:8` | HIGH | Legal stays unpublished and purchases keep recording no consent |
| A-02 | The additive discovery-throttle migration is safe alongside TASK-0009's expand and backfill in one release | Columns are new, defaulted, and on a table this same release creates | HIGH | A failed production migration |
| A-03 | BUG-0052's **critical** advisory (`tar`, via `active-win`) reaches only the Electron desktop agent, not the deployed API | **Verified.** `active-win` is imported only by `apps/agent-desktop/src/main/activity-tracker.ts`; the `tar`/`node-gyp` chain beneath it is install-time native-build tooling that is not packaged | HIGH | The release accepts a risk it has mischaracterised |
| A-04 | ~~BUG-0052's `xlsx` highs are export-only and therefore unreachable~~ | **FALSIFIED.** `parseFirstWorksheet` called `XLSX.read` on buffers from two authenticated upload endpoints. Fixed in WP-05 rather than accepted | — | It was wrong, and the release would have accepted a reachable high on a tenant-facing upload path |

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `95551bc`.

## History

- 2026-08-20 — created at `95551bc`, after TASK-0009 integrated. Four owner
  decisions taken before any work started.
- 2026-08-20 — WP-01 and WP-02 done. WP-03 blocked on the price list.
- 2026-08-20 — WP-08: the owner supplied the price schedule and changed the
  model — per-seat public, flat sales-assisted. Both now coexist per plan, and
  the channel decides. Building it found a millisecond race that could have
  removed a plan from public sale, a minimum commitment implemented as a refusal
  rather than a charge, and a landing estimate that disagreed with the server.
- 2026-08-20 — WP-07: [[ITEM-0071]] built and immediately useful. Three more
  records claimed `VERIFIED` above prose saying otherwise, one of them a
  CRITICAL. Two turned out to be genuine gaps covered only by source-shape
  assertions; both now have behavioural, mutation-proven tests.
- 2026-08-20 — WP-04: readiness assessed. `READY_WITH_RISKS` for the platform,
  `NOT_READY` for the commercial surface, which is blocked on WP-03 alone. The
  owner chose to hold the merge until pricing is settled, so `main` is untouched.
- 2026-08-20 — a self-inflicted detour worth recording. [[BUG-0080]] carried
  `Status: FIXED` above a Resolution reading *"Pending a product decision"*. The
  prose was believed, the record was reversed, `commercial-bootstrap.ts` was
  changed from `FLAT` to `PER_SEAT`, the seeded prices were zeroed, and the owner
  was asked to settle a question `e9f977c` had settled the same day. All reverted
  once `seed-legal.ts` was read directly. Filed as [[ITEM-0071]]: a record whose
  status and prose disagree should fail validation, not puzzle a reader.
- 2026-08-20 — WP-06: the release command was run against a database built from
  all 216 migrations, for the first time. It aborted. Two defects recorded and
  one fixed; redeploy now verified idempotent end to end.
- 2026-08-20 — WP-05: verifying A-03 falsified the neighbouring claim. The
  `xlsx` parse path was reachable from two authenticated uploads and is now
  on ExcelJS. BUG-0052's 2026-08-17 reachability finding corrected in place.

## Task Finalization

```
PRE_TASK_REPO_HEALTH            PASS at 95551bc
SESSION_STATUS                  SESSION-0022 ACTIVE
PARENT_TASK_STATUS              TASK-0010, 8 work packages
WORK_PACKAGE_STATUS             7 DONE, WP-04 BLOCKED on the owner
REQUIRED_AGENTS_STATUS          PASS
IMPLEMENTATION_STATUS           DONE
LOCAL_VALIDATION_STATUS         PASS  api 190/190 suites 1468 tests; e2e 33/33 369
                                tests; landing 111; admin 108; framework 2933
QA_STATUS                       PASS
QA_FINDINGS_CLASSIFIED_STATUS   PASS  BUG-0084 DEFER, BUG-0085 FIX_NOW,
                                ITEM-0070/0072 DEFER, ITEM-0071 DONE
QA_SCENARIO_PROMOTION_STATUS    DONE  QA-DEPLOY-017, QA-BILLING-011
BUG_RECORD_STATUS               DONE  BUG-0084, BUG-0085 created; 0005/0009/0010
                                and 0080 corrected
ARCHITECT_TRIAGE_STATUS         DONE  nothing left TRIAGE_REQUIRED
BACKLOG_UPDATE_STATUS           DONE  154 records, indexes current
REVIEW_STATUS                   PASS
PR_STATUS                       NOT_REQUIRED — develop needs no PR
REMOTE_CI_STATUS                PASS on 97b4cc5, run 32389007332
MERGE_STATUS                    DONE — fast-forward, no merge commit
DEVELOP_INTEGRATION_STATUS      DONE — origin/develop = 97b4cc5
DEVELOP_SYNC_STATUS             SYNCED at origin; the primary worktree's local
                                develop is 12 behind and deliberately untouched
POST_MERGE_VALIDATION_STATUS    PASS — develop's tip IS the CI-verified SHA, so
                                the pre-merge evidence applies to it unchanged
MAIN_SYNC_STATUS                SYNCED
MAIN_CHANGE_STATUS              UNTOUCHED (baseline b90f33e)
POST_TASK_REPO_HEALTH           PASS
PRIMARY_WORKTREE_STATUS         CLEAN
TASK_WORKTREE_STATUS            CLEAN
UNEXPLAINED_DIRTY_FILES         0
POST_INTEGRATION_GENERATOR_STATUS  PASS — backlog, tasks, QA, dashboards current
DATABASE_COHERENCE_STATUS       PASS — 217 migrations from empty; drift unchanged
                                at 195 pre-existing statements, none introduced
DEPLOYMENT_STATUS               NOT_REQUIRED — the owner holds the merge to main
DEPLOYMENT_DRIFT_STATUS         NOT_REQUIRED — nothing deployed
ENGINEERING_HISTORY_STATUS      PENDING — written when WP-04 closes
FEEDBACK_PROMOTION_STATUS       DONE — ITEM-0071 promotes the correction that a
                                record's status and prose may not disagree
KNOWLEDGE_CAPTURE_STATUS        DONE — EXECPLAN-0002, REG-079, REG-080
OBSIDIAN_SYNC_STATUS            SKIPPED_NO_LOCAL_CONFIG
CONTROL_CENTER_STATUS           PASS
CLEANUP_STATUS                  DONE — every throwaway database created by this
                                task dropped; other sessions' left alone
```

**The task is not COMPLETE.** WP-04 — the PR to `main` — is blocked on two owner
actions: confirming Stripe presents PKR and QAR, and releasing the merge hold.
Both are stated in
[`first-production-launch.md`](../deployment/first-production-launch.md).

`DEVELOP_SYNC_STATUS` deserves its qualification rather than a bare `SYNCED`.
`origin/develop` is exactly the SHA CI verified, which is what the contract is
about. The **local** `develop` ref lags by 12 commits because it is checked out
in the user's primary worktree, and fast-forwarding it would rewrite files under
whatever they have open. That is theirs to pull, not mine to do.


---

## Closure — 2026-08-24

Updated by SESSION-0047. WP-04 was `BLOCKED` on two owner actions: confirming
Stripe presents PKR and QAR, and releasing the merge hold on `main`.

**The merge hold is discharged.** `origin/main` is at `7d91c8a` and contains
every commit on `origin/develop` bar one documentation commit. The PR to `main`
that WP-04 was waiting to open was overtaken by the release tasks that ran after
it — the release happened, repeatedly, and this record simply never learned. The
package is marked `DONE` against that state rather than against a PR this
session opened.

**Stripe presentment is still unconfirmed, and is not being closed here.**
`docs/deployment/first-production-launch.md` calls it "the one thing that cannot
be checked from here", and that remains true: it depends on the live Stripe
account's supported presentment currencies, which no agent in this repository
has credentials to read. It is tracked as **BUG-0903** (HIGH, `OPEN`,
`BLOCKED_EXTERNAL`) — a triaged owner action, not an unfinished package. Marking
WP-04 `DONE` closes the *package*; it does not assert the currencies work.

That distinction is the reason WP-04 is not simply deleted. The readiness
verdict it recorded — `READY_WITH_RISKS` for the platform, `NOT_READY` for the
commercial surface — is still the honest summary, and the commercial half is
still gated by the five `BLOCKED_EXTERNAL` production records raised on
2026-08-23: BUG-0898, BUG-0903, BUG-0904, BUG-0905 and BUG-0989.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0005]], [[BUG-0009]], [[BUG-0010]], [[BUG-0052]], [[BUG-0080]], [[BUG-0084]], [[BUG-0085]], [[BUG-0898]], [[BUG-0903]], [[BUG-0904]], [[BUG-0905]], [[BUG-0989]], [[ITEM-0069]], [[ITEM-0070]], [[ITEM-0071]], [[ITEM-0072]]
- Modules — [[auth]], [[legal]], [[billing]]

<!-- GRAPH:END -->
