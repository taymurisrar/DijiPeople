---
ID: ITEM-0033
aliases: [ITEM-0033]
Title: apps/web has zero browser E2E coverage
Type: TEST_GAP
Status: READY
Priority: P1
Severity: HIGH
AffectedModules: [apps/web, e2e]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0042
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0033 — apps/web has zero browser E2E coverage

## Summary

The Playwright suite covers `apps/landing` and `apps/admin`. **`apps/web` — the
tenant product, 253 pages, 1,100 files, the largest application in the
monorepo — is never opened by any test.** The `browser-e2e-report` CI job does
not even start it.

## Why It Matters

This is the app every employee of every tenant uses, and the one with the
largest untestable surface: `jest.config.js` is `testEnvironment: node` with no
jsdom, so **nothing in `apps/web` can be tested through a DOM by any existing
mechanism**. Browser coverage is not a nice-to-have here; it is the only
available way to test 253 pages, 209 client components, `proxy.ts`'s request
flow and every accessibility requirement in `apps/web/AGENTS.md`.

Several findings from TASK-0003 are unguardable without it —
[[BUG-0042-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]] and
[[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] both
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
- `browser-e2e-report` is `continue-on-error: true` and absent from
  `ci-required`'s `needs` — so even the coverage that exists does not gate.

## Proposed Approach

**Needs an ExecPlan**, because the first question is what to cover, not how.
253 pages cannot be covered exhaustively and should not be attempted.

Cover the journeys where a silent failure is most expensive, in this order:
sign-in and workspace resolution (the tenant-isolation path); a runtime list →
record → edit → save round trip on one module, which exercises the machinery
231 pages share; and a settings save, which is where
[[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] lives.

Start `apps/web` in the CI job and consume `BASE_URLS.web`, or remove that key
so the config stops implying coverage that does not exist.

## Acceptance Criteria

- At least one Playwright spec drives `apps/web` and asserts a real outcome.
- `browser-e2e-report` starts and polls port 3001.
- `BASE_URLS.web` is either consumed or removed.
- [[ITEM-0001]] is annotated so its `DONE` is not read as web coverage.

## Dependencies

None blocking. The suite, the job and the fixtures all exist; this extends them.

## Related Items

[[ITEM-0001]] · [[BUG-0042-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]] ·
[[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] ·
[[BUG-0038-employee-payslip-and-bank-account-proxies-return-the-callers]] ·
[[web-architecture]] · [[qa-and-ci-architecture]].

## History

- 2026-08-17 — raised by the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`, `P1`. Priority is above the
  usual for a test gap because it is the *only* possible test mechanism for the
  largest app, not merely an additional one.
</content>
