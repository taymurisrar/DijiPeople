# Bug pattern — `read-filter-without-a-write-check`

**A rule enforced where records are listed, and absent where they are acted on.**

The listing looks right. The endpoint returns exactly what the caller should
see, review passes, and a screenshot proves it. Meanwhile the write path takes
an id from the client and never asks the same question — so anyone who has an id
can act on a record the listing was careful not to show them.

The ids are rarely secret. Usually they were published by the very endpoint that
has since been fixed.

Related to [`divergent-duplicate-guard`](divergent-duplicate-guard.md), which is
one rule copied into two places that drift. This is one rule applied in one
place and *missing* from another — and the missing one is the place that
matters.

## What it looks like

`GET /api/public/plans` selected a plan's prices like this:

```ts
prices: {
  where: { isActive: true },
  orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
},
```

…while `/public/commercial-config`, over the same rows, correctly narrowed by
channel first, so a `SALES_ASSISTED` price — an internal, hand-negotiated rate —
was invisible to a self-service visitor.

Fixing the listing to match looks like the whole job. It is not. Both public
write paths accepted a client-supplied `planPriceId`:

```ts
if (
  !planPrice ||
  !planPrice.isActive ||
  !planPrice.plan.isActive ||
  planPrice.plan.publicationStatus !== CommercialPublicationStatus.PUBLISHED
) {
  throw new NotFoundException('Plan price not found.');
}
// …no channel check. Anyone with the id can buy the internal rate.
```

Every one of those checks establishes that the record is *real*. None
establishes that **this caller may act on it**. See [[BUG-1378]].

## Why it is dangerous here

The gap is invisible from the outside in exactly the way that matters: the
listing is the thing people look at, and it is correct. A reviewer reading the
diff that fixed the listing sees a filter added and a rule honoured, and has no
prompt to go looking for the second half.

DijiPeople has a lot of surface shaped like this. Any public or tenant-scoped
endpoint that takes an id — plan prices, documents, invoices, contracts,
attendance records, employees — is a place where the read filter and the write
check are written at different times by different people. And the platform's
own scoping rules are conventions rather than database constraints
(`AGENTS.md`: tenant isolation "is enforced by convention, not by the
database"), so nothing catches it structurally.

The failure is also silent and cheap to exploit. No guard is bypassed, no error
is logged, and the request looks exactly like a legitimate one — because in
every respect except entitlement, it is.

## How to catch it

- **For every filter on a read path, find the write path and ask the same
  question.** If listing applies a rule that acting does not, the rule is a
  display preference. Write it down that way in review: "this is a listing
  preference, not an access control."
- **Treat ids as public.** They usually are, or were. "You would have to know
  the id" is not a control, particularly when the endpoint you just fixed is how
  people got them.
- **Check the ordering, not just the presence.** A guard that runs after an
  order is opened or a session created leaves a row behind for a request that
  was refused.
- **Make the refusal indistinguishable from absence.** A distinct "not available
  on this channel" error confirms the record exists and is merely off-limits,
  which is a free oracle for whoever is enumerating.
- **Mutation-test the wiring, do not reason about it.** A test asserting the
  guard is called *before* something else, written with `indexOf`, passes when
  the guard is deleted — `-1` is less than every real index. That exact test
  passed against the mutation until both positions were asserted present first.
  See [`assertion-without-a-check`](assertion-without-a-check.md).

## Related

- [[BUG-1378]] — the case this was written from: internal pricing public *and*
  purchasable.
- [[BUG-1369]] — its symptom, where the client picked the internal price.
- [`divergent-duplicate-guard`](divergent-duplicate-guard.md) — one rule, two
  copies, drifting.
- [`two-writers-one-field`](two-writers-one-field.md) — the sibling shape, where
  two writers share a field instead of two readers sharing a rule.
- [`fail-open-scope`](fail-open-scope.md) — the other way a scoping rule stops
  applying without anyone noticing.
