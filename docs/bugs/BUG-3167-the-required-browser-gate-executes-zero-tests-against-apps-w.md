---
ID: BUG-3167
aliases: [BUG-3167]
Title: The required browser gate executes zero tests against apps/web
Status: OPEN
Severity: HIGH
Priority: P1
Type: TEST_GAP
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [.github/workflows]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3167 — The required browser gate executes zero tests against apps/web

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A browser gate executing zero tests against apps/web reports success for coverage it does not have — worse than no job, because it reads as protection.

## Summary

The required browser gate executes zero tests against apps/web

Identified by the 2026-09-10 full technical audit as CI-02 (confidence: CI-02=CONFIRMED).

## Expected Behavior

the browser gate exercises the tenant product, or the
  job fails loudly when it cannot.

## Actual Behavior

CI starts `dev:web` on port 3001 and polls it, then every
  test that would use it skips for want of credentials. Playwright exits 0; the job
  is green; the gate is satisfied.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**CI-02** (`.github/workflows/ci.yml` (`browser-e2e`), `e2e/tests/flow-{h,i,j}*.spec.ts`):

Only three Playwright specs drive the tenant product:
  ```
  $ grep -rln "BASE_URLS.web\|E2E_WEB_URL\|localhost:3001" e2e/tests/
  e2e/tests/flow-h-tenant-sign-in.spec.ts
  e2e/tests/flow-i-growth-modules.spec.ts
  e2e/tests/flow-j-tenant-settings.spec.ts
  ```

  All three gate on credentials:
  ```
  e2e/tests/flow-h-tenant-sign-in.spec.ts:49-52
    test.skip(
      !tenantCredentials(),
      'E2E_TENANT_USER_EMAIL / E2E_TENANT_USER_PASSWORD are unset (no default exists by design)',
    );
  ```
  (identically at `flow-i-growth-modules.spec.ts:115` and `flow-j-tenant-settings.spec.ts:103`)

  ```
  e2e/fixtures/web-session.ts:51-52
    const email = process.env.E2E_TENANT_USER_EMAIL?.trim();
    const password = process.env.E2E_TENANT_USER_PASSWORD;
  ```

  The `browser-e2e` job env block (`ci.yml`, the 17 keys between the job's
  `services:` and `steps:`) sets `DATABASE_URL`, `E2E_DATABASE_URL`, `NODE_ENV`,
  `SECRET_ENCRYPTION_KEY`, `STRIPE_*`, `PLATFORM_SUPER_ADMIN_*`,
  `E2E_PLATFORM_ADMIN_EMAIL`, `E2E_PLATFORM_ADMIN_PASSWORD`,
  `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `API_ORIGIN`.
  **`E2E_TENANT_USER_EMAIL`, `E2E_TENANT_USER_PASSWORD`, `E2E_TENANT_SLUG` and
  `E2E_TENANT_ROOT_DOMAIN` appear nowhere in the workflow.**

  Test counts: flow-h 5, flow-i 4, flow-j 1 = **10 of the 69 Playwright tests skip
  unconditionally in CI**, plus 4 `test.fixme`.

  The job comment claims the opposite was fixed:
  ```
  ci.yml:1108-1112
    # `dev:web` joined on 2026-08-29 (ITEM-0034). Port 3001 was never started and
    # never polled, so `apps/web` — 254 pages, the app every employee of every
    # tenant uses — could not be reached by a test ... Its absence could not even
    # produce a skip: it was invisible rather than missing.
  ```

---


Full finding text: CI-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

`apps/web` is the surface every employee of every tenant uses. The
  required browser gate provides it exactly zero executed assertions, while
  reporting success — which is worse than having no gate, because the QA records
  and the completion contract read the green as coverage.

## Affected Areas

.github/workflows

## Proposed Resolution

add `E2E_TENANT_USER_EMAIL` / `E2E_TENANT_USER_PASSWORD` /
  `E2E_TENANT_SLUG` to the `browser-e2e` env block, pointing at the account
  `seed:demo` creates (the job already runs `seed:demo`). Then add a floor
  assertion (CI-03) so the credentials silently disappearing fails the job.

(Difficulty: LOW; Regression risk: MEDIUM — turning on 10 previously-unrun tests will surface
  real defects; that is the point, but budget for it.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `.github/workflows/ci.yml` (`browser-e2e`), `e2e/tests/flow-{h,i,j}*.spec.ts` (audit id CI-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: CI-02=MEDIUM — turning on 10 previously-unrun tests will surface
  real defects; that is the point, but budget for it.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `CI-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (CI-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
