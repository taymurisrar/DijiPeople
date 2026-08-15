# Payroll

> Generated from repository evidence at `ad8f77f`. **Thin note — verified
> coverage is far below what this module's risk warrants.**

## Purpose

Turning worked time and compensation into money: payroll runs, payslips, pay
components, tax rules, loans, claims, benefits and business trips.

Modules: `payroll`, `payslips`, `pay-components`, `compensation`, `tax-rules`,
`loans`, `claims`, `benefits`, `business-trips`, `time-payroll`.

## Why it carries the highest correctness bar

Payroll and attendance are the two areas where a defect is **money and time**,
not data quality. The Reviewer's severity scale reflects that: an incorrect
payroll amount is `CRITICAL`, alongside cross-tenant exposure and authn bypass.

Standing rules that apply here more than anywhere:

- For payroll, attendance reconciliation and approvals, **re-read and re-check
  status inside the transaction**. A status read before the transaction is a
  status that may already be stale.
- Compensation data is sensitive: `basicSalary` and bank details require a
  payroll or compensation permission, returned through an explicit `select`.
  That rule was learned the hard way —
  [[BUG-0001-compensation-and-bank-data-behind-employee-record-read]].

## Known bugs

[[BUG-0020-window-prompt-used-for-governed-reasons]] — OPEN.

Two of its nine call sites are the **payroll reversal reason and reversal
date**, collected through a native browser prompt. An unvalidated free-text date
entering a reversal record is a data-integrity risk, not a styling one — which
is why those two are named as the first replacements.

## Gaps

**No QA run in this repository covers payroll.** The regression register has no
payroll entry. Everything above is derived from standing rules and from the one
defect that touched compensation reads; nothing here is evidence that payroll
calculation is correct, because no such evidence exists yet.

That absence is itself the most useful thing this note records.

## Related

[[employees]] · [[attendance]] · [[approvals]] · [[rbac]] ·
[[tenant-application]] · [[qa-and-ci-architecture]]
