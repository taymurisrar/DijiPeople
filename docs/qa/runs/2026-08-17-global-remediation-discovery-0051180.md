# QA Run — global-remediation-discovery

## Metadata

| | |
|---|---|
| Date / time | 2026-08-17T09:11:01.618Z |
| Branch | `agent/global-remediation-program` |
| Commit SHA | `00511803ebb0e1343ff35535996df1af98c95834` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-global-remediation` |
| Environment | Windows; Node 24.14.0 (repository requires Node 22.x); npm 11.9.0; PostgreSQL and browser service credentials not provisioned locally; working tree contains only this package's records/generated views plus ignored dependency-install remnants |
| QA agent | QA discovery (Hypatia), independently checked by Architect |
| Scope | WP-01 read-only/code-record discovery, durable inventory integrity, exact-base CI evidence and framework structure; no product fix or deployment |

## Requirement

Establish a truthful, deduplicated remediation baseline before implementation.
The package must inventory every canonical Bug and Backlog item, attach the
current evidence available from global triage, record newly verified findings
without leaving `TRIAGE_REQUIRED`, and decompose the program by root cause. It
does not claim terminal re-verification: 69 of 98 rows remain `PRELIMINARY` and
BUG-0044 remains `PENDING` for QA retest; those 70 rows are assigned to the
subsequent owner/module packages. See
[`TASK-0005`](../../tasks/TASK-0005-dijipeople-global-technical-remediation.md).

## Risk Areas

This package changes durable records and generated views, not runtime code. Its
primary risks are false completion, stale QA evidence, doc-code drift, hidden
CI failures, duplicate findings and an inventory that silently omits a source.
The applicable patterns are premature completion, doc-code drift, hidden
writes and test evidence that does not exercise the claimed behavior. All 35
active regressions were included in the source audit; seven currently lack a
reusable scenario (`REG-006`, `REG-017`, `REG-018`, `REG-019`, `REG-020`,
`REG-034`, `REG-035`).

## Scenarios

Expected behaviour is written **before** execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Canonical Bugs/items appear exactly once in the machine-readable inventory. | contract | 98 records with no missing, extra or duplicate canonical IDs. | PASS | `TASK-0005-inventory.json`; canonical parser comparison |
| S2 | Every discovered material finding receives a record or explicit cross-record disposition. | negative | No ordinary `TRIAGE_REQUIRED`; 34 evidence-system findings retained without duplicating canonical records. | PASS | inventory summary and `npm run backlog:check` |
| S3 | Green CI conclusions are compared with underlying test output. | regression | Report-only failures/skips are exposed and not promoted to PASS. | PASS | GitHub Actions run `32009837400`, jobs `95326876583`, `95327538057`, `95326876559` |
| S4 | QA references and status claims match executable evidence. | contract | Dangling/stale references and scenario states are enumerated for WP-02. | PASS | 12 plans, 58 scenarios, 35 active regressions, 13 runs and 19 patterns audited |
| S5 | Generated backlog/task/session/knowledge views agree with canonical records. | contract | Structural generators and checks pass after regeneration. | PASS | `backlog:check`, `tasks:check`, `qa:check`, `sessions:check`, dashboard check and 1,080 framework checks |
| S6 | Discovery changes do not modify production control. | boundary | `main` remains at its recorded baseline and is contained by `develop`. | PASS | pre-task repository health; `main` baseline `b90f33e` |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm run qa:check` | QA structural registry | 1 command | 0 | 0 | not captured |
| `npm run backlog:check` | Backlog structural registry | 1 command | 0 | 0 | not captured |
| `npm run validate:framework` (pre-regeneration) | Framework | 1,078 checks | 2 stale-dashboard checks | 0 | not captured |
| `npm run validate:framework` (final) | Framework | 1,080 checks | 0 | 0 | 33.1 s |
| `npm run tasks:check` | Task records/indexes | 5 records | 0 | 0 | 4.3 s |
| `npm run sessions:check` | Session records/indexes | 3 records | 0 | 0 | 4.3 s |
| `npm run knowledge:dashboards:check` | Generated dashboards | 3 current | 0 | 0 | 4.3 s |
| `git diff --check` | Patch whitespace | 1 command | 0 | 0 | 1.6 s |
| `node --test packages/config` | Config directory smoke invocation | 1 test | 0 | 0 | not captured |
| Exact-base CI API unit job | 169 suites | 169 | 0 | 0 | GitHub run evidence |
| Exact-base CI API E2E report job | 15 suites / 227 tests | 9 suites / 91 tests | 6 suites / 136 tests | 0 | GitHub run evidence |
| Exact-base CI browser job | Playwright | 8 tests | 0 | 1 | GitHub run evidence |
| Exact-base CI security invariant job | permission coverage | 4 tests | 1 | 0 | GitHub run evidence |

