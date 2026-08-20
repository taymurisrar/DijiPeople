# Evidence ledger

Expensive results, and the rule for when they stop counting.

`ledger.json` is written by `scripts/evidence.mjs`. It is Git-tracked so a
result survives the session that produced it — the whole point is that the next
session does not re-run an eleven-minute suite to learn what this one already
established.

## The asymmetry that shapes everything here

Re-running a suite that nothing invalidated costs minutes.

Reusing a result after the code beneath it changed costs a **false PASS with a
real command behind it** — the most convincing kind of wrong answer, because the
record points at a genuine run with genuine output.

So every ambiguity resolves towards re-running. An unresolvable SHA, an empty
scope, a non-`PASS` result: all refuse reuse.

## Recording

```bash
node scripts/evidence.mjs record DB-E2E-001 \
  --command "npm --workspace api run test:e2e" \
  --scope services/api/test,services/api/prisma \
  --result PASS --detail "304/304"
```

`--scope` is required. A record with no scope could never be invalidated, which
would make the laziest possible evidence the most durable thing in the ledger.

Scope entries are directory prefixes or simple globs — `services/api/test`,
`services/api/**/*.spec.ts`. Deliberately not a full glob engine: a scope nobody
can read at a glance is one nobody can tell is wrong, and being wrong here means
silently reusing evidence that should have expired.

## Reusing

```bash
node scripts/evidence.mjs check DB-E2E-001 || npm --workspace api run test:e2e
```

`check` exits 0 when the evidence is reusable and 1 when it is not, so it gates
a suite directly. It reports *why*, and when it invalidates it lists the
in-scope files that changed — because the next question is always "changed by
what?".

## Invalidation is by content, never by age

There is no time-to-live, on purpose. A TTL expires a green suite that nothing
touched — reintroducing exactly the cost this exists to remove — and keeps a
stale result alive for the rest of its window after the fixture underneath it
was rewritten. Both failures come from measuring the wrong thing.

A record is invalidated when a file inside its declared scope has changed
between its SHA and the one being asked about. Nothing else expires it
automatically.

`invalidate --reason MANUAL` exists for what the file list cannot see — a flaky
runner, a provider outage. It **marks** the record rather than deleting it: a
removed row leaves no trace that the result was once claimed, and "why did we
re-run that?" is a question somebody asks weeks later.

## What belongs here

Results expensive enough that re-running them is a real cost and stable enough
that reuse is meaningful:

- database E2E suites against a real PostgreSQL;
- browser journeys;
- full-workspace builds and typechecks;
- gateway integration runs;
- external provider smoke tests.

Not: fast unit tests, lint, or anything whose scope is the whole repository.
Evidence whose scope is everything is invalidated by everything, so it never
gets reused and only adds a lookup.
