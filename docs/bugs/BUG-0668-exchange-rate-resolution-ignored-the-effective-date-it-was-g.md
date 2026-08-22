---
ID: BUG-0668
aliases: [BUG-0668]
Title: Exchange rate resolution ignored the effective date it was given
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: d5d9ce7
AffectedModules: [services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: REG-223
RegressionId: REG-223
RelatedBacklogItem: ITEM-0042
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0668 — Exchange rate resolution ignored the effective date it was given

## Summary

`EnterpriseConfigurationService.resolveExchangeRate` took an `effectiveDate`
parameter and never read it. All three lookups — manual, automatic and inverse —
ordered by `updatedAt` and returned the newest row, so asking for the rate *as
of* a date returned today's rate.

`convertMoney` is what makes it dangerous rather than merely wrong. It accepts
an `effectiveDate` from its caller and forwards it, so a caller who supplied the
correct date still got the wrong number, with nothing anywhere reporting a
problem.

## Expected Behavior

A rate lookup for a moment returns the rate that was in force at that moment.
`ExchangeRateSnapshot` is effective-dated by design: `effectiveDate` is
required, `effectiveEndDate` is nullable, and null means "still current".

## Actual Behavior

The newest row wins regardless of the date asked for. A February conversion used
August's rate.

## Reproduction

1. Create three `ExchangeRateSnapshot` rows for USD → AED: 3.60 for Jan–Mar,
   3.70 for Apr–Jun, 3.80 from July with no end date.
2. Call `resolveExchangeRate(tenantId, 'USD', 'AED', new Date('2026-02-15'))`.
3. It returns **3.80**. It should return 3.60.

Driven in `services/api/src/modules/tenant-settings/exchange-rate-effective-date.spec.ts`.

## Evidence

- `enterprise-configuration.service.ts` — `resolveExchangeRate`: the parameter
  was declared, defaulted to `new Date()`, and appeared in no `where` clause.
- The same file — `convertMoney` passes `input.effectiveDate ?? new Date()`
  straight into it.
- `prisma/schema.prisma` — `ExchangeRateSnapshot.effectiveDate` /
  `effectiveEndDate`: the columns the resolver was meant to use.
- ESLint had been reporting it as `no-unused-vars` for as long as the warning
  baseline existed.

## Root Cause

The parameter was added for an interface that was never implemented, and the
warning that said so was one of ~910 nobody read. That is the point [[ITEM-0042]]
was raised about: individually each warning is minor, together they are the
reason the output is ignored, and two of the seventeen unused variables turned
out to be defects.

## Impact

**Not currently reachable**: `convertMoney` has no callers, and
`resolveExchangeRate` is called only from it. So no money has been converted at
the wrong rate.

What it was is a trap for the first caller — an API that accepts an effective
date, on an effective-dated model, and silently ignores it. Multi-currency
payroll and invoicing are exactly the callers it is waiting for, and a wrong rate
there is a wrong number on a payslip.

## Affected Areas

`EnterpriseConfigurationService.resolveExchangeRate` and `convertMoney`.

## Proposed Resolution

Filter every lookup on the effective window. No schema change; the columns exist.

## Acceptance Criteria

- A lookup for a date returns the rate whose window contains it.
- The default keeps meaning "now".
- A date no window covers is refused, and the message names the date.
- `convertMoney` carries its caller's date through.

## Regression Coverage

REG-223 — `exchange-rate-effective-date.spec.ts`, seven tests.

Proven by mutation: replacing the effective-date filter with `{}` fails five of
the seven, including the three that walk a real three-window history.

The suite asserts on the `where` clause as well as on the returned rate. A test
that stubbed one row and checked the result would pass with the filter deleted,
because the stub returns that row whatever is asked for — which is the same
"assertion that cannot fail" shape this session has been removing.

## Dependencies

None.

## Related Items

[[ITEM-0042]] · [[BUG-0669]] — the other defect the unused-variable warnings were
pointing at · module [[settings|Settings]].

## Resolution

Every lookup now filters on `{ effectiveDate: { lte: at }, OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: at } }] }`
and orders by `effectiveDate` descending first — with several windows covering
one moment, the later one is the correction. The refusal message names the date.

Fixed on branch `agent/qa-verify-and-burndown`.

## QA Retest

```
npx jest src/modules/tenant-settings/exchange-rate-effective-date.spec.ts
→ 7 passed
npx jest    (full services/api unit suite)
→ 207 suites, 1648 tests, all passing
```

## History

- 2026-08-22 — found while burning down [[ITEM-0042]]'s unused-variable warnings.
  The warning had been reporting it for as long as the baseline existed.
- 2026-08-22 — Architect triage: FIX_NOW. One file, no schema change, and the
  columns the fix needs already exist.
- 2026-08-22 — fixed and verified. REG-223 registered.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0042]]
- Modules — [[settings]]
- Regression — REG-223 (see the regression register)

<!-- GRAPH:END -->
