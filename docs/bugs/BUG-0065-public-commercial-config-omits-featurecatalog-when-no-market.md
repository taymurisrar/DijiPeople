---
ID: BUG-0065
aliases: [BUG-0065]
Title: Public commercial-config omits featureCatalog when no market resolves
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [services/api/src/modules/billing, apps/landing]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0065 — Public commercial-config omits featureCatalog when no market resolves

## Summary

`GET /api/public/commercial-config` has two return paths. The resolved-market
path returns `featureCatalog`; the no-market fallback does not return the key at
all. The landing site treats `featureCatalog` as part of the contract, so on
every page that reads the config it logs a `console.error` — visible to any
visitor with developer tools open, on the company's public marketing site.

## Expected Behavior

Both branches return the same shape. `featureCatalog` is derived from
`TENANT_FEATURE_DEFINITIONS`, not from the market, so it is available even when
no market resolves and should be returned as a populated array. At minimum the
key must be present.

## Actual Behavior

The fallback returns four keys and omits the fifth. The landing normalizer
reaches its "not an array" branch and logs an error before substituting `[]`.

## Reproduction

1. Run the API against a database with no published market and no default
   market — the state of a freshly seeded environment.
2. `curl http://localhost:4000/api/public/commercial-config`
3. Observe the response has no `featureCatalog` key.
4. Load `/`, `/features`, `/plans`, `/contact`, `/partners` or `/subscribe` and
   observe the console error.

## Evidence

Live response from the local API:

```
$ curl -s http://localhost:4000/api/public/commercial-config
{"market":null,"currency":null,"plans":[],"billingIntervals":[]}

top-level keys: [ 'market', 'currency', 'plans', 'billingIntervals' ]
featureCatalog type: undefined
```

Browser console, captured on six routes during the Chromium pass:

```
ERROR | /          | [commercial-config] Expected featureCatalog to be an array
ERROR | /features  | [commercial-config] Expected featureCatalog to be an array
ERROR | /plans     | [commercial-config] Expected featureCatalog to be an array
ERROR | /contact   | [commercial-config] Expected featureCatalog to be an array
ERROR | /subscribe | [commercial-config] Expected featureCatalog to be an array
```

Matching server log line on `/partners` as well.

## Root Cause

`services/api/src/modules/billing/services/commercial-config.service.ts:103-108`:

```ts
if (!market) {
  this.logger.warn(`No commercial market resolved …`);
  return { market: null, currency: null, plans: [], billingIntervals: [] };
}
```

The success path at line 171 returns `featureCatalog: buildPublicFeatureCatalog()`.
Only the fallback was missed. `buildPublicFeatureCatalog()` takes no arguments
and does not depend on the market, so there is no reason it cannot be included.

## Impact

Not user-visible as broken layout — the landing normalizer degrades to `[]` and
`/features` guards with `Array.isArray` — but it emits an error on a public page,
misrepresents the endpoint's own contract, and suppresses the feature catalogue
in exactly the state where a fresh deployment sits before markets are published.

## Affected Areas

`services/api/src/modules/billing/services/commercial-config.service.ts`;
consumed by `apps/landing/lib/commercial-config.ts` and rendered by
`/features`, `/plans`, `/contact`.

## Proposed Resolution

Return `featureCatalog: buildPublicFeatureCatalog()` from the fallback branch so
both paths satisfy one shape. Consider giving the handler an explicit response
type so a missing key is a compile error rather than a runtime log.

## Acceptance Criteria

1. With no market published, the response contains `featureCatalog` as an array.
2. No `[commercial-config]` error appears in the browser console on any landing
   route.
3. The resolved-market path is unchanged.

## Regression Coverage

Needs a unit test asserting both branches return the same key set. No `REG-nnn`
yet.

## Dependencies

Related to [[ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies]],
which covers market/region modelling more broadly.

## Related Items

[[BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f]],
[[BUG-0066-subscribe-page-renders-an-editable-form-with-no-way-to-submi]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
