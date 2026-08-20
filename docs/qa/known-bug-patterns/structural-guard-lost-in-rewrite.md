# Bug pattern — `structural-guard-lost-in-rewrite`

**A fix implemented as markup — a wrapper element, an id, an attribute — is
deleted by the next rewrite of that screen. The fields survive because somebody
carries them across deliberately. The guard around them does not, because nobody
remembers it was load-bearing.**

## Pattern

A UX or safety defect is found and fixed structurally:

```tsx
{!canCheckout ? (
  <p id="subscribe-unavailable-notice">…why you cannot buy this…</p>
) : null}

<fieldset disabled={!canCheckout}>
  {/* the fields */}
</fieldset>
```

That is a correct fix. A regression test is written against it, keyed to the
`id` and the `disabled` fieldset, and the record is closed.

Later the screen is rewritten — one page becomes a wizard, a form becomes a
modal, a component is split into five. Whoever does it carries the *fields*
across, because the fields are obviously the point. The wrapper and the `id` are
scenery, and scenery does not get carried.

Every unit test still passes. The behaviour is gone.

## Why it happens in DijiPeople

Three frontends, a metadata-driven runtime, and screens that get rebuilt as the
product's shape changes — `apps/web` alone routes most modules through
`StandardModuleListPage` and friends, which are periodically reworked. A guard
expressed as JSX lives exactly as long as the JSX around it.

The deeper cause is duplication of the *decision*. In the case below, "can this
be bought" was answered by three separate inline conditions in one component —
one for each of two notices, one for the submit button, and none at all for the
control that actually moved the visitor forward. Three copies of a rule drift,
and the copy nobody wrote is the one that breaks.

## Example architecture area

`apps/landing/app/subscribe/`.

[[BUG-0066]] was fixed on the single-page subscribe form with the markup above.
WP-11 of [[TASK-0008]] replaced that page with a five-step wizard —
organization, workspace, owner, agreements, review — and both halves of the
guard vanished: the notice kept its text but lost its `id`, and the fieldset was
replaced by a plain `<div>`.

The result was [[BUG-0082]], and it was *worse* than the original. Before, a
visitor whose plan had no purchasable price wasted one page of typing. After,
they could enter a company's legal identity, a workspace address, an owner's
name and job title, and accept two legal agreements across five screens, before
meeting a disabled submit button on the last one. Nothing kept, nowhere to go.

Reachable the day it shipped: the seeded PKR schedule is a placeholder and no
QAR prices exist, so a visitor in Qatar met exactly this.

**The browser regression test caught it** — it looks for
`#subscribe-unavailable-notice` and a disabled `form fieldset`, and would have
gone red in the `browser-e2e` gate. It was found by reading that test against
the rewritten component during the WP-08 QA campaign, which is the cheaper
place to find it.

## The sibling: a guard whose premise expired

The same campaign found the mirror image, and the two are worth holding
together.

`legal-seed.e2e-spec.ts` asserted that **no** legal document names a legal
entity, registration number or tax number, on the stated grounds that
*"DijiPeople is not incorporated. A page naming an entity that does not exist is
worse than a page naming none."* Correct when written, and a good guard.

The company was subsequently incorporated and the owner supplied its details for
exactly this purpose. The assertion was now forbidding the right answer.

The temptation is to delete it — the premise is gone, so the test is wrong. The
better move is to **invert it and keep the guard**: the operator must be named,
and every registration-shaped number in the corpus must be one the owner
actually gave. Fabricated identity is the failure mode, and it outlives any
particular fact about whether the company had been registered yet.

That inversion found a real defect on its first run: `billing-terms` named no
operator at all. A billing agreement that never says who is charging you.

The rule: **when a test's premise expires, ask what failure it was protecting
against before deciding it has nothing left to do.**

## Detection checklist

- A regression test keyed to an `id`, a `data-testid`, an element type or a DOM
  shape rather than to a function or an API response.
- A screen being rewritten that appears in the regression register — check
  before starting, not after.
- The same predicate written more than once in one component (`!canCheckout`,
  `isReadOnly`, `!hasPermission`), especially when one of the copies is missing
  from a control that advances or submits.
- A wizard or multi-step flow where only the final action is gated. **Gating the
  submit button is not enough when submit is not rendered until the work is
  done.**
- A browser test whose branch condition is "this element is absent" — in a
  multi-step flow, absence usually means "not on that step yet", not "the
  feature is off".

## Required regression test

Move the decision into a named function, and test that instead of the markup:

```ts
export function checkoutBlockedReason(price: PublicPlanPrice | null) {
  if (isCheckoutReady(price)) return null;
  return price ? "…not wired to checkout…" : "…no published price…";
}
```

Returning the sentence rather than a boolean is deliberate: a caller cannot
disable an input without also holding the reason to show. That makes the
accessible description and the inert region arrive together instead of drifting
apart.

Then keep the browser assertion, and point it at the control that matters —
`Continue`, not submit.

## Agent responsible

**Frontend** and **UI/UX** jointly. Whoever rewrites a screen owns the guards on
it, and "I did not know it was there" is what the regression register exists to
prevent.

## Reviewer check

Before approving a rewrite of an existing screen, run
`node scripts/retrieve-knowledge.mjs <module>` and read the regression entries
for it. For each one, ask where the guard now lives in the new code. If the
answer is an element, ask for a function.

## QA check

When a screen is rewritten, **re-read its existing browser scenarios against the
new component** rather than only re-running them. A scenario can pass for the
wrong reason after a rewrite — an absent element satisfying a branch that used
to mean something else — and that is how a green suite hides a returned defect.

## Related records

[[BUG-0082]] — the record this pattern was extracted from.
[[BUG-0066]] — the first occurrence, on the single-page form.
[[premature-completion]] — the neighbouring failure of a fix that was reported
done with half its scope unbuilt.

Regression coverage is REG-077; the reusable scenario is QA-LANDING-011.

## Prevention rule

**A guard made of markup is a guard the next rewrite deletes silently. Express
it as a named function with a unit test, and let the markup consume it.** A
`<fieldset>` can still be the mechanism — but the decision about whether it is
disabled belongs somewhere a rewrite has to import rather than remember.
