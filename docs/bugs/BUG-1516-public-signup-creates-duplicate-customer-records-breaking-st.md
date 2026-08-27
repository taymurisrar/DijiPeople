---
ID: BUG-1516
aliases: [BUG-1516]
Title: Public signup creates duplicate customer records, breaking Stripe tenant resolution
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [super-admin, billing, landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1516 — Public signup creates duplicate customer records, breaking Stripe tenant resolution

> **Architect triage, 2026-08-27 — `FIX_NOW`.** Revenue attribution. Also the most likely cause of BUG-1543, so this goes first.


## Summary

A single signup on the public site creates two identical `Customer` records.
When the Stripe webhook then tries to attribute a payment, it cannot resolve the
Stripe customer to one tenant and rejects the event, raising the CRITICAL
platform alert "Stripe could not tell us about a payment — a customer may have
paid without us knowing."

## Expected Behavior

One signup produces one customer record. Advancing through the wizard updates
that record rather than creating another, so a later Stripe webhook resolves to
exactly one tenant.

## Actual Behavior

`POST /api/public/subscribe` is called more than once during a single wizard
run — each call returns 201 and creates a new customer. Two records with the
same company name, both `PROSPECT`, minutes apart.

## Reproduction

1. Open `https://www.dijipeople.com/subscribe?plan=starter&billingInterval=MONTH&teamSize=10`.
2. Complete step 1 (Organization) and continue.
3. Complete steps 2–4 and continue to email verification.
4. In admin, open Customers sorted by newest.

Two records with the identical company name are present.

## Evidence

Production, 2026-08-26. Two independent runs, both duplicated:

| Company | Created |
|---|---|
| `QA E2E Signup 20260826` | 13:17:07 and 13:21:12 |
| `QA E2E Signup B 20260826` | 13:27:14 and 13:28:53 |

Network panel for the second run shows the cause directly — two accepted
submissions in one wizard pass:

```text
[POST] https://www.dijipeople.com/api/public/subscribe => [201]
[POST] https://www.dijipeople.com/api/public/subscribe => [201]
```

Consequence, on the same payment. Two CRITICAL platform events at 13:36:42,
six seconds before the tenant provisioned at 13:36:52:

```text
"Stripe could not tell us about a payment"
"Stripe subscription customer could not be resolved to one tenant."
```

Render API logs for 13:36:00–13:38:00Z contain exactly two lines, both
`POST /api/billing/stripe/webhook → 400 VALIDATION_FAILED`.

Older duplicates from prior runs are present too — `DijiPeople QA Verification`
appears twice (2026-08-25 23:18 and 23:19).

## Root Cause

**Established 2026-08-27**, by running a fresh paid signup through the browser
and reading both records it produced. Two earlier hypotheses are recorded below
and both were wrong.

The landing wizard creates a **draft customer before it has collected the
buyer's e-mail**. `apps/landing/app/subscribe/subscribe-form.tsx:183`:

```ts
const emailForDraft = form.email.trim() || "pending@onboarding.invalid";
```

The organisation step is step 1; the e-mail is not asked for until step 3. So
the draft is written with a literal placeholder address. After payment,
`SubscriptionOrderService.resolveCustomer` runs with the buyer's real e-mail and
calls `CustomerIdentityService.findExisting`, which matches on `contactEmail`.
The record it is looking for holds `pending@onboarding.invalid`, so nothing
matches and a second customer is created.

The two records from one signup, timestamps a wizard-step apart:

```
e816098c…  17:50:16Z  pending@onboarding.invalid   PROSPECT  "Checkout started"
b409c57c…  17:51:48Z  taimurisrar806@gmail.com     ACTIVE    "Workspace provisioned"
```

The first also carries none of the organisation profile — no legal name, no
registration number, no address — while the second carries all of it. That
asymmetry is the tell: they are written by two different paths, and only the
second one has the buyer's details.

The identity rule is not at fault and neither is the generic e-mail domain. The
match had no chance of succeeding, because the value it matches on was never the
buyer's address.

**Superseded hypotheses, kept so nobody re-treads them.**

1. *"The endpoint creates rather than upserts."* Recorded 2026-08-26. Wrong —
   `resolveCustomer` calls `findExisting` inside the write transaction and
   updates when it matches.
2. *"A generic e-mail domain declined the merge."* Recorded 2026-08-27, by me,
   and also wrong. `gmail.com` is on the generic list and would indeed block
   *domain* matching, but the exact-e-mail rule is checked first and would have
   matched had the draft held a real address. The placeholder is upstream of
   both rules.

## Impact

Two effects, the second serious:

1. Every signup — including abandoned ones — litters the customer list with
   duplicates.
2. Payment attribution becomes ambiguous. In the observed run the tenant still
   provisioned correctly, but the platform's own alert states the risk plainly:
   a customer may pay without the platform recording it. With concurrent real
   customers this is a revenue-integrity problem, not a tidiness one.

## Affected Areas

- `apps/landing` — the subscribe wizard
- `super-admin` — `POST /api/public/subscribe`
- `billing` — `POST /api/billing/stripe/webhook` tenant resolution

## Proposed Resolution

Do not write a customer record before the data that identifies one exists, or
carry the draft forward by something that does not change.

Three directions, in preference order:

1. **Defer the draft** until the e-mail is known. Simplest, and it removes the
   placeholder entirely.
2. **Carry the draft id forward** through the wizard and update that record at
   payment rather than resolving by e-mail. Robust to the buyer changing their
   address mid-wizard.
3. **Match on the submission hash** rather than the e-mail for the draft-to-order
   transition. `buildSubmissionHash` already exists and deliberately excludes
   anything that changes between a refresh and its retry.

Whichever is chosen, `pending@onboarding.invalid` should stop being written to a
column the identity rule matches on. A placeholder in an identity field is a
record that cannot be found by design.

Independently of this, the asymmetry is worth closing: a draft that carries no
organisation profile while its successor carries all of it means the two are
written by paths that do not share a shape.

## Acceptance Criteria

- One complete signup creates exactly one `Customer`.
- Abandoning at any step leaves at most one record.
- A payment for that customer resolves to exactly one tenant, with no CRITICAL
  "could not be resolved" event raised.

## Regression Coverage

To be added: a test asserting one signup run yields one customer, and a Stripe
resolver test covering the duplicate-customer case. `REG-nnn` at fix closure.

## Dependencies

None. Independently fixable.

## Related Items

- [[BUG-1515]] — the same paid signup produced a tenant whose owner could not
  sign in, for an unrelated reason.

## Resolution

Not started.

## QA Retest

Run a full signup and assert a single customer record, then pay and assert no
CRITICAL Stripe resolution event.

## History

- 2026-08-26 — found during production E2E QA; reproduced on two consecutive
  signup runs and correlated with two CRITICAL Stripe webhook rejections.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[billing]], [[landing-architecture]]

<!-- GRAPH:END -->
