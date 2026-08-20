# QA Run — framework-remediation

## Metadata

| | |
|---|---|
| Date / time | 2026-08-17T07:55:00Z |
| Branch | `agent/framework-remediation` |
| Commit SHA | `e6a173df30aa3b2e917a1ebce2058539d10d6fd3` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-remediation` |
| Environment | Node 24 local + GitHub Actions. CI provides PostgreSQL 16, three running apps and Chromium; the local worktree has none of those and ran only the static and unit gates |
| QA agent | qa |
| Scope | The two red report-only CI jobs, the seven reopened authorization records, Obsidian configuration, and branch/ruleset state. **No framework redesign** |

## Requirement

Remediate what the previous framework task left open: two red report-only CI jobs
treated as background noise, seven authorization records reopened against fixes
that lived only on unmerged branches, an Obsidian sync reporting
`SKIPPED_NO_LOCAL_CONFIG` from every task worktree, and unapplied `develop`
protection.

## Risk Areas

| Risk | Why | Pattern |
|---|---|---|
| Patching a failing test instead of the defect | The cheaper option every time, and the brief forbids it | — |
| A blanket `--fix` on a shared worktree | Would rewrite files this task never examined | — |
| Promoting a gate that then blocks everyone | A gate red on arrival trains people to bypass CI | — |
| Closing a record on branch evidence again | Exactly what `BUG-0047` recorded | `premature-completion` |
| A verifier that cries wolf | An alarm nobody trusts is worse than no alarm | — |

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| R1 | `services/api` lint reports zero errors | UNIT | exit 0 | PASS | 15 → 0 errors; 910 warnings under a 10000 ceiling |
| R2 | The three changed specs still pass | UNIT | pass | PASS | 3 suites, 26 tests |
| R3 | Full API suite after porting six authorization fixes | UNIT | pass | PASS | 169 suites, 1251 passed, 1 skipped |
| R4 | `BUG-0006` guards present on the integration branch | SECURITY | `PermissionsGuard` + `@Permissions` on POST/PATCH/DELETE | PASS | read from source, not from the record |
| R5 | `BUG-0005` support-role log read is tenant-scoped | SECURITY | `tenantId` compared on the support branch | PASS | same |
| R6 | The five previously-absent regression specs exist and pass | SECURITY | present | PASS | all five |
| R7 | Flow B B1 submits the partner inquiry form | BROWSER_E2E | reaches a reference number | PASS | run `32006245507` onward |
| R8 | Flow B B2–B4 run rather than being skipped by B1 | BROWSER_E2E | run | PASS | 8 passed |
| R9 | Browser suite is deterministic | BROWSER_E2E | three consecutive green, zero retries | PASS | `32006245507`, `32006831300`, `32007388682` |
| R10 | Obsidian config resolves from a worktree that has none | INTEGRATION | `FOUND_PRIMARY` | PASS | resolved from the primary checkout |
| R11 | Vault verification against the real vault | INTEGRATION | `PASS` | PASS | 294 notes, 1419 wikilinks, 0 unresolved |
| R12 | `develop` protection applied | DEPLOYMENT_SMOKE | GET confirms | PASS | `BRANCH_POLICY = IN_SYNC` |
| R13 | `origin/develop` contains `origin/main` | INTEGRATION | ancestor | PASS | `merge-base --is-ancestor` |
| R14 | A placeholder `vaultPath` never counts as configured | UNIT | `NOT_CONFIGURED` | PASS | simulation in `validate-framework.mjs` |
| R15 | A report-only job without an exit criterion fails validation | UNIT | fails | PASS | caught two jobs on its first run |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx eslint "{src,test}/**/*.ts" --max-warnings=10000` | services/api | 0 errors | 0 | — | ~70s |
| `npm --workspace api run test` | 169 suites | 1251 | 0 | 1 | ~25s |
| `npm run typecheck` | 8 workspaces | 8 | 0 | — | ~80s |
| `npx tsc --noEmit` (e2e) | Playwright specs | pass | 0 | — | ~10s |
| `node scripts/validate-framework.mjs` | framework | 1080 | 0 | 0 | ~10s |
| `npm run test:browser` (CI) | Flow A + Flow B | 8 | 0 | 0 | ~1m |
| `node scripts/sync-obsidian.mjs --verify` | vault | 294 notes | 0 | — | ~3s |
| `node scripts/verify-branch-policy.mjs` | GitHub | IN_SYNC | 0 | — | ~5s |

