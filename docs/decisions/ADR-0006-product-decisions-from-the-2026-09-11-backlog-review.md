---
ID: ADR-0006
aliases: [ADR-0006]
Title: Seven product decisions from the 2026-09-11 backlog review
Status: ACCEPTED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
---
# ADR-0006 — Seven product decisions from the 2026-09-11 backlog review

## Status

Accepted — 2026-09-11.

Seven decisions, answered by the product owner in one sitting, closing out the
five `PRODUCT_DECISION` records [ITEM-0117](../backlog/items/ITEM-0117-the-question-protocol-has-never-been-used-and-five-user-deci.md) found parked in the backlog
instead of routed through
[`.agent/context/question-protocol.md`](../../.agent/context/question-protocol.md),
plus two further scope calls made in the same session. Recorded together for
the same reason [ADR-0005](ADR-0005-settings-capability-attribution.md) recorded
eight: they are one sitting, not seven unrelated questions, and a future reader
gains more from seeing them decided together than from seven files that each
explain only a fragment of the context.

## Context

`ITEM-0117` observed that `docs/questions/` had never been used across 81
sessions while five records sat at `ArchitectDisposition: PRODUCT_DECISION`,
each blocked on an answer only the user can give. Parking a decision in the
backlog instead of asking loses two things the question protocol exists for:
immediacy (a backlog record waits to be read; a question is meant to reach the
user while the work needing it is in flight), and durability (an answer given in
chat and written into a backlog record does not become a retrievable decision
the way an ADR does).

This ADR is that gap being closed the way `ITEM-0117` itself proposed: raise the
parked decisions, get them answered, and write down the answers where
`retrieve-knowledge` and every future agent can find them. Two further
questions — go-live scope and QA retest scope — were decided in the same
sitting and are recorded alongside the other five for the same reason.

## Decision 1 — Projects and customers get real delete, not retire-by-status

**`DELETE` routes are added for both entities. Retire-by-status is not the
intended model.**

Answers [`BUG-2007`](../bugs/BUG-2007-projects-and-customers-can-be-created-but-never-deleted.md),
which found neither module exposes a delete route — `DELETE /api/projects/:id`
returns a bare 405, and the customers controller has no `DELETE` handler at
all — leaving `PATCH {status: 'CANCELLED'}` as the only retirement path, forever,
in every list and report.

The real work named in that record is not the route, it is the cascade: a
project can carry assignments, timesheet entries and cost allocations, and
`BUG-2007` is explicit that deciding what happens to those is "the real work
here, not the route." That cascade design, plus the usual tenant-scoped delete
rule (`deleteMany` with `{ id, tenantId }`, or read-verify-write in a
transaction), was implementation work this ADR unblocked — and which a sibling
stream then performed in the same session. `ProjectsService.remove` and
`CustomersService.remove` count dependents and refuse with a catalog error
naming the counts, rather than letting the database decide: project assignments
would have cascaded away and payroll cost lines would have been silently
orphaned, while a customer's projects would have surfaced a raw foreign-key
violation instead of a reasoned refusal.

## Decision 2 — Platform admin session lifetime: refusable remember-me, a capped refresh TTL, and an idle-based limit with a warning

**Three related questions, answered together because they are one session
lifecycle:**

1. Platform admin `rememberMe` becomes governable server-side rather than a
   client boolean nothing can refuse — a platform-level policy equivalent to
   the tenant path's `allowRememberMe` gate, per Option 1 of
   [`BUG-2509`](../bugs/BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it.md).
2. The platform refresh token TTL, currently thirty days whenever `rememberMe`
   is set, is capped **well below thirty days**. The exact number is an
   implementation choice consistent with that bound (a week is a reasonable
   starting point) rather than one this sitting fixed precisely — whoever
   implements `BUG-2509` picks and records it.
