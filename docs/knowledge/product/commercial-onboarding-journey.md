# Commercial Onboarding Journey

> Generated from repository evidence at `ad8f77f`, and **verified end to end**
> by the 2026-08-15 QA run — 156 scenarios from a public web form to a
> provisioned tenant.

## The journey

```
public website form
   ↓ Lead (source Website, status NEW, attribution DIRECT)
   ↓ qualification
   ↓ Agreement drafted → sent → viewed → signed → FULLY_EXECUTED
   ↓ conversion  (refused without an executed governing agreement)
   ↓ CustomerAccount + CustomerOnboarding seeded automatically
   ↓ onboarding worked to readiness
   ↓ tenant provisioning  (8 steps)
   ↓ tenant owner invited and activated
   ↓ modules enabled within the plan
   ↓ readiness → activation
   ↓ ACTIVE tenant
```

Each arrow is a gate somebody can fail, and most of them were tested as
negatives as well as positives.

## What the gates actually enforce

- **No agreement, no customer.** Conversion is refused and
  `LEAD_CONVERSION_BLOCKED` is emitted.
- **Signing is evidenced.** Hash-chained signature evidence with document hash,
  signer and IP; re-signing is idempotent.
- **A converted lead is terminal.** Re-conversion returns 409.
- **Provisioning is refused while readiness fails**, and a blocked attempt
  leaves no partial tenant.
- **A tenant cannot be activated without an active owner** — `INVITED` does not
  count.
- **A plan-excluded module cannot be enabled by override.**

## Where the journey currently breaks

The QA run's overall verdict was **PASS_WITH_RISKS**, and
`TENANT_PROVISIONING` was **FAIL**:

- [[BUG-0015]] — a tenant that fails before the owner-and-billing step is
  **permanently unrecoverable**, and since the retry fix it now *looks* healthy
  while being unusable. HIGH, awaiting an ExecPlan.
- [[ITEM-0004]] — **activation to `ACTIVE` has never been reached**, blocked by
  the above. The gates are proven; the path through them is not.

Three defects were found and fixed during the run —
[[BUG-0011]] (executed agreements were editable, which moved the conversion
gate), [[BUG-0012]] (every onboarding was born un-editable) and
[[BUG-0013]] (the public lead endpoint had no rate limit).

## Open product questions

- [[ITEM-0007]] — should duplicate website leads be deduplicated? Partner
  enquiries are; website leads are not, and nobody wrote down which was
  intended.
- [[ITEM-0008]] — should a customer carry its origin channel, or is joining back
  through the lead the intended access path?
- [[BUG-0021]] — the `/contact` form invents `industry`, `companySize` and
  `lastName` to satisfy required fields, and has no honeypot unlike
  `/request-demo`.

## Related

[[leads]] · [[contracts-and-agreements]] · [[customers]] ·
[[customer-onboarding]] · [[tenant-provisioning]] · [[partner-program]] ·
[[tenant-lifecycle]] · [[requirement-commercial-onboarding]] ·
[[requirement-lead-conversion]] · [[commercial-onboarding-lifecycle]]
