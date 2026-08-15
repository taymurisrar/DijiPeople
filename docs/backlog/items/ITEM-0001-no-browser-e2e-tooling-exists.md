---
ID: ITEM-0001
aliases: [ITEM-0001]
Title: No browser E2E tooling exists in any workspace
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [apps/web, apps/admin, apps/landing]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0019
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0001 — No browser E2E tooling exists in any workspace

## Summary

There is no Playwright, Cypress or Puppeteer in any workspace, and `apps/web`
and `apps/admin` jest run in a node environment with **no jsdom**. Component
rendering is therefore not testable either. Every UI finding this repository has
produced was read from code, not observed in a browser.

## Why It Matters

`BROWSER_E2E = BLOCKED_INFRASTRUCTURE` appears in every QA run's Known
Limitations, and it is load-bearing: it is why the commercial onboarding run
could prove the API and the database and could only *assess* the UI. Four open
UX records — [[BUG-0019]], [[BUG-0020]], [[BUG-0021]], [[BUG-0022]] — have no
regression coverage for the same reason.

The cost is not one untested screen. It is that no UI defect in this repository
can currently be *proven* fixed.

## Evidence

- `docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`, Known
  Limitations: "No Playwright, Cypress or Puppeteer in any workspace; web/admin
  jest run in a node environment with no jsdom."
- `docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md`, Known Limitations:
  the rebuilt tenant record page and its ten replacement panels "were never
  rendered".
- `.agent/context/testing-architecture.md` records `BROWSER_E2E` status.

## Proposed Approach

**This needs an explicit architecture decision, not a task.** Adding a browser
stack is a large dependency addition affecting three apps and CI wall-clock, and
the QA task that found the gap correctly declined to make that call on its own.

An ADR should decide: which tool, which apps it covers first, whether it runs in
the required CI gate or as a report-only job initially, and what the test-data
strategy is against an ephemeral database.

## Acceptance Criteria

An ADR exists recording the decision. If the decision is yes, one real user flow
runs green in CI — the recommendation is the admin session-expired path, because
[[BUG-0008]] proves it is a flow that has actually broken in production.

## Dependencies

Blocked on an architecture decision by a human. Not blocked on engineering.

## Related Items

[[BUG-0019]] · [[BUG-0020]] · [[BUG-0021]] · [[BUG-0022]] · [[ITEM-0002]] ·
architecture note [[qa-and-ci-architecture|QA and CI Architecture]].

## History

- 2026-08-15 — imported from the standing Known Limitations of three QA runs.

- 2026-08-15 — Resolved. Playwright is installed in a dedicated `e2e` workspace covering landing and admin; nine browser scenarios across both commercial journeys run green against a live API and a disposable PostgreSQL. The decision record this item asked for is `docs/development/browser-e2e.md`, which states the tool choice, the report-only CI mode and its promotion criteria. `BROWSER_E2E` is no longer BLOCKED_INFRASTRUCTURE.
