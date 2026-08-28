---
ID: BUG-1745
aliases: [BUG-1745]
Title: The executive dashboard reports zero revenue because reporting currency is PKR and all money is QAR
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-294
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1745 — The executive dashboard reports zero revenue because reporting currency is PKR and all money is QAR

## Summary

The Control Hub reports **Collected revenue PKR 0**, **Outstanding PKR 0** and a
flat six-month revenue trend, while production holds two succeeded payments
totalling **QAR 160** and two paid invoices. Every money aggregate on the
dashboard filters on `currency: reportingCurrency`, and the stored platform
default sets `reportingCurrency: "PKR"` — a currency no record in the system
uses. The dashboard is not so much broken as pointed at an empty slice, and
nothing on the screen distinguishes that from having genuinely earned nothing.

## Expected Behavior

The executive overview reflects money actually collected. If a reporting
currency is applied, a zero caused by no record matching that currency is
distinguishable from a zero caused by no revenue.

## Actual Behavior

Every commercial figure reads zero in PKR while all real revenue is in QAR.

## Reproduction

1. Platform Admin, **Dashboard**. Note "Collected revenue PKR 0" and the
   "Currency PKR" chip.
2. Platform Admin, **Invoices**. Two invoices at `QAR 80.00`, both **Paid**.
3. `GET /api/super-admin/payments` — two payments, `SUCCEEDED`, `QAR 80` each.

## Evidence

Stored platform defaults, `GET /api/super-admin/platform-settings`:

```json
{"platformDefaults":{"country":"PK","currency":"PKR","reportingCurrency":"PKR",
"timezone":"Asia/Karachi","dateFormat":"DD/MM/YYYY","timeFormat":"12-hour",
"locale":"en-US"}}
```

`services/api/src/modules/super-admin/super-admin.service.ts` —
`getDashboardSummary()` resolves `reportingCurrency` from that row and then
filters on it in every money aggregate: the collected-revenue sum
(`payment.aggregate` with `status: SUCCEEDED, currency: reportingCurrency`), the
outstanding-invoice sum, and the invoice breakdown.

The code's own default is correct — `DEFAULT_PLATFORM_DEFAULTS.reportingCurrency`
is `'QAR'` in
`services/api/src/common/reference-data/platform-reference-data.ts`. The stored
row overrides it.

**Settings → Platform → General** (`/settings/platform-defaults`) shows Country
`Pakistan (PK)`, Default currency `PKR`, Reporting currency `PKR`, Timezone
`Asia/Karachi`, and its own footer reads
`Fallback values: QA, QAR, QAR reporting, Asia/Qatar, en-US`. The stored
configuration contradicts the product's intended defaults on the very screen
that prints both.

## Root Cause

A configuration value rather than a code defect: production's `platform-defaults`
row carries a Pakistan/PKR profile while every plan price, invoice, payment and
subscription is QAR.

A smaller design question sits underneath it. Silently narrowing a
multi-currency business to one currency and printing `0` is misleading whatever
the currency is set to. A dashboard that cannot show mixed currencies should say
so rather than render a confident zero.

## Impact

The primary operational view of the business reports no revenue while revenue
exists. Anyone opening the Control Hub to judge whether the platform is selling
would conclude it is not. Reachable by every platform operator, in production, on
the default landing screen.

## Affected Areas

Control Hub dashboard, `super-admin` dashboard summary, and the platform
defaults settings screen.

## Proposed Resolution

Two parts, and they are separable.

1. **Owner decision, one screen.** Set the reporting currency to the currency the
   business actually reports in — on the evidence, `QAR` — in
   Settings → Platform → General. Reversible, and it takes one edit. QA
   deliberately did not make this change: which currency the business reports in
   is a commercial decision, not a QA call.
2. **Product change.** Make the dashboard honest about currency: convert to a
   reporting currency, or show per-currency totals, or state that the figures
   exclude other currencies. A zero meaning "nothing matched this filter" should
   not render identically to a zero meaning "nothing was earned".

## Acceptance Criteria

- With the reporting currency set correctly, the dashboard shows the collected
  revenue that Invoices and Payments already show.
- A revenue figure that excludes records in other currencies says so.
- A regression test covers the aggregate against records held in a currency
  other than the reporting currency.

## Regression Coverage

None yet.

## Dependencies

Part 1 needs an owner decision on the reporting currency.

## Related Items

[[BUG-1749]] — the plan catalogue carries three inconsistent notions of
currency, which is the same confusion one layer down.

## Resolution

Partially fixed 2026-08-28 on `agent/open-bug-sweep` — the product half. The
owner decision is deliberately untouched.

This record separates the two, and is right to. **Which currency the business
reports in is a commercial decision**, and QA explicitly declined to make it;
so did I. The stored platform default still says PKR.

What is fixed is the second half: a zero that means "nothing matched this
filter" no longer looks like a zero that means "nothing was earned". The
dashboard payload now carries `excludedCurrencies` — every currency holding
succeeded payments that the reporting-currency filter left out, with the amounts
and counts — and the header renders a note naming them.

So production would now show "Collected revenue PKR 0" beside "Excludes QAR",
with the QAR total on hover, rather than a confident zero. That does not make
the figure right; it makes it honest, which is what this record asks for. The
deeper options it lists — converting to a reporting currency, or showing
per-currency totals — are larger product work and remain open.

## QA Retest

Not retested in a browser, and **the owner decision is still outstanding**.

The check: the Control Hub with the reporting currency set to PKR should show
the exclusion note naming QAR. Setting the reporting currency to QAR in
Settings → Platform → General should make both the note disappear and the
figures populate — that single edit is what this record asks the owner to make,
and it is reversible.

If the note appears when nothing is actually excluded, that is a regression in
the opposite direction and worth reporting.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - the dashboard now names the currencies its filter excludes. The reporting-currency setting is the owner's call and was NOT changed. REG-294.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]
- Regression — REG-294 (see the regression register)

<!-- GRAPH:END -->
