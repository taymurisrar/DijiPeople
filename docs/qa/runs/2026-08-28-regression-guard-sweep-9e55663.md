# QA Run — regression-guard-sweep

## Metadata

| | |
|---|---|
| Date / time | 2026-08-28T22:17:50.838Z |
| Branch | `agent/backlog-burndown` |
| Commit SHA | `9e55663b39f2599acd3490a2b1c2b0b6db8ea63a` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-admin-fx` |
| Environment | Working tree dirty with **this sweep's own record edits only** — no source file was modified during it, which is what makes the suite results attributable to `9e55663`. Local PostgreSQL 17 available (credential supplied by the owner); no external services reached. |
| QA agent | QA, on the Architect's routing |
| Scope | Covered: every regression guard named by a `FIXED` bug record. Not covered: any behaviour in a browser, and anything that needs the deployed system. |

## Requirement

Forty-eight bug records stood at `FIXED` — fixed, but with nobody having
confirmed them against a running system. The repository owner asked, on
2026-08-29, for them to be verified by re-reading the code and running its
specs.

The question this run answers is narrow and worth stating exactly: **is each
fix still present, and does its guard still pass?** That is not the same as
"does the screen behave", and this run does not claim the second.

It matters because it has gone wrong here before. A fix can be reverted by a
later merge, a guard can be deleted with the code it guarded, and the record
would still read `FIXED`. Nothing detects that except looking.

## Risk Areas

- **A guard that no longer exists.** A record naming a test file that was
  deleted would leave a `FIXED` record with nothing behind it.
- **A guard that passes vacuously.** The relevant pattern is
  `crlf-defeats-source-reading-specs`: a spec that reads a source file and
  asserts `not.toContain(...)` passes when the read returns nothing, and a
  `\n` literal matches nothing on a CRLF checkout while matching on CI.
- **A guard that passes because it tests nothing.** A source-reading spec with
  only negative assertions cannot distinguish a fixed file from an empty one.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every regression test file named in `docs/qa/regressions/index.md` exists on disk | regression | 206 of 206 present | PASS | 206 paths resolved, 0 missing |
| S2 | Every suite containing one of those guards passes | regression | all green | PASS | see Automated Suites |
| S3 | No source-reading guard has negative assertions without a positive control | contract | 0 such specs | PASS | 69 source-reading guards scanned, 0 flagged |
| S4 | No source-reading guard matches across newlines without normalising CRLF | contract | 0 such specs | PASS | 0 flagged |
| S5 | A `FIXED` record with no `RegressionId` | contract | none exist | PASS | 0 of 48 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test` | api (245 suites) | 2016 | 0 | 0 | ~54s |
| `npm --workspace admin run test` | admin (42 suites) | 379 | 0 | 0 | ~7s |
| `npm --workspace web run test` | web (28 suites) | 888 | 0 | 0 | ~20s |
| `node --test packages/config/*.test.js` | config | 11 files | 1 file | 0 | — |
| `node --test scripts/*.test.mjs` | scripts | 6 files | 0 | 0 | — |
| `npm run validate:framework` | framework | 4231 checks | 0 | 0 | — |
| `npm run typecheck` | all workspaces | 8 tasks | 0 | 0 | ~100s |

The one failing config file is `widget-runtime-contract.test.js`, which is
[[ITEM-0092]] — a known open item, and **no `FIXED` record names it as a
guard**. Checked rather than assumed: `grep widget-runtime docs/qa/regressions/index.md`
returns nothing.

### Regression-test proof

Not applicable in the usual form — this run added no fix, so there is no
"without the fix" to stash. The equivalent evidence was gathered on the two
guards written the same day, by mutating the source they protect:

| Test | With fix | Without fix (mutated) |
|---|---|---|
| `generic-delete.spec.ts` — leads excluded from the bulk case again | PASS | FAIL (2 assertions) |
| `generic-delete.spec.ts` — admin half of the authorization union dropped | PASS | FAIL (1 assertion) |

For the other 46, the "without the fix" proof is the one recorded in each
record's own `REG-nnn` entry when it was written. This run did not repeat it,
and that is a stated limit below rather than a claim.

## Manual Validation

**None.** Nothing was checked by hand and no screen was opened. This is the
sweep's principal limitation and the reason its verdict is scoped rather than
absolute.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-237 … REG-301 | every entry named by a `FIXED` record — 48 records across 47 distinct `REG` ids | PASS |

Enumerated from the records rather than from the register, so a `FIXED` record
pointing at an entry that no longer exists would have surfaced. None did.

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| — | — | none | — | — |

Nothing new was found. That is the expected outcome of a sweep whose purpose is
to confirm rather than discover, and it is not evidence that nothing is wrong —
see Known Limitations.

## Known Limitations

This section is the honest half of the verdict.

- **No browser, anywhere.** Production cannot be driven from this environment:
  the MCP browser is blocked for production hosts by `.mcp.json`. Every UX
  record in the sweep — empty-state copy, accessible names, page titles, the
  confirmation that names records before deleting them — is confirmed only as
  far as its guard goes.
- **Source-reading guards are weaker than behavioural ones**, and this run does
  not separate them. 69 of the guards read source and assert on strings. They
  prove the code still says what it said; they do not prove it does what it
  means.
- **The "fails without the fix" property was not re-proven** for 46 of the 48.
  It was proven when each guard was written, and is recorded in the register.
- **The e2e suites did not run locally.** `REG-237`'s guard is
  `e2e/tests/landing-checkout-provisioning.spec.ts`, covered by the CI
  **Browser e2e** job on this SHA rather than by anything run here.
- **A passing guard cannot detect a fix that was never right.** If a fix and its
  test were both wrong in the same way, this sweep agrees with them.

## Final QA Verdict

**PASS WITH RISKS.**

Every one of the 48 `FIXED` records has a guard, every guard exists, and every
suite containing one is green. Combined with 4231 framework checks and a clean
repo-wide typecheck, that is enough to say the fixes are present and have not
been silently reverted — which is what `FIXED` failed to distinguish and what
this sweep was asked to establish.

The risks are the limitations above, and one of them is worth restating: this
verdict is about code, not about screens. A browser QA pass over the admin
console and the tenant workspace would still be worth having, and thirty-seven
of these records ask for one in their own retest notes.

## Follow-up

- A browser QA pass over the UX records, when an environment that can reach the
  product is available. Recommended next step for QA.
- [[ITEM-0092]] — `widget-runtime-contract.test.js` still fails and still has no
  script or CI job running it. Untouched by this sweep and still open.
