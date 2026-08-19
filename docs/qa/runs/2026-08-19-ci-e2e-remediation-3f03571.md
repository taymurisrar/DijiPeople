# QA Run — ci-e2e-remediation

## Metadata

| | |
|---|---|
| Date / time | 2026-08-20T00:50:00Z |
| Branch | `agent/ci-e2e-remediation` |
| Commit SHA | `3f03571295f733e952b9acc3427a47e97959e0b8` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-ci-e2e` |
| Environment | Working tree dirty only with the two records this run created (`docs/qa/runs/`, `docs/engineering-history/`) — no source file uncommitted. Local PostgreSQL 16, throwaway databases `dijipeople_e2e_fix` and `dijipeople_e2e_fixt`, created for this task; the populated `dijipeople` development database was never touched. No external services: Stripe is a fake `sk_test_` key and no test makes a Stripe call. |
| QA agent | QA, with the Database Agent leading fixture architecture and Release/DevOps leading the browser install |
| Scope | Covered: all 24 database-backed e2e suites, the fixture layer, the browser install step. Not covered: the browser journeys themselves (they need a three-server stack this environment does not run), and CI-side timing for either stream, which only a real run can produce. |

## Requirement

Two CI defects, worked as independent streams.

**A.** `browser-e2e`'s install step ran 3–26 minutes. The requirement was to
measure it into components rather than infer from one timer, establish whether
`--with-deps` is needed on `ubuntu-latest`, and bring
`PLAYWRIGHT_INSTALL_DURATION` under two minutes without reintroducing the
browser cache removed on 2026-08-19.

**B.** The database e2e suites had no completing CI run at all — three
consecutive 30-minute timeouts — and before that, 6 suites and 92 tests
failing. The requirement was to derive an explicit fixture contract from the
suites, prove why fewer than two usable tenants existed, stop coupling the
suites to an incidental demo seed, fix teardown, eliminate open handles, and
promote the job to a required gate if it proved stable.

No ExecPlan: [`PLANS.md`](../../../PLANS.md) requires one for schema,
auth/permission, payroll, provisioning and integration changes. This task
changed test fixtures, a seed's module shape, CI configuration and framework
documentation. No migration, no runtime authorization change.

## Risk Areas

| Area | Why it could break | Pattern |
|---|---|---|
| Dropping `--with-deps` | If the runner image stops shipping a Chromium library, the browser fails inside a journey and reads as a product defect | [`silent-config-fallback`](../known-bug-patterns/silent-config-fallback.md) |
| Converting suites to fixtures | A suite that stops using seeded data may lose a precondition it never stated | [`borrowed-fixture-dependency`](../known-bug-patterns/borrowed-fixture-dependency.md) |
| Granting matrix privileges in a test actor | Over-granting makes a permission-enforcement assertion vacuous — it passes because everything is allowed | [`permission-family-drift`](../known-bug-patterns/permission-family-drift.md) |
| Exporting `seedLegalDocuments` | A seed that self-executes on import would connect to a database and call `process.exit` from a test | [`hidden-write-on-read`](../known-bug-patterns/hidden-write-on-read.md) |
| Promoting a job to a gate | Removing `continue-on-error` alone does not make a job blocking if the failing step still exits zero | [`declared-but-unwired-step`](../known-bug-patterns/declared-but-unwired-step.md) |
| Widening the legal FK assertion | Accepting more error wordings could accept "no error" | — |

Regression entries re-read before designing scenarios: REG-047 (report-only
jobs publish a verdict), REG-064 (outbox dedup does not abort the caller
transaction — outbox suites are in the set), REG-065.

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | `playwright install --with-deps chromium` decomposes into apt vs download | contract | the two are separable and attributable | PASS | Run 32294710633 job log: apt 19:49:09→19:54:12 (303s), download 19:54:12→19:54:22 (9.6s) |
| S2 | The apt phase installs at least one library Chromium needs | boundary | — (the hypothesis under test) | **FALSIFIED** | `0 upgraded, 9 newly installed`; all 24 libraries "already the newest version"; the 9 are font packages |
| S3 | Chromium launches after `playwright install chromium`, no `--with-deps` | happy | browser starts, opens a page, closes | PASS | `LAUNCH_PROBE PASS` |
| S4 | The install step reports its own metrics | contract | 7 named metrics printed and written to the job summary | PASS | `PLAYWRIGHT_COMMAND`, `APT_DEPENDENCY_DURATION`, `CHROMIUM_DOWNLOAD_DURATION`, `LAUNCH_PROBE_DURATION`, `TOTAL_BROWSER_INSTALL_DURATION`, `RUNNER_IMAGE`, `PLAYWRIGHT_VERSION` |
| S5 | `seed:demo` produces two tenants with a business unit | precondition | — (what three suites assumed) | **FALSIFIED** | One tenant, `DijiPeople Demo Company`, 1 business unit — queried directly after `migrate deploy` + `seed:demo` + `seed:admin` |
| S6 | `createTenantPair()` yields two isolated tenants, each with an organization and a business unit | happy | distinct tenant ids, distinct customer accounts, matching `tenantId` on both children | PASS | `db-fixtures-contract.e2e-spec.ts` |
| S7 | Deleting a fixture tenant cascades away its organization and business unit | boundary | zero rows remain | PASS | Same suite. Asserted because `BusinessUnit → Organization` is `Restrict` |
| S8 | `cleanup()` after partial construction resolves rather than throwing | negative | resolves; the one built tenant is removed | PASS | Same suite |
| S9 | `cleanup()` is safe to call twice | idempotency | second call resolves | PASS | Same suite |
| S10 | `attendance-engine` passes with no seeded tenant | regression | 20/20 | PASS | 42.5s, was 0/20 |
| S11 | `gateway-runtime` passes with no seeded tenant | regression | 27/27 | PASS | 30.3s, was 0/27 |
| S12 | `attendance-integrations-http` passes with no seeded tenant | regression | 34/34 | PASS | 29.4s, was 0/34 |
| S13 | A reader is still refused a write after the actor gains matrix privileges | permission | 403 on manage routes | PASS | `permission enforcement` block; the unprivileged actor holds `ATTENDANCE READ` only |
| S14 | Tenant B, fully privileged within itself, cannot reach tenant A's rows | tenant | 404 on every cross-tenant id | PASS | `cross-tenant ID guessing over HTTP`, 5 cases |
| S15 | `legal-seed` passes where nothing ran `seed:legal` | regression | 6/6 | PASS | 4.7s; the suite runs the seed itself |
| S16 | `platform-workflows` onboarding routes resolve | regression | 200 then 201 | PASS | Suite creates its own Partner and token |
| S17 | A referenced `LegalDocumentVersion` still cannot be deleted | boundary | rejected on the foreign key | PASS | `legal-documents` 6/6 |
| S18 | Teardown never sends `undefined` into a Prisma `in` array | negative | no `PrismaClientValidationError` | PASS | No "Test suite failed to run" in either full run |
| S19 | The full set completes with zero open handles | contract | no "force exited", no "Jest did not exit" | PASS | `--detectOpenHandles`, both runs |
| S20 | The full set is repeatable | idempotency | identical suite and test counts across two runs | PASS | 24/24 and 295/295 both times |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest --config ./test/jest-e2e.json --detectOpenHandles` | Full database e2e, run 1 | 295 | 0 | 0 | 644.5s |
| `npx jest --config ./test/jest-e2e.json --detectOpenHandles` | Full database e2e, run 2 | 295 | 0 | 0 | 713.6s |
| `npx jest --config ./test/jest-e2e.json --detectOpenHandles` | Full database e2e, run 3 — **after merging develop** | 304 | 0 | 0 | 277.1s |
| `npx jest … --testPathPatterns db-fixtures-contract --detectOpenHandles` | Fixture contract | 5 | 0 | 0 | 14.1s |
| `npx tsc --noEmit -p tsconfig.json` (services/api) | Typecheck | — | 0 errors | — | — |
| `npm --workspace e2e run check-types` | Typecheck e2e | — | 0 errors | — | — |
| `node scripts/validate-framework.mjs` | Framework | 2755 | 0 | 0 | — |
| `node scripts/rebuild-{backlog,tasks,sessions,qa}.mjs --check` | Record indexes | 4 | 0 | 0 | — |
| `node scripts/generate-dashboards.mjs --check` | Dashboards | — | 0 | — | — |
| `node scripts/install-browser.mjs --browser chromium` | Browser install | — | 0 | — | 14.6s |

