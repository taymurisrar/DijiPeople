---
ID: BUG-0280
aliases: [BUG-0280]
Title: Self-service checkout leaves a customer with no plan, billing cycle or origin channel
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: cf9ea47
AffectedModules: [api:billing, api:super-admin, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-177
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/checkout-account-and-payment-confirmation
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-21
---


# BUG-0280 — Self-service checkout leaves a customer with no plan, billing cycle or origin channel

## Summary

Two paths create a `CustomerAccount`. The sales-assisted one
(`PlatformLifecycleService.convertLeadToCustomer`) writes twenty-two columns.
The self-service checkout path (`SubscriptionOrderService.resolveCustomer`)
wrote eleven, and the eleven excluded every commercial column Platform Admin's
Customers module reports on — `selectedPlanId`, `preferredBillingCycle` and
`originChannel`.

A customer who bought through the website therefore arrived in Platform Admin
with no plan, no billing cycle and no channel, on a record that was created at
the exact moment all three were known.

## Expected Behavior

A customer record reflects what the customer is buying, from the moment the
order that establishes it is opened, whichever path created it.

## Actual Behavior

Those three columns stay null for the entire self-service lifecycle.
`openOnboarding` writes `selectedPlanId` and `billingCycle` onto the
**CustomerOnboarding** after payment — a different row — so the customer record
is never repaired either.

## Reproduction

1. Buy any plan through the public subscribe wizard.
2. Open the customer in Platform Admin → Customers.
3. Plan, Preferred billing cycle and Origin channel are empty.
4. Convert a lead to a customer in Admin and compare: all three are populated.

## Evidence

- `services/api/src/modules/billing/services/subscription-order.service.ts` —
  `resolveCustomer` wrote `companyName`, the four contact columns,
  `billingContactEmail`, `country`, the spread organization profile, `status`,
  `subStatus` and `leadId`. No commercial columns.
- `services/api/src/modules/super-admin/platform-lifecycle.service.ts:172-243` —
  the sales-assisted comparison, including `selectedPlanId`,
  `preferredBillingCycle`, `originChannel`, `financeContact*`,
  `originatingPartnerId`, `assignedToUserId` and `accountManagerUserId`.
- `services/api/src/modules/billing/services/order-activation.service.ts:180` —
  `selectedPlanId: order.planId` is on `CustomerOnboarding`, not
  `CustomerAccount`. Grepping for the column name makes this look covered; it
  is not.
- `preferredBillingCycle` has no writer anywhere in `modules/billing`.

## Root Cause

`resolveCustomer` was written to answer identity — who is this buyer, and do we
already know them — and the commercial selection was never passed into it, even
though `openOrder` had `planPrice` in hand two lines away. Nothing compared the
two creation paths, so the gap was invisible from either side.

## Impact

Every self-service customer. The Customers list cannot be grouped or filtered
by plan or channel for exactly the cohort self-service exists to grow, and the
revenue split between assisted and unassisted sales is unanswerable from the
data.

## Affected Areas

`billing` checkout, the `customers` runtime module, any report reading
`CustomerAccount.selectedPlanId` / `preferredBillingCycle` / `originChannel`.

## Proposed Resolution

Pass the order's commercial selection into `resolveCustomer` and write all three
on create. For a returning customer, fill gaps and never overwrite — a buyer
assembling a new order must not rewrite the plan on the one they already paid
for, which `openOnboarding` states authoritatively at payment.

## Acceptance Criteria

- A new self-service customer carries plan, billing cycle and origin channel.
- A returning customer's existing values are never overwritten by a later
  checkout.
- `originChannel` is `WEBSITE` for the public path and is not guessed as
  `PARTNER_REFERRAL`, which the flow has no evidence for ([[BUG-0281]]).

## Regression Coverage

`services/api/src/modules/billing/services/checkout-customer-record.spec.ts` —
four assertions over `resolveCustomer` with a recording transaction. Verified to
fail against the defect: removing `selectedPlanId` from the create payload fails
1 of 4.

## Dependencies

None.

## Related Items

[[BUG-0281]] — the attribution columns the same path also leaves empty.
[[BUG-0282]] — why `originChannel` could not be displayed even once written.

## Resolution

Fixed on `agent/checkout-account-and-payment-confirmation`. `resolveCustomer`
takes a `CommercialSelection`, writes all three on create, and gap-fills them
for a returning buyer without overwriting.

## QA Retest

Covered by the regression spec; no manual QA run was recorded.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-177 names `services/api/src/modules/billing/services/checkout-customer-record.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — found while validating what checkout writes to the customer
  record, and fixed in the same task.