3. The roughly one-hour session limit `ITEM-0108` observed on both surfaces is
   **idle-based, not absolute**, and must warn before it expires. This is the
   more forgiving of the two readings `ITEM-0108` weighed, and the right one for
   a product where people fill in long forms — an idle timer does not cut off a
   user who is actively working, and a warning gives them the chance to extend
   before losing it.

Both records move from `PRODUCT_DECISION` to `PLAN_REQUIRED`: the decision is
made, the implementation — the policy store, the TTL value, the idle-timer
mechanism and its warning UI — is not part of this ADR.

## Decision 3 — Approval routing accepts an invited reporting manager, falling back to the approval matrix

**An `INVITED` (not yet activated) reporting manager may still hold an approval
step. Where routing would otherwise require an active manager, it falls back to
the configured approval matrix instead of refusing.**

Answers [`ITEM-0106`](../backlog/items/ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti.md):
without this, an entire team is blocked from submitting leave behind one
person's activation email, which is exactly backwards for onboarding — the
period when nobody has activated anything yet is the period the product most
needs to work. This is the fallback-to-matrix option `ITEM-0106` itself
recommended, and it is the one `BUG-1968` (routing ignores a configured matrix)
already needs fixed regardless — this decision confirms that is the intended
behaviour rather than a bug being argued about. `BUG-1969` (an invited approver
rejected with a tenancy-shaped error message) is corrected by the same change:
once an invited manager is accepted, the message describing them as belonging to
the wrong tenant no longer applies.

## Decision 4 — One canonical tenant name, and the sidebar's most prominent line carries it

**The workspace shell shows the tenant's own name — not the literal word
"Workspace" — in its most prominent slot, and the same resolved name (the
existing `effectiveTenantName` precedence: `shortBrandName` → `brandName` →
company display name) is used everywhere the shell states the tenant's
identity, rather than different fields disagreeing in adjacent slots.**

Answers [`ITEM-0114`](../backlog/items/ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-.md),
which found the tenant named four times and described twice on one screen, with
two of the four names actually different strings — the sidebar brand block reads
`brandName` while `TenantCard` and `effectiveTenantName` read `shortBrandName`,
so a tenant that fills in both correctly gets both rendered, truncated,
inconsistent, a few hundred pixels apart. The largest text in the sidebar is
currently the constant "Workspace", which is the most prominent identity slot in
the product saying nothing about the tenant occupying it. The specific
consolidation — how many slots survive, which literal strings and defaults are
removed — is implementation work `ITEM-0114` still tracks; this decision settles
which field wins and what the top line must say.

## Decision 5 — Provisioning seeds no departments

**`seedTenantWorkforceReferenceData` stops upserting `DEFAULT_DEPARTMENTS`
(Human Resources, Operations, Finance, Information Technology) on every tenant.
A tenant creates its own departments.**

This is Option 3 of [`ITEM-0115`](../backlog/items/ITEM-0115-provisioning-seeds-four-departments-with-no-business-unit-on.md),
chosen over leaving the four rows in place with no business unit (Option 1 —
cheap, but leaves every tenant with rows invisible to any `BUSINESS_UNIT`-scoped
role) and over assigning them a default business unit at provisioning (Option 2
— requires a default business unit to exist before a tenant has configured any,
which is new product surface). `ITEM-0115`'s own acceptance criteria are
explicit that Option 2 or 3 "would need one before implementation" — an
ExecPlan covering the migration path for tenants that already carry the seeded
rows, since removing the seed changes provisioning behaviour on a live
multi-tenant deploy and says nothing about the rows tenants already have. That
ExecPlan is not written by this ADR.

## Decision 6 — Go-live blockers stay with the product owner

**No plan currently has a sellable price
([`BUG-0898`](../bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md))
and production Stripe runs in test mode
([`BUG-0903`](../bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md))
by commercial decision, not by omission. Both stay `ACCEPTED_RISK`. No agent
flips either — pricing and payment-mode changes are switched by the product
owner directly, not inferred or actioned as a side effect of unrelated work.**