CI run `32008161370` on `e6a173d`: **all 14 jobs green**, including both jobs
that were red at the start of this task.

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| Flow B B1 | PASS | **FAIL** — `locator.selectOption` timeout, then `Received: 0`. Both observed on the unfixed tree, on every run and every retry |
| `report-only job states a promotion path` | PASS | **FAIL** ×2 — caught `security-invariant-report` and `browser-e2e-report` on its first run |
| `a placeholder vaultPath resolves to NOT_CONFIGURED` | PASS | **FAIL** — a placeholder would otherwise "configure" a sync into a directory named `<absolute path…>` |

## Manual Validation

- Read `organizations.controller.ts` and `error-logs.service.ts` on
  `origin/develop` **before** trusting any record. Both CRITICALs were still
  live; that is the finding this task turned on.
- Read the Playwright page snapshot rather than only the assertion message. It
  carried `status: website must be a URL address`, which is what identified
  `BUG-0048` as a product defect rather than a test bug.
- Confirmed `Field` wraps each control in a real `<label>`, so the label
  association was correct and the drift was in the test.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| `REG-001`–`REG-003`, `REG-006`, `REG-007` | Named test present and passing on the integration branch | **PASS** — all five now land, with `REG-003`'s malformed bare-filename reference corrected |
| Remaining 28 entries | Named test exists | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| `BUG-0048` | HIGH | Optional `website` field made the public partner inquiry form unsubmittable when left blank | contract mismatch between `""` and `@IsOptional()` | Yes — Flow B B1, strengthened to assert the success shape |

`BUG-0001`–`BUG-0007` were **re-verified and closed**, this time against the
integration branch. `BUG-0047` closed: both halves landed.

## Known Limitations

- **Browser E2E ran only in CI.** The local worktree has no PostgreSQL, no
  running apps and no Chromium, so every browser result here is CI's.
- **Three green runs span two SHAs**, not three distinct commits — one push and
  two dispatches of the same tree. That satisfies the written criterion and is
  weaker evidence than three independent changes would be.
- **No deployed environment is reachable.** `api.dijipeople.com` and
  `www.dijipeople.com` do not resolve from here (HTTP 000), so
  `ACTUAL_DEPLOYED_SHA` was not read. The *capability* exists — `ITEM-0010` is
  closed and the health payload carries `commit` — so the blocker has moved from
  "the system does not expose it" to "no environment is reachable from here".
- **The security invariant inventory was not counted.** `ITEM-0043` carries the
  promotion criteria; filling in the current number is its first triage step.

## Final QA Verdict

**PASS**

Every job in CI is green on the integrated SHA, including the two that were red
when this task started, and no gate was weakened to get there — one was promoted
and immediately caught a regression in this task's own work.

The security half is what matters most: two CRITICAL authorization defects were
confirmed **live** on the integration branch by reading the source, then fixed,
tested and closed on evidence from that branch rather than from a feature branch.

`PASS` rather than `PASS_WITH_RISKS` because the limitations above are statements
about what this environment can reach, not about unverified behaviour —
everything claimed was executed somewhere, and the report says where.

## Follow-up

- `ITEM-0042` — burn down 910 API lint warnings behind a ratcheting
  `--max-warnings`. `DEFER`; the gate is green and capped.
- `ITEM-0043` — count the security invariant inventory, then drop the
  `--testNamePattern` exclusion from `test-api`. `PLAN_REQUIRED`.
- Deployment observability stays honest `UNKNOWN` until an environment is
  reachable from wherever Release/DevOps runs.
