# Bug pattern — `silent-degradation`

**A fallback that downgrades the *control* instead of its *contents*, and says
nothing.**

Sibling of [`silent-config-fallback`](silent-config-fallback.md), and distinct
from it. There, a missing configuration value becomes a plausible wrong
*answer*. Here, the value is fine and the **interface** quietly reverts to a
weaker version of itself — so the screen looks exactly as it did before the
change that was meant to improve it.

## What it looks like

```tsx
const countries = useCountryOptions();   // { countries: [], unavailable: true } on any failure
…
{countries.unavailable
  ? <input {...fieldProps("country")} />        // ← the thing the change removed
  : <select {...fieldProps("country")}>…</select>}
```

The reasoning behind it is sound and is worth stating, because it is what makes
the pattern survive review: *a buyer must never be unable to complete a purchase
because a reference lookup was slow.* Nobody argues with that. The mistake is
the scope — the fallback was applied to **which control renders** rather than to
**what the control offers**.

## Why it is dangerous here

Three properties compound:

1. **The failure is invisible.** No banner, no console error, no telemetry. The
   only observable is a control that looks like the old one.
2. **It is therefore unfalsifiable from the outside.** "The change did not ship"
   and "the change shipped and degraded" produce identical screenshots. In
   BUG-0350 the field was reported as never having been changed, three days
   after it was.
3. **The degraded state is the one that caused the original defect.** Free-text
   country is what produced "UAE", "U.A.E." and "United Arab Emirates" as three
   customers. A fallback to the defective behaviour is a fix with an off switch
   nobody can see.

A local API process that has not restarted since an endpoint was added answers
404 for it. That is a *routine* condition in development, not an exotic one, so
this fallback fires often.

## How to detect it

- Grep for state named `unavailable`, `failed`, `errored` or `fallback` that is
  consumed by a **ternary over JSX elements of different types** — `<input>`
  versus `<select>`, a table versus a paragraph. A fallback that swaps `props`
  is fine; one that swaps the element is this pattern.
- For any client hook that fetches reference data, ask: *what does the caller
  render when this returns nothing?* If the answer is "the control it had before
  the lookup existed", it is this pattern.
- Ask whether the failure is observable at all. If neither the user nor a log
  can tell the degraded state from the healthy one, nothing will ever report it.

## How to prevent it

- **Degrade the contents, not the control.** Ship a shortlist with the bundle so
  the `<select>` always has something in it, and let the request widen it. The
  network then affects *how many* options, never *whether there are options*.
- **Never disable a control while loading** when a usable default already
  exists. A briefly inert control is one somebody clicks and believes is broken.
- If a genuine degradation is unavoidable, say so on screen. An unannounced
  fallback is a bug report waiting to be filed against the wrong thing.
- Assert the floor, not the happy path: a test that the offered list is non-empty
  *with no request completed* fails against the degraded implementation and
  passes against the fixed one.

## Reviewer check

Any fallback branch that renders a **different element type** than the success
branch is rejected unless the record says why the weaker control is correct and
how the failure becomes visible.

## QA check

Exercise the surface with the dependency down, not only up. A reference lookup
being unreachable is a state to test, not an environment problem to work around.

## Occurrences

| Ref | Where |
|---|---|
| REG-182 | `apps/landing/lib/use-country-options.ts` — the subscribe wizard's country field |