Both records are already at `Status: ACCEPTED_RISK` /
`ArchitectDisposition: ACCEPTED_RISK`; this decision confirms that is the
durable state rather than an oversight awaiting correction, so a future agent
reading either record does not read "unresolved" where "deliberately not yet
resolved by the business" is meant.

## Decision 7 — QA retesting is local and CI only; production access is read-only

**Retesting the 53 `FIXED`-but-unretested bug records ([ITEM-0116](../backlog/items/ITEM-0116-53-bug-fixes-are-regression-covered-but-have-never-been-qa-r.md)) runs
locally and through the repository's automated suites. Production access for
verification is read-only: no email is sent from a retest, and no record is
created in production as a side effect of one.**

This is the scope this ADR's own session gave `ITEM-0116` directly, recorded
here so a future QA pass over the same population — or any future retest —
inherits the boundary rather than re-deriving it. It does not relax any bug
record's own stated retest boundary (several are explicit that they cannot be
retested without a live external dependency); it states the default posture for
the ones that can be retested by some means, and the means available exclude
sending real mail or writing rows into the production database.

## Consequences

- `docs/bugs/BUG-2007`, `docs/bugs/BUG-2509`, `docs/backlog/items/ITEM-0106`,
  `docs/backlog/items/ITEM-0108`, `docs/backlog/items/ITEM-0114` and
  `docs/backlog/items/ITEM-0115` each carry `RelatedADR: ADR-0006`.

  This paragraph originally said all six moved to `PLAN_REQUIRED` and that none
  was implemented by this ADR, on the reasoning that the decision and the
  engineering should be kept separate. That was written while a sibling stream
  was implementing four of them in the same session, and the two halves met at
  integration: `BUG-2007` (real delete for projects and customers, with the
  dependent-data refusal that record named as the actual work), `ITEM-0106`
  (routing accepts an `INVITED` reporting manager), `ITEM-0114` (the workspace
  name in the sidebar's prominent slot) and `ITEM-0115` (provisioning seeds no
  departments) are **implemented and closed**, not planned.

  `BUG-2509` and `ITEM-0108` — the platform session-lifetime work — remain
  outstanding, because they need a policy store and a schema change rather than
  only code.

  The correction is left visible rather than rewritten away, because the useful
  lesson is in the collision: an ADR that states what will happen next can be
  overtaken by the work it authorised, and a consequences section is a claim
  about the future that ages the moment it is written.
- [ITEM-0117](../backlog/items/ITEM-0117-the-question-protocol-has-never-been-used-and-five-user-deci.md) closes: the mechanism this ADR demonstrates — a specialist
  names the open questions, the Architect routes them to the user, the answers
  become one durable record — is the question protocol working, even though the
  formal `docs/questions/` scaffold (`scripts/new-question.mjs`) was not used to
  carry these particular five. That gap — nothing requires a `PRODUCT_DECISION`
  record to carry a question id — is `ITEM-0117`'s "durable half" and remains
  open as future work if the protocol needs enforcing rather than only
  available; it is not addressed by this ADR.
- No code changes ship with this ADR. Six backlog records now carry a decision
  their implementer can build against without asking again.

## Related

- [ITEM-0117](../backlog/items/ITEM-0117-the-question-protocol-has-never-been-used-and-five-user-deci.md) — the record this ADR closes.
- [BUG-2007](../bugs/BUG-2007-projects-and-customers-can-be-created-but-never-deleted.md), [BUG-2509](../bugs/BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it.md), [ITEM-0106](../backlog/items/ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti.md), [ITEM-0108](../backlog/items/ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle.md), [ITEM-0114](../backlog/items/ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-.md), [ITEM-0115](../backlog/items/ITEM-0115-provisioning-seeds-four-departments-with-no-business-unit-on.md) — the records this ADR decides.
- [BUG-0898](../bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md), [BUG-0903](../bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md) — confirmed, not changed, by Decision 6.
- [ITEM-0116](../backlog/items/ITEM-0116-53-bug-fixes-are-regression-covered-but-have-never-been-qa-r.md) — scoped by Decision 7.
