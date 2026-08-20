---
TASK_ID: TASK-0010
aliases: [TASK-0010]
TITLE: Go-live readiness
TYPE: FEATURE
SIZE: MEDIUM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-20
AFFECTED_MODULES: [auth, users, legal, billing]
AGENTS: [Architect, Backend/API, Database, Security, QA, Reviewer, Integrator]
DEPENDENCIES: origin/develop 95551bc; TASK-0009
CURRENT_PACKAGE: WP-03
COMPLETED_PACKAGES: [WP-01, WP-02]
BLOCKED_PACKAGES: [WP-03]
OWNER_DECISIONS: 4
FINAL_STATUS:
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
| WP-01 | ITEM-0069 — discovery throttle, decoupled from the credential lock | DONE | — | Backend/API, Database, Security | agent/go-live-readiness | pending | PASS | ITEM-0069 | NOT_RUN | NOT_STARTED |
| WP-02 | Legal publication wired into the release command | DONE | — | Backend/API | agent/go-live-readiness | pending | PASS | — | NOT_RUN | NOT_STARTED |
| WP-03 | Real prices for every launched market | BLOCKED | owner | Backend/API | agent/go-live-readiness | — | — | — | — | — |
| WP-04 | Release readiness assessment and the PR to `main` | NOT_STARTED | WP-01..WP-03 | Release/DevOps, Reviewer, Integrator | agent/go-live-readiness | — | — | — | — | — |

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

## WP-03 — blocked on the owner

OD-01 was answered *"give me the real prices"*, and the numbers have not arrived.
Nothing ships to a market without them: the seeded PKR schedule was invented for
testing, and Qatar has none at all.

Needed, per plan and per market — monthly price, annual price, and confirmation
that flat billing still holds for every plan.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `preDeployCommand` runs `npm --workspace api run release` on every deploy, so wiring publication there is sufficient and repeatable | `render.yaml:8` | HIGH | Legal stays unpublished and purchases keep recording no consent |
| A-02 | The additive discovery-throttle migration is safe alongside TASK-0009's expand and backfill in one release | Columns are new, defaulted, and on a table this same release creates | HIGH | A failed production migration |
| A-03 | BUG-0052's critical advisory reaches only the Electron desktop agent, not the deployed API | To be verified in WP-04 before the release record accepts it | MEDIUM | The release accepts a risk it has mischaracterised |

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `95551bc`.

## History

- 2026-08-20 — created at `95551bc`, after TASK-0009 integrated. Four owner
  decisions taken before any work started.
- 2026-08-20 — WP-01 and WP-02 done. WP-03 blocked on the price list.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0052]], [[ITEM-0069]]
- Modules — [[legal]], [[billing]]

<!-- GRAPH:END -->
