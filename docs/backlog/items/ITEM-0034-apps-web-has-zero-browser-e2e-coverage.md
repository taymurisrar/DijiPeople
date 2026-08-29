---
ID: ITEM-0034
aliases: [ITEM-0034]
Title: apps/web has zero browser E2E coverage
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [apps/web, e2e]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-29
RelatedBug: BUG-0043
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation: docs/plans/EXECPLAN-0025-apps-web-browser-e2e-coverage.md
TargetMilestone:
BlockedBy:
---

# ITEM-0034 — apps/web has zero browser E2E coverage

## Summary

The Playwright suite covers `apps/landing` and `apps/admin`. **`apps/web` — the
tenant product, 253 pages, 1,100 files, the largest application in the
monorepo — is never opened by any test.** The `browser-e2e` CI job does
not even start it.

## Why It Matters

This is the app every employee of every tenant uses, and the one with the
largest untestable surface: `jest.config.js` is `testEnvironment: node` with no
jsdom, so **nothing in `apps/web` can be tested through a DOM by any existing
mechanism**. Browser coverage is not a nice-to-have here; it is the only
available way to test 253 pages, 209 client components, `proxy.ts`'s request
flow and every accessibility requirement in `apps/web/AGENTS.md`.

Several findings from TASK-0003 are unguardable without it —
[[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]] and
[[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] both
record "no regression possible" for this reason.

**[[ITEM-0001]] is misleading as it stands.** It is titled "No browser E2E
tooling exists in any workspace", lists `apps/web` first in `AffectedModules`,
and is closed `DONE`. Tooling exists; coverage of `apps/web` does not. A future
agent retrieving that record will conclude the tenant product is covered.

## Evidence

Verified at `1af3690`:

- `e2e/tests/` contains exactly two specs — `flow-a-commercial-onboarding` and
  `flow-b-partner-journey` — both landing → admin.
- `e2e/playwright.config.ts:37` defines `web: process.env.E2E_WEB_URL ??
  'http://localhost:3001'` in `BASE_URLS`, and **no test consumes it**. The
  config reads as though web were in scope.
- `e2e/fixtures/environment.ts:60-79` probes landing, admin and api only — so
  web's absence cannot even produce a skip.
- `.github/workflows/ci.yml:543-546` starts `dev:api`, `dev:landing`,
  `dev:admin`. **Port 3001 is never started and never polled.**
- `browser-e2e` is present in `ci-required.needs` but retains
  `continue-on-error: true`, so a failed browser step is still fail-open.

## Proposed Approach

**Needs an ExecPlan**, because the first question is what to cover, not how.
253 pages cannot be covered exhaustively and should not be attempted.

Cover the journeys where a silent failure is most expensive, in this order:
sign-in and workspace resolution (the tenant-isolation path); a runtime list →
record → edit → save round trip on one module, which exercises the machinery
231 pages share; and a settings save, which is where
[[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] lives.

Start `apps/web` in the CI job and consume `BASE_URLS.web`, or remove that key
so the config stops implying coverage that does not exist.

## Acceptance Criteria

- At least one Playwright spec drives `apps/web` and asserts a real outcome.
- `browser-e2e` starts and polls port 3001.
- `BASE_URLS.web` is either consumed or removed.
- [[ITEM-0001]] is annotated so its `DONE` is not read as web coverage.

## Dependencies

None blocking. The suite, the job and the fixtures all exist; this extends them.

## Related Items

[[ITEM-0001]] · [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]] ·
[[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] ·
[[BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers]] ·
[[web-architecture]] · [[qa-and-ci-architecture]].

## History

- 2026-08-17 — raised by the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`, `P1`. Priority is above the
  usual for a test gap because it is the *only* possible test mechanism for the
  largest app, not merely an additional one.


## Plan written — 2026-08-29

[[EXECPLAN-0025-apps-web-browser-e2e-coverage]] covers this. It is `AWAITING_OWNER_DECISION` on one point and
one only: **which journeys the first slice covers.** 253 pages cannot be covered
and should not be attempted, so the plan proposes three flows — sign-in and
landing, the daily journeys (attendance, leave, payslip), and one
metadata-driven runtime module — with its reasoning, for the owner to confirm or
replace.

### Two of this record's facts had gone stale, and are corrected there

Measured at `eb457d9`:

- **"`e2e/tests/` contains exactly two specs"** — there are **ten**. Flows A
  through G plus three landing specs; the suite went from 18 tests to 48.
- **"`browser-e2e` retains `continue-on-error: true`, so a failed browser step
  is still fail-open"** — that was **removed on 2026-08-18**, with a comment in
  `ci.yml` explaining that it made the job's promotion fail-open. The job is
  genuinely required now.

### What is still exactly true, which is the whole finding

- No test consumes the `web` base URL. `playwright.config.ts:37` defines it and
  grepping the entire `e2e/` tree for a consumer returns nothing.
- CI starts `dev:landing` and `dev:admin`. Port 3001 is never started, never
  polled.
- `fixtures/environment.ts` probes landing, admin and api only, so web's absence
  cannot even produce a skip — it is invisible rather than reported.
- 254 `page.tsx` files and 207 client components, none ever rendered by a test,
  in the one app that has no other way to be tested through a DOM.



## Done — 2026-08-29

`apps/web` is opened by a browser test. Integrated into `develop` at `9be5256`
behind a green exact-SHA gate, **Browser e2e included** — the first CI run that
started the tenant product at all.

Three flows, on the slice the repository owner chose: the modules a Growth-plan
tenant is entitled to, plus settings. 17 passing, 5 skipped with named reasons,
0 failing, against a live stack with a migrated and seeded disposable database.

CI now starts `dev:web` and polls 3001, and `probeTenantProduct` reports the
app's absence rather than letting it be invisible.

### What it found, which is the point

| | |
|---|---|
| [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page]] | every authenticated screen renders `<h1>Dashboard</h1>` — nine snapshots, identical |
| [[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin]] | 89 of 232 pages render a `main` landmark; 143 render none |
| [[BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i]] | four blocking axe violations, two critical, five buttons with no name |

All three are the tenant half of what BUG-1421 and BUG-1423 fixed for admin, and
none was checkable before. [[BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width]]
also gained the reproduction it was deferred for want of; its disposition is
unchanged, because evidence is not a decision.

**None of them was fixed here.** Conflating "we can now see" with "we have now
fixed" makes the coverage deliverable unmeasurable, and the plan committed to
keeping them separate.

### Two things worth keeping from building it

**Four of my own assertions were wrong, and only running them showed it.** The
headings I asserted do not exist — that failure is how BUG-1950 surfaced. The
environment probe demanded landing and admin, which these flows never open, so
twenty tests reported "skipped" with the stack up and serving. And three of the
seven modules refuse for a least-privileged user, all correctly — so the
assertion is now "reaches an intentional state", meaning its own content or a
refusal that explains itself, never a blank page.

**The suite was flaky and the cause was mine.** Signing in per test spent
roughly fifteen logins in five minutes against a limit of 20 per 10 minutes, and
`PublicRateLimitGuard` correctly answered 429 partway through — which reads
exactly like a broken login. Checked the lockout counters first (zero on both
`User` and `Identity`) before reading the API log. Flows I and J now sign in
once and share a page; Flow H still signs in for real, because it is the flow
about signing in. Documented in `docs/development/browser-e2e.md` with the two
SQL queries that tell the two apart.

### What is not covered, stated rather than left to inference

`documents` — the one Growth entitlement with no route and no settings page — is
reached from an employee record and is out of this slice. Recruitment renders
but was not asserted beyond reaching an intentional state. 232 pages remain
mostly unopened; this is a first slice and does not claim otherwise.

[[ITEM-0001]] has been corrected: its title claims no browser tooling existed,
which was true, but it reads as a claim about coverage and is the reason this
record had to be filed.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0043]]
- Referenced by — [[BUG-1950]], [[BUG-1951]], [[BUG-1986]]
- Modules — [[tenant-application]], [[qa-and-ci-architecture]]
- Implementation — [[EXECPLAN-0025-apps-web-browser-e2e-coverage]]
- QA run — [[2026-08-17-web-app-documentation-1af3690]]

<!-- GRAPH:END -->
