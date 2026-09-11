---
ID: BUG-3199
aliases: [BUG-3199]
Title: An outbound fetch with no timeout is reachable from an authenticated tenant endpoint; Stripe has no explicit timeout or circuit breaker
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/billing]
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

# BUG-3199 — An outbound fetch with no timeout is reachable from an authenticated tenant endpoint; Stripe has no explicit timeout or circuit breaker

> **Architect triage, 2026-09-11 — `FIX_NOW`.** An outbound fetch with no timeout, reachable from a tenant, holds a connection until something else gives up. Adding a timeout is contained.

## Summary

An outbound fetch with no timeout is reachable from an authenticated tenant endpoint; Stripe has no explicit timeout or circuit breaker

Identified by the 2026-09-10 full technical audit as RES-05 (confidence: RES-05=CONFIRMED).

## Expected Behavior

every outbound call carries an explicit deadline. A
  third-party enrichment call that fails should degrade to the last stored value
  and say so — which `getCurrencyRateSummary` is already structured to do (it
  catches and populates `lastError`); it just never gets the chance because the
  call does not return.

## Actual Behavior

the exchange-rate call inherits Node/undici defaults,
  which impose no total-request deadline (only a 300-second headers timeout), so
  a hung `open.er-api.com` holds the request, its HTTP socket and its pool
  connection for up to five minutes. Stripe falls back to the SDK's 80-second
  default and a single network retry; there is no circuit breaker anywhere in
  the codebase (`grep` for `circuit`/`breaker` returns nothing).

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-05** (`services/api/src/modules/lookups/lookups.service.ts`, `services/api/src/modules/billing/services/stripe-billing.service.ts`):

There are exactly five `fetch()` sites in the API. Four set a timeout; one
  does not — `services/api/src/modules/lookups/lookups.service.ts:872-874`:
  ```ts
  const response = await fetch(
    `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`,
  );
  ```
  Compare the three that do —
  `services/api/src/modules/lookups/geographic-lookup.service.ts:178-180`:
  ```ts
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(GEOGRAPHY_API_TIMEOUT_MS),   // 3_000
  });
  ```
  Reachability, traced end to end:
  `configuration.controller.ts:82` `@Get('currencies/:id/rate-summary')` →
  `lookups.service.ts:399 getCurrencyRateSummary` →
  `lookups.service.ts:443 fetchAndStoreProviderRate` → the untimed `fetch`. The
  branch is taken whenever the stored rate is older than 12 hours
  (`isRateStale`, `lookups.service.ts:867-870`), so it fires on ordinary use of
  the currency settings screen.

  Stripe — `stripe-billing.service.ts:363-368`:
  ```ts
  const stripeConfig: Record<string, unknown> = {
    apiVersion,
  };
  return new Stripe(secretKey, stripeConfig);
  ```
  No `timeout`, no `maxNetworkRetries`.

---


Full finding text: RES-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

five concurrent settings-page loads against a hung upstream is half
  the connection pool (RES-01) gone for five minutes, from an endpoint any
  tenant admin can hit. For Stripe, an 80-second checkout hang is presented to a
  paying customer as a frozen page, and a Stripe brownout serialises into pool
  exhaustion the same way.

## Affected Areas

services/api/src/modules/billing

## Proposed Resolution

add `signal: AbortSignal.timeout(3_000)` to
  `lookups.service.ts:872`, matching `GEOGRAPHY_API_TIMEOUT_MS`. Pass
  `{ timeout: 10_000, maxNetworkRetries: 2 }` to `new Stripe(...)` in
  `buildStripeClient`. Add a lint rule or an invariant spec asserting every
  `fetch(` in `services/api/src` carries a `signal`.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/lookups/lookups.service.ts`, `services/api/src/modules/billing/services/stripe-billing.service.ts` (audit id RES-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-05=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]

<!-- GRAPH:END -->
