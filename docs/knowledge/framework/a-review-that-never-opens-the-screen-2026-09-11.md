---
TITLE: A review that never opens the screen catches nothing on it
TASK: ITEM-0130
WP: —
CREATED_AT: 2026-09-11
VERIFIED_AGAINST_COMMIT: f26357a8
---

# A review that never opens the screen catches nothing on it — 2026-09-11

A task shipped through CI, a full framework validation, 1,598 web tests and a
post-deploy verification. Minutes later the user found four defects on the
screen the work had just changed and the screens next to it: an entitlement
leak in Reports ([[BUG-3007]]), raw UUIDs in every analytics drill-down
([[BUG-3020]]), a horizontal scrollbar in the account menu ([[BUG-3021]]), and
two explanatory cards nobody reads ([[ITEM-0128]]). None was subtle — all four
were visible on first sight of the screen. [[ITEM-0130]] is the durable record
of why a process that ran thousands of assertions found none of them, and this
note is the lesson in a form the next task can act on before shipping, not
after.

Every test that ran was sound for what it covered. The gap was that nothing in
the process looked at a screen until the work was already in production, and
when it did look, it looked only where the change was. Four separate causes,
each mapping to a different kind of gate.

## Cause 1 — a cross-cutting rule enforced on one structure was never checked against its siblings

Already named: [[gate-scoped-to-one-structure]]. The settings tree was audited
exhaustively for a plan-entitlement gate; the reporting catalog — same class
of surface, same capabilities, same sidebar — was never opened, and its own
code carried a comment claiming it was "already permission- and
entitlement-filtered by the API", which named an enforcer that did not exist.
Recorded here again for one reason: **the pattern recurred within hours of
being written down.** Writing a bug pattern file does not, by itself, cause
anyone to apply it on the next task — a reviewer has to be told, in the
reviewer role's own instructions, to enumerate the sibling structures before
approving a cross-cutting fix as complete. See the addition to
[`reviewer.md`](../../../.agent/agents/reviewer.md#open-the-screen-and-its-neighbours--not-only-the-diff).

## Cause 2 — a resolver-level assertion cannot see a rendered defect

The coverage spec for the entitlement work compared two data structures — an
attribution map against the built item registry — which is exactly why it
could not see a raw UUID in a labelled cell, a horizontal scrollbar, or
thirteen paragraphs sitting above the fold: it never rendered anything.
`apps/web` genuinely has no jsdom or React Testing Library
(`apps/web/jest.config.js` says so in a comment), and that absence had been
read as "no rendered check is possible here."

It is not. `react-dom/server`'s `renderToStaticMarkup` renders a plain,
context-light component for real inside the existing Node test environment —
no jsdom, no new dependency, nothing beyond what Next.js already ships — and
the returned markup string can be asserted on directly: does a labelled cell
match a UUID pattern, does a menu's markup carry unexpected overflow-causing
structure, does one section's text appear before another's in document order.
[[ITEM-0128]]'s fix proved this working end to end:
`apps/web/app/(authenticated)/reports/_components/item-0128-caveat-placement.spec.ts`
renders `CaveatPanel` and `ReportsLanding` with `renderToStaticMarkup` and
asserts on the resulting HTML — no provider needed, because `CaveatPanel`
takes no context and `ReportsLanding`'s one hook (`useFormattingContext`)
degrades to `null` with none supplied. A component that reads a required
context, fetches inside an effect, or depends on browser layout (the
`BoundingClientRect` a real overflow measurement needs) is still out of this
technique's reach — jsdom and a testing library are the honest answer for
those, and remain not installed.

## Cause 3 — global chrome touched by no commit in the diff is still in scope

The account menu in [[BUG-3021]] was chrome no commit in that task touched. A
diff-scoped review never opens it, and neither does a test suite organised by
module. [`ui-ux.md`](../../../.agent/agents/ui-ux.md) already asked for
"consistency with the neighbouring screens" as one line among many; the
reviewer addition restates it as a gate — the changed screen and its
immediate neighbours (the tabs beside it, the shell chrome around it) are
opened before completion is reported, or the record says explicitly why none
needed to be.

## Cause 4 — a number can be permitted and still be implausible

The same production run that verified every plan resolved to the right
capability set also walked past an attendance surface showing 36% in one tile
and 107.917% for the same metric beside it, and a trend line drawn from two
points across thirty days. All three are findable by looking; none is
findable by a test that checks entitlement, because "is this number allowed
to be shown" and "does this number make sense" are different questions with
different failure modes.

## The practical rule

Before reporting a UI-visible change complete:

1. Enumerate the other structures that express the same concept as the one
   just fixed, and say which were checked ([[gate-scoped-to-one-structure]]).
2. Reach for `renderToStaticMarkup` before concluding a rendered assertion is
   impossible without new tooling — it covers plain, context-light components
   today, in the same Node test environment every `apps/web` spec already
   runs in.
3. Open the changed screen and its immediate neighbours, chrome included, not
   only the diff.
4. Read the number, not only the guard in front of it.

## Related

- [[ITEM-0130]] — the process record this note answers
- [[gate-scoped-to-one-structure]] — cause 1, in full
- [[BUG-3007]], [[BUG-3020]], [[BUG-3021]], [[ITEM-0128]] — the four defects
- [[checks-argued-not-tested-2026-08-25]] — the neighbouring lesson that a
  passing check is not the same claim as a check that would fail