Runs 1 and 2 are the repeatability proof: identical suite and test counts, zero
retries. `DATABASE_E2E_FLAKINESS = 0` — no test changed verdict between them.

Run 3 is after merging `origin/develop`, which added
`provisioning-queue.e2e-spec.ts` — 25 suites and 304 tests, also green, and
that suite already builds its own data through `DbFixtures`. Its 277s is a warm
ts-jest transform cache, not a real speed-up; **644s is the cold-cache figure**
and the one to quote.

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| `db-fixtures-contract.e2e-spec.ts` — the pair, the cascade, partial cleanup | PASS | The "without fix" state was **measured as the baseline**, not stashed: `attendance-engine`, `gateway-runtime` and `attendance-integrations-http` were each run unmodified against a freshly migrated and seeded database and produced 0/20, 0/27 and 0/34, every test erroring in `beforeAll` on "These tests need two tenants with at least one business unit". `gateway-runtime` additionally failed teardown on `in: [undefined, undefined, undefined]`. |
| `install-browser.mjs` launch probe | PASS | Not independently demonstrable here: proving it fails requires a runner image missing a Chromium library, which this environment cannot produce. What the probe asserts is verified positively — the browser really is launched, not merely downloaded. Recorded as a limitation below rather than claimed. |

The baseline is stronger evidence than a stash would have been: it is the exact
CI condition reproduced locally, and it reproduced the recorded CI failure
message verbatim.

## Manual Validation

