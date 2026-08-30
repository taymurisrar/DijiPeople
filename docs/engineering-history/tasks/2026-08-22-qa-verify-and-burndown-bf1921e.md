# Engineering History — QA verification and backlog burn-down

> **Session:** SESSION-0040 · **Branch:** `agent/qa-verify-and-burndown`
> **Integrated at:** `bf1921e` · **Gate:** green on the exact SHA
> **`main`:** untouched at `3602ec3`

## What was asked

"Fix all the bugs, I want the backlog to completed. You have all my permission.
Dont stop for anything" — then, across three later turns: verify all 49 FIXED
bugs, type the lint debt properly module by module, take the three FIX_NOW test
gaps, explain why the Obsidian graph looks the way it does, and decide eight
records that had been waiting on a product call.

## What landed

| | |
|---|---|
| Bugs raised and fixed | BUG-0627, BUG-0668, BUG-0669, BUG-0223, BUG-0163 |
| Bugs raised, awaiting approval | BUG-0714 |
| Items closed | ITEM-0002, ITEM-0003, ITEM-0004, ITEM-0032, ITEM-0042, ITEM-0053*, ITEM-0057 |
| Items raised | ITEM-0079, ITEM-0080, ITEM-0081, ITEM-0082 |
| Regressions | REG-220 … REG-226 |
| QA scenarios | QA-TENANT-015, QA-PROV-005, QA-SETTINGS-003/004, QA-BILLING-013, QA-CI-004 |
| Test plans | PLAN-021 created; PLAN-001, PLAN-003, PLAN-007 reviewed |

\* ITEM-0053's premise corrected rather than its work done — see below.

Final counts: **120 bugs VERIFIED, 0 OPEN, 0 FIXED-but-unverified.**

## The thread that ran through all of it

Almost every defect found this session was an **assertion that could not fail**,
and finding them followed one method: write the proof first, and watch what it
says.

- [[ITEM-0002]] asked for a live proof of admin sign-out. The proof failed on its
  first run. `AuthService.logout` keyed revocation on the refresh cookie — the
  shortest-lived of the three — so the sign-out that follows a session-expired
  modal cleared the browser and left the session live for up to seven days. That
  is [[BUG-0627]]. The item was a test gap hiding a defect.
- [[ITEM-0042]] was 989 lint warnings nobody read. Deciding the seventeen unused
  variables one at a time instead of prefixing them with `_` found two real
  defects — [[BUG-0668]], an exchange-rate resolver that accepted an
  `effectiveDate` and never queried it, and [[BUG-0669]], a validation DTO that
  was never wired to its handler.
- Removing eight `(this.prisma as any)` casts from the leave module took it from
  114 warnings to zero **and** made the compiler report four real type errors the
  casts had been hiding. None was found by reading; each was found by deleting a
  cast.

## Three things I got wrong, and how they were caught

**A negative test that could not fail.** The first scope test for [[BUG-0627]]
signed out as `web` using an *admin* session id and asserted the platform token
survived. It passes whatever the filter says — the two clients use different
tables — and it stayed green with `appClientId` deleted from production code. The
mutation probe is what exposed it. Rewritten to use two rows in the same table.

**`[[REG-nnn]]` never resolves**, and I wrote sixteen of them across ten files
after that lesson was already recorded. `validate-framework.mjs` had been
*skipping* REG targets on the assumption they resolved through frontmatter
aliases like every other record type. The regression register is one file with a
heading per regression, so there is nothing for an alias to live on. The
exemption is gone; it is now an error with its own mutation-tested check, and it
caught me making the same mistake again twenty minutes later.

**A generator that manufactured broken links.** The first version of the backlog
graph block emitted `RelatedImplementation` unconditionally and produced 53 dead
wikilinks in one run. Existence turned out not to be enough either: a note under
`docs/development` exists and never reaches the vault, so the check now asks
`DEFAULT_MAPPINGS` whether the path publishes at all.

## The Obsidian graph

The user said it "looks horrible" and that bugs had no link to what they belong
to. Measured rather than argued with:

| | Before | After |
|---|---|---|
| Bug records whose related item existed only in frontmatter | 102 of 125 | 0 |
| Bugs with no link to their module | 66 of 125 | 2 |
| Items with no module link | 49 of 80 | 6 |