Use the real commands from
[`.agent/context/testing-architecture.md`](../../../.agent/context/testing-architecture.md).
Never invent a script.

### Regression-test proof

For a bug fix or security change, show the new test **failing without the fix**:

Not applicable: WP-01 makes no runtime bug fix. Every implementation package
must supply before/after proof. In particular, the stale BUG-0019 browser
assertion must be enabled and fail against a deliberately unfixed baseline
before its QA evidence is promoted.

A test that passes both ways is not a regression test.

## Manual Validation

The Architect inspected exact logs for GitHub Actions run `32009837400` at
`00511803`. Although the aggregate run was green, the security job reported
1,198 handlers, 894 in scope, only 98 compliant and 796 violations (3 missing
legacy only, 715 missing matrix only, 78 missing both). The database E2E report
contained 6 failed suites and 136 failed tests. Browser E2E was 8 passed and 1
skipped, contradicting the durable run's 8/0 claim. Current routes, CI workflow,
notification provider factory, proxy host resolution, environment examples and
landing boundaries were also inspected against their records.

## Regression Checks

Which `docs/qa/regressions/index.md` entries apply to these modules, and the
result of re-checking each.

| Regression ID | Scenario | Result |
|---|---|---|
| REG-006, REG-017–020, REG-034–035 | Reusable scenario linkage | FAIL — remediation assigned to WP-02 |
| REG-022 | Canonical Bug back-reference | FAIL — no Bug record currently linked |
| BUG-0019 browser assertion | Partner inquiry route reachability | BLOCKED — product route exists, but test is unconditionally skipped |
| All remaining active entries | Referenced test file resolves | PASS — 35/35 active register entries resolve when sibling-relative references are interpreted |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-0049 | HIGH | Report-only CI jobs swallow security and database E2E failures. | false-success / premature completion | No — CI integrity package required |
| BUG-0050 | MEDIUM | UI offers email providers whose backend always throws. | unsupported option / contract drift | No — implementation package required |
| BUG-0051 | MEDIUM | Backlog and QA validators accept contradictory record state. | doc-code drift / false validation | No — validator package required |
| BUG-0052 | HIGH | Production dependency graph contains critical/high advisories. | dependency risk | No — dependency package required |

New scoped items: ITEM-0044 (forwarded-host trust), ITEM-0045 (root-domain
example drift) and ITEM-0046 (landing route boundaries).

For each material bug, run the loop in [`../README.md`](../README.md).

## Known Limitations

Local API, web, admin, landing and gateway suite attempts exceeded the bounded
64-second discovery window and were stopped; no lingering matching test process
remained. The host provides Node 24.14.0, while the repository contract requires
Node 22.x, so this package does not substitute those attempts for CI evidence.
No local PostgreSQL or browser environment was provisioned, and no deployment
or external provider call was authorized. The exact-base CI run supplies broad
code evidence, but its report-only failures are deliberately retained as
unresolved. The config directory invocation exercised one discovered test, not
the complete seven-file config inventory.

## Final QA Verdict

**PASS WITH RISKS**

WP-01 discovery is sufficient to define remediation work without claiming the
product healthy. The material risks are explicit: 796 authorization invariant
violations, 6 failing database E2E suites, 1 skipped browser assertion, 17
production dependency advisories, contradictory record state and stale QA
semantics. None is reclassified as PASS by the green aggregate CI result.

## Follow-up

WP-02 reconciles record/QA semantics and strengthens validators; WP-03 audits
the 78 routes missing both permission decorators before module batches; WP-04
isolates database suites and records reproducible residual defects; WP-08 owns
dependency remediation; WP-09 promotes CI only after the underlying suites are
green. Product/legal owner decisions remain recorded separately and do not
block these technical packages.
