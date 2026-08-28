---
ID: BUG-1746
aliases: [BUG-1746]
Title: Required fields on unselected tabs are undiscoverable so create forms dead-end
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-274
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1746 — Required fields on unselected tabs are undiscoverable so create forms dead-end

## Summary

Every multi-tab runtime create form refuses to save with the message "Complete
the required fields." while showing no error on the tab the operator is looking
at. The failing fields sit on a tab that is not selected, carries no error
badge, and is not switched to. On the Partner form the dead end is total: with
Partner name filled, the form refuses to save and **no field anywhere in the DOM
carries an error marker**, because the one that fails is worded differently and
lives two tabs away.

## Expected Behavior

When a save is blocked by required fields, the operator can find them: the tab
holding a failure is marked, or the form switches to the first failing tab, or
the summary message names the fields.

## Actual Behavior

A generic "Complete the required fields." appears in the toolbar corner. The
visible tab looks complete. Nothing indicates which tab or which field is at
fault.

## Reproduction

Leads:

1. Platform Admin, **Leads → New Lead**.
2. Fill every field on **Summary** (Company/Lead name, First name, Last name,
   Work email). Press **Save**.
3. "Complete the required fields." appears; no field on Summary is marked.
4. Switch to **Commercial** — Industry, Company size and Source are each marked
   "This field is required."

Customers:

1. **Customers → New customer**. Fill Company name, the only starred field on
   Summary. Press **Save**.
2. Same message; the five failures (Primary contact first name, last name,
   email, Account contact email, Country) are on **Company and Contacts**.

Partners, the worst case:

1. **Partners → New**. Fill Partner name. Press **Save**.
2. "Complete the required fields." appears and a DOM-wide search for
   "This field is required" returns **zero** matches — the blocking field is
   Business email on **Contacts and Users**, and Currency on Summary fails with
   the different wording "Enter a number." (see [[BUG-1747]]).

## Evidence

Captured from the browser during the pass:

- Leads: three errors present on the Commercial tab while the Summary tab, which
  was displayed, showed none.
- Customers: five field blocks reporting "This field is required" on the second
  tab — Primary contact first name, Primary contact last name, Primary contact
  email, Account contact email, Country.
- Partners: enumerating every element in `main` matching "This field is required"
  returned `{ count: 0, fields: [] }` while the toolbar showed "Complete the
  required fields."

The tab buttons carry no error state in any of the three cases.

## Root Cause

Not established in detail. The validation state is computed for the whole form
but rendered only per-field, and per-field rendering only reaches the mounted
tab. Nothing lifts "this tab contains a failure" up to the tab strip.

## Impact

Every multi-tab create form in the Platform Admin console. It does not make
records impossible on its own — an operator who clicks through every tab will
find the fields — but it turns a routine create into a hunt, and on the Partner
form it presents as a form that simply refuses to work.

It also compounds the two blocking defects found in the same pass: an operator
hitting [[BUG-1742]] or [[BUG-1747]] first spends their time searching tabs
before they ever see the real cause.

## Affected Areas

`apps/admin` runtime form and record page, tab strip rendering, all multi-tab
modules (leads, customers, partners, onboarding, contracts).

## Proposed Resolution

Mark tabs that contain validation failures, and switch to the first failing tab
when a save is blocked. Optionally name the failing fields in the summary
message. This is a shared runtime change, so it fixes every module at once.

## Acceptance Criteria

- Saving a form with failures on a hidden tab marks that tab and moves focus to
  the first failing field.
- The summary message is never the only feedback available.
- A form never refuses to save while showing no error anywhere.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

[[BUG-1742]] — lead creation is blocked outright; this defect is what an
operator meets first.
[[BUG-1747]] — the Partner Currency control, whose different error wording is
why the Partner form shows no marker at all.
[[BUG-1422]] — the earlier runtime validation defect; per-field messages were
restored there, and this is the part that was not.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. One shared runtime change, so every
module gets it at once.

Three things together, because any one alone still leaves a dead end:

1. **The tab strip marks failures.** Each tab carries a count badge when it
   holds an invalid field. The badge is not colour alone — it shows the number
   and names itself for a screen reader.
2. **A blocked save moves to the first failing tab.** The operator lands where
   the problem is rather than being told there is one somewhere.
3. **The message names the fields** — up to three, then "and N more" — so it
   stands on its own when the tab strip has scrolled out of view. The generic
   sentence is now the fallback for a form whose fields carry no labels, not
   the normal case.

The server's field errors get the same treatment as the client's: a rejected
field sits on an unmounted tab exactly as easily as a blank required one, which
is what made [[BUG-1742]] read as "no field is marked anywhere".

The logic lives in `apps/admin/lib/runtime/blocked-save-feedback.ts` rather than
inside the record page, so it can be asserted without mounting React — the
defect was never about rendering, it was about which tab the operator is looking
at when the message appears.

Guarded by REG-274.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/blocked-save-feedback.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not yet retested in a browser. Covered by
`apps/admin/lib/runtime/blocked-save-feedback.spec.ts`, whose last assertion runs
against the **real** partner form definition: every required field it declares
must be reachable by both the badge and the tab switch. That is the assertion
that would have failed on the reported form.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  reproduced in a browser against production `e0aeabcd` on three modules.
- 2026-08-28 - tab badges, switch-to-first-failure and a message that names the fields. REG-274.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/blocked-save-feedback.spec.ts`

Proven by:

- `npm --workspace admin run test` — 379 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-274 (see the regression register)

<!-- GRAPH:END -->
