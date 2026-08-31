# A fix wired at both ends only

> Generated from repository evidence at `68f4fd2e`. Narrative for REG-374 and
> BUG-2530, which is BUG-1516 recurring in production while its record read
> `VERIFIED`.

## The shape

A defect is fixed by changing two things: the producer that must send a value,
and the consumer that must act on it. Both are built. Both get tests. Nobody
changes the **third** component the value has to pass through, and the value is
dropped there.

Every individual piece is correct. The path is not.

## The instance

Self-service checkout produced two `CustomerAccount` rows per signup. The
subscribe wizard opens a draft customer on the workspace-address step, before the
buyer has been asked for an e-mail, so that row holds
`pending@onboarding.invalid`. Identity resolution matches on the contact e-mail
and cannot find it again, so the real submission created a second customer.

BUG-1516 fixed that in 2026-08-27 by carrying the draft's own id forward:

```
subscribe wizard  ──onboardingId──▶  BillingService  ──▶  SubscriptionOrderService
     changed ✓                        NOT CHANGED ✗           changed ✓
```

`BillingService.createPublicSubscriptionCheckout` re-declares the request shape
as an inline object type. It listed 26 of the DTO's 27 fields and forwarded none
of them onward, so the consumer never received the value the producer was
faithfully sending. Duplicates continued for three more days, in production,
under a record that read `VERIFIED`.

## Why the compiler was silent

**TypeScript does not apply excess-property checking through a spread.** The
controller's

```ts
this.billingService.createPublicSubscriptionCheckout({ ...dto, ipAddress, … })
```

against a parameter type narrower than `dto` is legal and produces no diagnostic.
Passing an object *literal* with an unknown property errors; spreading a wider
object does not. So the one construct that silently discards fields is also the
one construct the type system declines to check — and it is the idiom every thin
controller in this repository uses.

## Why the test was silent

The guard for BUG-1516 called the consumer directly and supplied the value
itself:

```ts
resolveCustomer(tx, { ...INPUT, onboardingId: 'order-1' }, SELECTION)
```

That proves the consumer works. It says nothing about whether anything supplies
the value, so it passed at full green for the defect's entire life — including
through a regression sweep that read it as evidence for `VERIFIED`.

**A guard on the destination passes whether or not the caller calls. A guard on
the caller's payload passes whether or not the destination reads it.** Neither
observes the hop between them, which is where a three-part fix breaks.

## What to do instead

- **Put the guard on the seam, not on either end.** Drive the middle component
  with a doubled downstream and assert the argument it forwards.
- **Assert the value was not merely absent-but-tolerated.** A no-draft submission
  must pass an explicit null, so "the field never arrives" and "the field is
  correctly empty" cannot look identical.
- **Guard the class, not the instance.** Compare the DTO's declared fields
  against the service signature's and fail on any the service would discard. One
  assertion covers every field somebody adds later.
- **Anchor the field name to the contract.** A test asserting `onboardingId`
  against a hand-written string passes just as well for a name no caller sends.
- **Mutation-test the guard.** Remove the fix, watch the test go red, restore it.
  A guard adopted without that step is a guard of unknown strength — which is how
  this defect survived one.

## Two traps met while proving this

**A source-level assertion whose parse stops matching reports agreement.** An
empty set is a subset of everything, so a field-comparison test that quietly
matched nothing would pass forever. Both parses carry a floor assertion for that
reason.

**A mutation applied with `\n` against a CRLF file silently does nothing** and
reports a false pass — the first attempt at mutating this fix did exactly that,
which is the same failure the defect itself is made of. See
[[local-prettier-crlf-vs-ci-2026-08-25]] for the wider CRLF hazard in this
repository.

## Related

- [[billing]] — the module the instance lives in.
- [[landing-architecture]] — the wizard that produces the value, and which
  already carries an instance of the sibling `doc-code-drift` pattern: there a
  *record* claims something the code does not do, where here a *test* does.
