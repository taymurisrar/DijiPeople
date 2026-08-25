# Bug pattern — `two-writers-one-field`

**One field carrying two meanings, assigned by two writers that do not know
about each other, with no reserved space between them.**

Neither writer is wrong on its own. Each produces a value that is correct for
the meaning it has in mind. The defect only exists in the overlap, so it is
invisible in both call sites, invisible in code review of either one, and
usually invisible in tests — because a test written by either author exercises
only that author's meaning.

Related to [`divergent-duplicate-guard`](divergent-duplicate-guard.md), but
inverted. There the problem is one rule copied into two places that drift. Here
the problem is two rules crammed into one place that collide.

## What it looks like

Two instances found in the same QA run on 2026-08-25, in unrelated modules.

**A numeric rank sharing a column with a numeric index.** `Country.sortOrder` is
written by the ISO import as an alphabetical position (`0…249`) and separately
by `ensureDefaultCountries()` as a priority rank (`10, 20, … 80`). The ordering
clause is correct:

```ts
orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
```

…and the result is still wrong: the eight priority markets land *inside* the
alphabetical range rather than before it, so "United States" renders between
Argentina and Armenia. Exactly eight values are held by two rows each. See
[[BUG-1305]].

**A diagnostic code sharing a parameter with an attribution code.** `?ref=` is
the partner referral channel, captured to a 30-day cookie under a deliberate
first-touch-wins rule. A checkout-unavailable panel then linked to
`/contact?ref=DP-CHK-01` to pass a support diagnostic. The capture layer cannot
tell the two apart — a diagnostic code and a partner code are syntactically
identical — so the diagnostic takes the slot, and every genuine partner code
that arrives in the next thirty days is discarded. See [[BUG-1303]].

## Why it is dangerous here

Both instances fail *silently and in the safe-looking direction*. Nothing
throws, nothing is logged, and the value that wins is a well-formed value of
the right type. The damage is that the other meaning is lost:

- A commercially important market becomes unfindable in a 250-entry list.
- A partner's commission attribution disappears with no error anywhere.

DijiPeople has a lot of surface where this can happen, because so much of the
product is configuration-shaped: `sortOrder` columns across lookups and module
catalogs, permission and entity keys, settings keys, plan and price keys, module
registry keys, and query parameters on public pages that three frontends and a
gateway all read. Every one of those is a namespace that more than one writer
can reach.

It also compounds with deployment state. `BUG-1305` is *latent* in production
today only because production holds eight countries and nothing else — the
moment the ISO sync succeeds, the collision becomes live for every buyer. A
pattern that is dormant because the data is incomplete is not a pattern that has
been fixed.

## How to catch it

- **Ask who else writes this field.** Not who reads it — who *writes* it. If the
  answer is more than one code path, ask whether they agree on what the value
  means. A seed and a sync are two writers. A user and a generator are two
  writers.
- **Look for a value space with no reserved band.** Priority values that share a
  range with index values will collide as soon as the index grows. Reserve a
  band (negatives, or a separate boolean ordered first) rather than picking
  numbers that happen not to clash today.
- **Distrust a shared query parameter.** `?ref=`, `?source=`, `?id=` and friends
  accumulate meanings. Before adding one, check what already consumes it — a
  capture layer that stores anything matching a character class will store your
  value too.
- **Test the overlap, not the meanings.** A test per writer passes. The test
  that catches this seeds *both* writers and asserts the combined result — the
  full ISO set *plus* the priority set, or a diagnostic code *followed by* a
  partner code.

## Related

- [[BUG-1303]] — diagnostic code in the partner attribution channel.
- [[BUG-1305]] — priority rank colliding with alphabetical index.
- [[BUG-0281]] — the earlier referral-capture defect, whose fix (capture
  globally, first touch wins) is what gives `BUG-1303` its reach. A correct fix
  that widens a channel also widens whatever else can get into it.
- [`silent-config-fallback`](silent-config-fallback.md) — the sibling shape
  where the wrong value is chosen quietly rather than written quietly.
