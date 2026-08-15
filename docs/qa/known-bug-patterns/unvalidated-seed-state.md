# Bug pattern — `unvalidated-seed-state`

**Code that creates a record writes a state its own validator would reject.**

Creation paths usually build the row directly with Prisma; update paths usually
run it past a validator first. When the two disagree, the record is created
successfully and then cannot be changed — the defect surfaces on the *next*
operation, far from the code that caused it.

## What it looks like

```ts
// creation — writes the literal directly
await tx.customerOnboarding.create({
  data: { status: CustomerOnboardingStatus.NOT_STARTED,
          subStatus: 'Agreement executed' },   // not in the catalogue
});

// update — validates the effective value on every call
assertCustomerSubStatus(status ?? existing.status, subStatus ?? existing.subStatus);
```

`CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[NOT_STARTED]` is
`['Awaiting kickoff','Kickoff scheduled']`, so every later `PATCH` fails —
including one that touches nothing but `notes`, because the validator re-checks
the *existing* sub-status it inherited.

## Why it is easy to miss

- The creating request succeeds, so the happy-path test passes.
- The failure appears on an unrelated later action, with an error naming a field
  the caller never sent.
- The workaround (send a status change in the same request) looks like normal
  workflow, so it can be in use for a long time before anyone reports it.

In REG-010 this blocked the primary journey immediately: every customer
onboarding created by lead conversion was un-editable from birth.

## How to detect it

- For each controlled-vocabulary field (sub-status, stage, category), list the
  places that **write** it and the places that **validate** it, and check that
  every writer would pass its own validator.
- Round-trip the create in a test: create the record through the real path, then
  immediately issue the smallest possible update. That single assertion catches
  the whole class.

## How to prevent it

- Creation paths should ask the catalogue for the default rather than repeating
  a literal: `getDefaultSubStatus('customerOnboarding', status)`.
- Where a literal is unavoidable, assert it in a colocated spec against the same
  catalogue the validator uses.
- Prefer widening the seed to a valid vocabulary value over widening the
  vocabulary — the vocabulary is rendered in the UI, so adding to it has product
  consequences that a seed fix does not.

## Occurrences

| Ref | Where |
|---|---|
| REG-010 | `convertLeadToCustomer` seeding `CustomerOnboarding.subStatus` |
