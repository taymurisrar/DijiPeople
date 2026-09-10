# Bug Pattern — A gate scoped to one structure stops at that structure's edge

## Pattern

A cross-cutting rule is enforced by walking one structure — a directory tree, a
route table, a module registry — and applying the check to everything it
contains. The enforcement is complete and well-tested **for that structure**,
and structurally cannot reach a second structure that expresses the same concept
a different way. "The gate is built" and "the surface is gated" become different
claims, and the record closes on the first.

The tell is a fix whose completeness argument is a *shape*: "every controller
under a gated module directory", "every route in the table", "every entry in the
registry". Ask what expresses the same concept without living in that shape.

## Why it happens in DijiPeople

This repository deliberately runs metadata-driven registries beside conventional
route modules. The API is organised by directory under
`services/api/src/modules/`. The tenant settings tree is organised by an
in-memory registry of 87 items with categories and groups, assembled in
`apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts`, and it has no
directory of its own. The same is true of the module runtime, the command
registry and the metadata registry.

So a rule enforced "per module directory" covers one of these and none of the
others, and an invariant test written over the module map goes green while the
registries are untouched.

## Example architecture area

**Plan entitlements.** [[BUG-1952]] found that nothing consulted a tenant's plan,
and its fix built the enforcement properly: `EntitlementGuard`, a
`@RequireEntitlement` decorator on 28 controllers, an `ENTITLEMENT_GATED_MODULES`
register, and `entitlement-wiring.invariants.spec.ts` failing the build when a
controller in a gated directory lacks the decorator. That record closed FIXED.

Ten days later a user opened Settings on the Starter demo tenant and was offered
a Payroll & Finance tile with six groups and seventeen configuration pages —
[[BUG-2958]]. The settings tree is not a route module. Its resolver took
permissions and roles and nothing else.

The strongest evidence was already written down in the fix itself:
`ENTITLEMENT_UNGATED_FEATURE_KEYS` exempts `branding` with the reason "a settings
surface rather than a route module; **enforced where settings resolve**, not by a
route gate". The exemption named an enforcer that did not exist. Nobody checked,
because the sentence reads like a decision rather than a claim.

## It recurred within hours of being written

This pattern was written on 2026-09-09 from BUG-2958. The same afternoon, on the
same tenant, the user opened Reports & Analytics and found the third instance:
BUG-3007, an entitlement gate that reaches API route modules and the settings
tree and not the reporting catalog — whose own code asserts, in two comments,
that the catalog "is already permission- and entitlement-filtered by the API".

Recording that here rather than quietly adding a row. **Writing the pattern down
did not cause it to be applied.** The task that authored this file went on to
verify only the structure it had changed, and a reader who wanted to catch
BUG-3007 needed to do step 2 below against a module the task had no other reason
to open.

The practical lesson is in step 1: enumerate the sibling structures *before*
declaring a cross-cutting fix complete, and write the list into the record so
the omission is visible to a reviewer rather than resident in one agent's head.

## How to catch it

1. **Ask what else expresses this concept.** For any rule applied per directory,
   per route or per registry entry, list the *other* structures in the repository
   that carry the same idea. In this codebase that list almost always includes at
   least one metadata registry.
2. **Read every exemption as a claim to verify.** An entry saying "handled
   elsewhere", "enforced by X", or "covered where Y resolves" names a mechanism.
   Open it. If the mechanism does not exist, the exemption is a hole with a
   confident label on it.
3. **Audit the built artifact, not the lookup table.** The first attribution map
   for [[BUG-2958]] was written against `itemPlacement`, a placement lookup, and
   was wrong in both directions: four keys named pages that no longer exist, and
   three real pages fell through to `defaultPlacement` and were missed. One of
   the three was the tenant's own subscription screen, which had landed inside
   the payroll category — so gating by category would have hidden a Starter
   tenant's billing page behind the capability they would go there to buy.
   Comparing against the built item set caught all seven immediately.
4. **Require the closing record to name its own edge.** A fix that gates by
   module directory should say, in the record, which surfaces are *not* module
   directories and what covers them.

## QA check

- Retest an entitlement, permission or scoping fix on **a metadata-driven
  surface**, not only on a REST endpoint. The settings tree, the module runtime
  and the command registry are all reachable by a user and none of them is a
  controller.
- Drive the browser to the screen. Every automated check for [[BUG-1952]] passed
  while the workspace grid offered seventeen payroll pages, because no test
  looked at the grid.
- When a register lists deliberate exemptions, spot-check two of them against the
  code they name.

## Related

- [[BUG-1952]] — the fix that was complete for route modules.
- [[BUG-2958]] — the surface it could not reach.
- [[BUG-3007]] — the third instance, described in "It recurred within hours of
  being written" above.
- [[ITEM-0130]] — the process record raised once the same review pass that
  missed [[BUG-3007]] was also found to have missed three unrelated defects on
  the same and neighbouring screens. This pattern accounts for the first of
  ITEM-0130's four causes; the other three are new lessons, recorded in
  `docs/knowledge/framework/`.
- REG-396 — the regression entry, in the register rather than a note of its own.
- [`per-module-fix-behind-a-per-module-test`](per-module-fix-behind-a-per-module-test.md)
  — the neighbouring shape: one rule fixed in one module and left unfixed in its
  siblings. This one is a rule fixed for one *kind* of place.
- [`assertion-without-a-check`](assertion-without-a-check.md) — an exemption
  naming a non-existent enforcer is the register's version of the same failure.
- [`doc-code-drift`](doc-code-drift.md) — how the ExecPlan for [[BUG-2958]] came
  to be written against a checkout sixteen commits stale, and claimed as missing
  a guard that already existed.
