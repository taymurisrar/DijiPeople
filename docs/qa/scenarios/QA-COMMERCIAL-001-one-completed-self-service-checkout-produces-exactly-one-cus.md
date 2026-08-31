---
SCENARIO_ID: QA-COMMERCIAL-001
aliases: [QA-COMMERCIAL-001]
TITLE: One completed self-service checkout produces exactly one customer record
AREA: commercial-onboarding
MODULE: billing
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: PARTIAL
TEST_REFERENCE: services/api/src/modules/billing/services/checkout-draft-id-reaches-the-order.spec.ts
RELATED_BUGS: [BUG-2530, BUG-1516]
RELATED_REGRESSIONS: [REG-374]
LAST_RUN: 2026-08-30
LAST_RESULT: PASS
CREATED_AT: 2026-08-30
UPDATED_AT: 2026-08-30
---

# QA-COMMERCIAL-001 — One completed self-service checkout produces exactly one customer record

## Preconditions

- A plan with a `SELF_SERVICE`, `PUBLISHED`, checkout-ready per-seat price in the
  market being bought from. Without one the wizard refuses before it reaches the
  step this scenario is about, and the run proves nothing.
- Stripe reachable in whichever mode the environment is configured for.
- Platform Admin access, to read the Customers list afterwards.
- A company name not already present in Customers. Reusing one makes a duplicate
  indistinguishable from a returning-buyer match, which is a legitimate outcome
  of the identity rules and not the defect.

## Steps

1. Open `/subscribe?plan=<key>&billingInterval=MONTH&teamSize=10`.
2. Complete the organisation step with a fresh company name and a real work
   e-mail, and continue.
3. On the workspace step, **type a workspace address and wait for the
   availability answer to appear.** This step is not optional and not cosmetic:
   the availability check is what opens the draft order, and a run that skips it
   exercises a path with no draft to duplicate. It is the step BUG-2530 lived
   in.
4. Complete the remaining steps, accept the legal documents and submit.
5. Enter the e-mail verification code and continue to payment.
6. Complete payment.
7. In Platform Admin, open Customers sorted by newest.

## Expected Result

- **Exactly one** `CustomerAccount` row for the company name, not two.
- That row carries the buyer's real contact e-mail — never
  `pending@onboarding.invalid` — and the organisation profile collected in the
  wizard: legal name, registration number, address.
- Its status reflects the completed purchase, and its onboarding count is 1.
- No CRITICAL platform event is raised for "Stripe subscription customer could
  not be resolved to one tenant", and the Stripe webhook is not rejected with
  `VALIDATION_FAILED`.

Abandoning instead of paying, at any step, must also leave at most one record —
a prospect that can be followed up, not a pair.

## Notes

Created 2026-08-30 at `c18b5024`.

**Why this scenario is manual despite having a regression test.** REG-374 guards
the seam where the value was dropped, and it is the right guard for that: it
fails when the field stops being forwarded. What it cannot do is count the rows a
real signup leaves behind. BUG-1516 was closed on exactly that kind of evidence —
a passing unit guard on one end of the path — and the duplicate carried on
happening in production for days afterwards under a `VERIFIED` record.

So the automated half proves the mechanism is wired; **this scenario is what
proves the outcome**, and the record is not entitled to claim the outcome until
somebody has run it.

Step 3 is the whole scenario in miniature. A tester who tabs past the workspace
field will get one customer record and report a pass against a build where the
defect is fully present.

## Run — 2026-08-30, production on `54f79ac`: PASS

Driven in a browser against `www.dijipeople.com` within minutes of the deploy
going live, then asserted against the production database read-only.

Company `REG374 Verify 20260830`, workspace `reg374-verify-20260830`, Starter
monthly, 10 seats, Qatar. Both calls the defect depends on were observed:

```text
[POST] /api/public/onboarding                                     => 201   draft 01440b66
[GET]  /api/public/onboarding/01440b66-…/workspace-address        => 200   "is available"
[POST] /api/public/subscribe                                      => 201
```

Result:

```text
CUSTOMER ROWS FOR "REG374 Verify 20260830": 1        ✓ EXACTLY ONE
  72bbcf06  2026-08-30T17:49:31Z  PROSPECT  qa.reg374.20260830@dijipeople.com  "Checkout started"

ORDERS FOR THAT COMPANY: 2
  01440b66  DRAFT             customer=72bbcf06   ← the draft the wizard opened
  2e8ef72d  PENDING_PAYMENT   customer=72bbcf06
  distinct customers across those orders: 1        ✓

PLACEHOLDER ROWS IN TOTAL: 8   (8 before this run — this run created none)
TOTAL CustomerAccount rows:  19 (18 before this run — plus one, not plus two)
```

Three things are established, and the third is the one that matters most:

1. **One customer, not two.** The count that was always 2 is now 1.
2. **Both orders resolve to that one customer.** The draft and the submission
   share `72bbcf06`, which is the mechanism working rather than a coincidence of
   counting.
3. **The surviving row holds the buyer's real address**, not
   `pending@onboarding.invalid`. The draft's placeholder identity was *replaced*,
   which is the specific behaviour BUG-2530 restored — a run that merely avoided
   a second row while leaving the placeholder in place would be a different and
   worse outcome, and this distinguishes them.

**Stopped deliberately at the e-mail verification gate.** The duplicate was
always created at submit, before payment — both rows in every historical pair
were written by `resolveCustomer`, which is why the surviving twins of the
never-paid QA runs are still `PROSPECT`. Reaching payment would prove nothing
further about this defect while creating a real tenant, so the run ends here.
Production Stripe is in `TEST` mode; nothing was charged.

The run leaves `REG374 Verify 20260830` as an abandoned checkout — one prospect
with a `DRAFT` and a `PENDING_PAYMENT` order. That is the correct outcome for an
abandonment, and the acceptance criterion "abandoning leaves at most one record"
is satisfied by the same evidence.

> **Correction, same day.** This paragraph first said "the order TTL sweeper ages
> it out". It does not. `SubscriptionOrderService.abandonExpired` exists and is
> covered by an e2e test, but **nothing calls it** — the API registers no
> `@Cron`, no `ScheduleModule`, no scheduler of any kind. Abandoned orders are
> permanent, and so is the `requestedSlug` each one holds under a unique index.
> Filed as its own record; the row this run leaves behind will sit there until
> that is fixed or somebody removes it by hand.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Test plan — [[PLAN-004]]
- Bugs — [[BUG-2530]], [[BUG-1516]]
- Regressions — REG-374 (see the regression register)

<!-- GRAPH:END -->