`rebuild-qa.mjs` has projected frontmatter into wikilinks since 2026-08-18;
`rebuild-backlog.mjs` never did. The note lookup also read only
`docs/knowledge/modules`, which left the four product surfaces unlinked — 57
records name `apps/admin`, 38 `apps/landing` — while every one of those notes
already existed under `docs/knowledge/architecture`.

## CI, and being able to hear it

The user's observation was that the agent "is unable to listen [for the] CI
response when it has responded", and it was accurate twice in one session.

`gh run list` is a snapshot, so the only pattern it supports is *look, see
`in_progress`, say "CI is running", remember to look again*. `scripts/await-ci.mjs`
blocks until every run for a SHA reaches a terminal state, so it can run
backgrounded and produce a notification.

Then I broke the rule it exists around: pushed `9261fae` while `a82f56d` was
still building and cancelled it. The script reported that as `FAILED` with five
`x cancelled` job lines, which reads like a broken build and is not one.
Cancelled runs on a commit the branch has moved past now report `SUPERSEDED`.

## Production, read rather than assumed

The user granted access to Vercel, Render and Neon. Reading the **live**
configuration rather than the examples found [[BUG-0714]]: `WEB_APP_URL` is still
the `vercel.app` host, so every activation and invitation link the API mails
points there; `API_BASE_URL` is plain HTTP beside a correct HTTPS `API_ORIGIN`;
and the per-tenant subdomain rewrite never fires because it reads
`WEB_APP_PROD_ROOT_DOMAIN` while `TENANT_BASE_DOMAIN` is what is set. Two
variables for one concept.

Reading production data also **closed** [[ITEM-0032]] and **corrected** my own
write-up of [[BUG-0714]]. There are zero `ActivityEvent`, `WorkSession` and
`DailyProductivitySummary` rows, so the corrective migration that item was
weighing would operate on nothing; and all three tenants are `INACTIVE`/"Pending
payment", so no customer has yet received a wrong link. I had written that one as
happening now.

[[ITEM-0053]] was corrected the same way. Its premise — "no legal copy exists in
the repository" — was five days stale. Ten documents are drafted, the
DRAFT/PUBLISHED model exists, `/legal/privacy` is live saying "drafted but has
not been published", and the release script already publishes them. Production
returns `{"documents":[]}` because it is on `3602ec3`, which predates the module.
It needs a deploy, not legal text.

## What is still open

- **[[BUG-0714]]** — four production environment writes, awaiting approval.
- **[[ITEM-0062]]** — WP-09, the contract migration, needs its own release.
- **[[ITEM-0076]]**, **[[ITEM-0079]]** — options presented, decision pending.
- **[[ITEM-0081]]** — nine test plans still `NEEDS_REVIEW` against `714632d`.
- **[[ITEM-0080]]** — 800 lint warnings, one family, method proven on `leave`.
- The Neon credential the user pasted in chat still needs rotating.

## Verification

```
Remote CI gate            PASS on bf1921e — 14 jobs + gate
npx jest (services/api)   208 suites, 1653 tests
eslint --max-warnings=805 0 errors, 800 warnings
validate:framework        3495 checks
knowledge:verify          PASS — 649 nodes, 0 graph orphans
backlog:check / qa:check  208 records · 21 plans, 164 scenarios
repo:health               PASS — main UNTOUCHED, develop SYNCED, 0 dirty
npm ci (isolated)         1622 packages, exit 0
```

Database-backed suites ran against a throwaway PostgreSQL migrated from
`schema.prisma`. The populated development database was never touched.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0163]] · [[BUG-0223]] · [[BUG-0627]] · [[BUG-0668]] · [[BUG-0669]] · [[BUG-0714]] · [[ITEM-0002]] · [[ITEM-0003]] · [[ITEM-0004]] · [[ITEM-0032]] · [[ITEM-0042]] · [[ITEM-0053]] · [[ITEM-0057]] · [[ITEM-0062]] · [[ITEM-0076]] · [[ITEM-0079]] · [[ITEM-0080]] · [[ITEM-0081]] · [[ITEM-0082]] · [[PLAN-001]] · [[PLAN-003]] · [[PLAN-007]] · [[PLAN-021]] · [[QA-BILLING-013]] · [[QA-CI-004]] · [[QA-PROV-005]] · [[QA-SETTINGS-003]] · [[QA-TENANT-015]] · [[SESSION-0040]]

<!-- GRAPH:END -->