- Read the raw job log of run `32294710633` line by line to attribute the 314
  second install step. This is the whole of the browser RCA and no tool
  produced it — the Actions API reports one duration for the step.
- Queried the seeded database directly after `migrate deploy` + `seed:demo` +
  `seed:admin` to count tenants and business units, rather than inferring from
  reading the seed source.
- Observed the three-suite hang in the OS process table: 27 minutes of wall
  clock against 86 seconds of CPU — a process waiting, not working. That is
  what distinguishes a hang from slowness, and it is why the 30-minute CI cap
  was never a capacity problem.
- Caught `seed:demo` failing while a wrapper reported exit 0, because `| tail`
  swallowed the status — the same defect class as BUG-0049. Re-ran capturing
  the real code; the actual cause was an ungenerated Prisma client in a fresh
  worktree, not a seed defect.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-047 | Report-only jobs publish an explicit PASS/FAIL verdict | PASS — `validate-framework.mjs` still passes. Its subject narrows to `security-invariant-report` now that `database-e2e-report` is a gate; QA-CI-001 records that rather than being deleted, and the `RESULT:` line stays on the promoted job |
| REG-064 | Outbox deduplication does not abort the caller transaction | PASS — `outbox-delivery.e2e-spec.ts` is in the full set, green in both runs |
| REG-065 | Repository health inspects the primary worktree | PASS — `validate-framework.mjs` simulations 37A–39 |
| REG-066 | *new* — the browser install launch probe | Established by this run |
| REG-067 | *new* — the database e2e fixture contract | Established by this run |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-0079 | HIGH | `browser-e2e` spent 97–99% of its install step on apt work that installed no browser library; cost set entirely by an external mirror, reaching 25m55s and failing the required gate | `unnecessary-external-dependency` | REG-066 — the launch probe in `scripts/install-browser.mjs` |

**No product defect was found in stream B.** Every one of the previously
failing tests was a test-harness defect, and all of them reduced to one cause
wearing different costumes: suites asserting against data they did not create.
They are carried by ITEM-0047 rather than becoming individual bug records,
because 81 red tests from one unmet precondition are **one** finding — which is
exactly the mistake this task also added CI detection for
(`E2E_FIXTURE_CONTRACT_BROKEN`).

Nothing was "fixed" by relaxing an assertion. The one assertion that changed —
the legal foreign-key wording — widened which *sentence* it accepts across the
three layers that can raise the same rejection. The delete must still be
refused, and `rejects` remains the assertion.

## Known Limitations

- **CI-side timings for both streams are not in this record.** They can only
  come from a real run on the integrated SHA. Local numbers are honest for the
  suites, and irrelevant for the apt mirror, which does not exist locally.
- **The browser journeys were not run locally.** They need a migrated database
  plus three dev servers. The install script was verified end to end; the
  journeys were not. `browser-e2e` remains a required gate and will report on
  the integrated SHA.
- **The launch probe's failure path is untested.** Demonstrating it requires a
  runner image missing a Chromium library. The recovery path — warn, run
  `install-deps`, re-probe — is written and reviewed but not exercised.
- **ITEM-0055 is answered, not separately re-measured.** The evidence that
  serialisation was never the cost is this task's own timings, not a controlled
  parallel-versus-serial experiment.
- **A `pg@9.0` deprecation warning** (`client.query()` while the client is
  already executing) appears in both runs. Pre-existing, unrelated to this
  task, not investigated here.
- Windows host, not `ubuntu-latest`. The suites are database-bound and the
  fixture contract is schema behaviour, so the platform difference does not
  affect what is asserted — but it is not the CI environment.

## Final QA Verdict

**PASS**

Both streams reach a measured, reproducible end state. Stream A's root cause is
established from timestamped log evidence rather than inference, and the fix is
verified positively — the browser is launched, not assumed launchable. Stream
B's suites go from no completing run at all to 24 of 24 suites and 295 of 295
tests, twice consecutively, with zero open handles and zero flakiness; the
promotion criteria were met rather than adjusted.

PASS rather than PASS WITH RISKS because the two limitations that matter — CI
timing and the probe's failure path — are both cases where the *fix* is
verified and only a *contingency* is unexercised. Neither can produce a wrong
result on a green run: a missing library fails the install step by name, and a
slow mirror is no longer on the path at all.

## Follow-up

- **Confirm the CI-side numbers on the integrated SHA** — Release/DevOps. The
  install step should report `APT_DEPENDENCY_DURATION = 0s`, and `Database e2e`
  should conclude success as a required job for the first time.
- **Re-verify QA-CI-001 against `security-invariant-report`** — QA. The check
  is written against whichever jobs declare "report only", so it did not
  narrow, but the recorded verification named the job that is now a gate.
- **ITEM-0055 can be closed on this evidence** — Architect. Serialisation was
  never the cost, and ITEM-0047 now says so.
- **`E2E_FIXTURE_CONTRACT_BROKEN` has not yet fired in anger** — Release/DevOps.
  It is wired into the `Database e2e` summary and documented in
  `ci-operations.md`, but no run has produced a setup failure since.
