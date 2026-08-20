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
COMPLETED_PACKAGES: [WP-01, WP-02, WP-05, WP-06]
BLOCKED_PACKAGES: [WP-03, WP-04]
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
| WP-04 | Release readiness assessment and the PR to `main` | BLOCKED | WP-01..WP-03, WP-05, WP-06 | Release/DevOps, Reviewer, Integrator | agent/go-live-readiness | — | — | — | — | — |
| WP-05 | The xlsx parse path, off an advisory that was reachable after all | DONE | — | Backend/API, Security | agent/go-live-readiness | pending | PASS | BUG-0052, ITEM-0070 | NOT_RUN | NOT_STARTED |
| WP-06 | The first-deploy dry run, and the two defects it found | DONE | — | Release/DevOps, Database, QA | agent/go-live-readiness | pending | PASS | BUG-0084, BUG-0085 | NOT_RUN | NOT_STARTED |

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
surface.** The two are separable and the distinction is the whole finding — the
software is in good shape; what is missing is a price list.

| Gate | Result |
|---|---|
| Git | PASS — `16fcaa3`, pushed, clean tree, `agent/*` → `develop` policy satisfied |
| Architecture | PASS — database → API → frontends; gateway and desktop agent contracts unchanged |
| QA | PASS — 189/189 unit suites (1446 tests), 33/33 e2e suites (369 tests) against a database built from all 216 migrations |
| Reviewer | PASS — 0 unresolved CRITICAL; every open HIGH is `FIXED` awaiting verification, `DEFERRED` with reasoning, or owner-accepted |
| Database | PASS — see below |
| Configuration | PASS — 12 new variables, 4 needing dashboard values, all now declared in `render.yaml` |
| Build | PASS — all six workspaces |
| Smoke plan | **NOT_OBSERVED** — `smoke:deployment` runs against a deployed URL and nothing is deployed |

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

### Why the commercial surface is `NOT_READY`

WP-03. The seeded prices are USD figures chosen for testing, Qatar has none, and
the owner asked to supply real ones. Nothing else blocks; this alone does.

It is worth being exact about what is *not* wrong here, because this task got it
wrong once: billing is **flat per plan**, the Terms say flat, and [[BUG-0080]]
was fixed on 2026-08-20 in `e9f977c`. The remaining question is the numbers, not
the model.

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

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0052]], [[BUG-0080]], [[BUG-0084]], [[BUG-0085]], [[ITEM-0069]], [[ITEM-0070]], [[ITEM-0071]]
- Modules — [[legal]], [[billing]]

<!-- GRAPH:END -->
