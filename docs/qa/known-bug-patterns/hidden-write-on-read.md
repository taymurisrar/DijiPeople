# Bug Pattern — Hidden Write on Read

## Pattern
A `GET` / `list*` / `find*` method calls an `ensure*`-style initializer that
writes to the database:

```ts
async listPlans() {
  await this.ensureDefaultPlans();   // creates rows
  return this.repository.findMany();
}
```

Reading becomes writing. Every caller of a read endpoint is now a writer, with
all the consequences that carries — races, constraint violations, audit noise,
and a 409 returned from an operation that asked for nothing.

## Why it happens in DijiPeople
It is genuinely convenient, and it looks defensive. A screen that needs default
data can guarantee it exists by ensuring it on the way in, and on a fresh
developer database that works perfectly. Three things then hide the cost:

1. **It succeeds locally.** One developer, one request at a time, an empty
   database — the write happens once and is never seen again.
2. **`ensure*` reads as a guard, not a mutation.** The same prefix is used in
   this codebase for genuine assertions (`ensureEmployeeBelongsToTenant`, which
   throws), so the name does not distinguish "check" from "create".
3. **There is often no other bootstrap.** Before [[BUG-0030]], `seed:config`
   never created plans or markets — the read path was the *only* place they were
   ever created, so removing it naively would have left a fresh install empty.

## Example architecture area
[[BUG-0030]] — a production `GET /api/platform-runtime/plans` returned **409
`DATABASE_DUPLICATE_RECORD`**. Opening the Admin Plans screen ran
`ensureDefaultPlans -> ensureAuthoritativePlanPrices`, whose insert violated a
partial unique index.

The audit run alongside it found the same shape in five more read methods —
`LookupsService.listCurrencies`, `listRelationTypes`, `listDocumentTypes`,
`listDocumentCategories`, and `OnboardingService.findTemplates` ([[ITEM-0025]]).
One occurrence is an incident; six is a pattern.

## The two failure modes it produces

**Concurrency.** Check-then-create has no atomicity, so two simultaneous
readers both find nothing and both insert.

**Check/constraint divergence** — the more dangerous one, because it is
deterministic and survives review. The application-level existence check drifts
away from what the database actually enforces. In BUG-0030 the check used
`{ planId, marketId, currency, billingInterval }` while the index enforced
`(planId, billingCycle, currency) WHERE isActive = true` — disagreeing on the
market, on cycle-versus-interval, and on `isActive` simultaneously. The check
passed and the insert failed, every time.

## Detection checklist
- Grep for `await this.ensure`, `initialize`, `bootstrap`, `seed`,
  `createDefault`, `repair`, `syncDefaults` inside methods named `list*`,
  `find*`, `get*`, `read*`.
- For each: does it *write*, or only assert and throw? Only the first is a
  defect.
- Does the existence check name **exactly** the columns of the constraint that
  protects the table, including partial-index predicates like `WHERE isActive`?
- Is there any other bootstrap path? If not, removing the call is not the whole
  fix — the data has to come from somewhere.
- Would two concurrent requests both pass the check?

## Required regression test
Two, because they catch different things:

1. **Read-path purity** — assert the read method contains no bootstrap call.
   Prove it fails when the call is restored. Checking the source rather than
   mocking the repository is deliberate: a repository mock passes just as
   happily when someone moves the hidden write one layer deeper into a helper,
   which is exactly the mistake this pattern invites.
2. **Real database concurrency** — run the explicit bootstrap N times in
   parallel against PostgreSQL and assert row counts are unchanged and nothing
   throws. A mocked Prisma cannot demonstrate a partial unique index or a race,
   which is how the original defect reached production.

`plan-read-path-purity.spec.ts` and `commercial-bootstrap.e2e-spec.ts` are the
reference implementations.

## Agent responsible
Backend/API, with Database for the constraint semantics.

## Reviewer check
On any diff touching a read method, ask what it writes. "It only creates
defaults" is the defect being described, not a mitigation.

On any diff adding an `ensure*` method, ask where it is called from — and check
the whole call chain, not the immediate caller. BUG-0030 was three frames deep:
`list -> ensureDefaultPlans -> ensureAuthoritativePlanPrices -> create`.

## QA check
Call the read endpoint repeatedly and concurrently against a real database, and
assert the row counts of every table it could touch are unchanged.

## Prevention rule
**Reads do not initialise state.** Bootstrap belongs to an explicit lifecycle —
a migration, a seed, a deployment step, or a named operator action — and must be
idempotent and concurrency-safe wherever it lives.

Where a bootstrap must tolerate a race, let the database arbitrate and then
**verify the winning row**. Never treat a unique violation as success on faith:
a conflict can mean "someone else wrote what I wanted", but it can equally mean
the wrong amount, the wrong market or the wrong version, and swallowing it
converts a data-integrity problem into a silent one.
