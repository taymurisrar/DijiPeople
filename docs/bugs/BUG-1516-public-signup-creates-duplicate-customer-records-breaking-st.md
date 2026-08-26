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
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-26
ResolvedAt:
---

# BUG-1516 — Public signup creates duplicate customer records, breaking Stripe tenant resolution

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

Not established. The wizard submits to `/api/public/subscribe` on more than one
step transition, and the endpoint creates rather than upserts. Whether the fix
belongs in the client (submit once, or carry the created id forward) or the
endpoint (idempotency key, or upsert on a natural key) is a design decision.

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

Make signup submission idempotent. Options, in preference order:

1. Client carries the customer id returned by the first call and sends it on
   subsequent steps; the endpoint updates when an id is present.
2. Endpoint accepts an idempotency key minted once per wizard session.

Then make the Stripe resolver's failure mode explicit rather than a 400 —
duplicates should not be able to silently drop a payment event.

Worth an ExecPlan if option 2 is chosen, since it changes a public contract.

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
