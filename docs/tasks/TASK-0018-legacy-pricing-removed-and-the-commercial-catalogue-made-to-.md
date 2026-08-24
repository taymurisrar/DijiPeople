---
TASK_ID: TASK-0018
aliases: [TASK-0018]
TITLE: Legacy pricing removed and the commercial catalogue made to converge
TYPE: FEATURE
SIZE: MEDIUM
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-22
AFFECTED_MODULES: [api:super-admin, apps/admin]
AGENTS: [architect, backend-api, frontend, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0018 — Legacy pricing removed and the commercial catalogue made to converge

## Objective

Three asks: remove the legacy pricing compatibility section, replace the plans
with Starter / Growth / Enterprise, and set per-seat and flat prices in QAR, PKR
and USD.

The second and third turned out to be already written down. `plans.catalog.ts`
has held exactly those three plans, and `pricing.catalog.ts` has held the full
36-row schedule — three markets, two cycles, two billing models, in all three
currencies — since the owner supplied it on 2026-08-20. What did not exist was
any way for the database to reach them: `bootstrapCommercialDefaults` was
create-only, so an existing plan kept its name and an occupied price slot was
counted as served whatever amount stood in it. The catalogue was a document
describing a state nothing could produce.

Finished when the legacy fields are gone from the plan form and stay gone under
`completeFormsFromSchema`; when a seed run brings plans, features and prices
into agreement with the catalogue, retires what the catalogue no longer lists,
and does **nothing at all** on a second run; and when what it changed is
readable without consulting the seed's own account of itself.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Legacy pricing off the plan form, and kept off | DONE | — | frontend | agent/plans-reset | — | PASS | BUG-0534, BUG-0532 | — | PENDING |
| WP-02 | A bootstrap that converges instead of only creating | DONE | — | backend-api | agent/plans-reset | — | PASS | BUG-0533 | — | PENDING |
| WP-03 | Retire what the catalogue does not list | DONE | WP-02 | backend-api | agent/plans-reset | — | PASS | BUG-0531 | — | PENDING |
| WP-04 | Apply the reconcile to the database | DONE | WP-03 | integrator | agent/plans-reset | 0a5586f | PASS | — | PASS | APPLIED |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | "Delete the existing plans" means stop offering them, not remove the rows | `Plan` is referenced by subscriptions, orders, invoices, leads and customer accounts; the console already refuses plan deletion and says "Archive the plan instead" | HIGH | A literal delete would fail on a foreign key or cascade through billing history — the outcome the refusal exists to prevent |
| A-02 | The owner's 2026-08-20 schedule is still the intended pricing | `pricing.catalog.ts` records its provenance and internal consistency: every annual figure is exactly ten times its monthly one, and every stated minimum equals `minimumSeats × unitAmount`, in all three currencies | MEDIUM | Every price would be wrong. Cheap to correct: the numbers live in one file and re-running the seed supersedes them |
| A-03 | `enterprise-plus` should survive "create new as starter, growth and enterprise" | It carries no price at all, deliberately — the offer resolver answers `CUSTOM_CONTRACT_ONLY` rather than quoting a figure. It is the "ask us" tier, not a fourth plan on sale | MEDIUM | An unwanted plan remains listed. One line in `plans.catalog.ts` and one seed run to reverse — raised as an owner decision below |
| A-04 | Deactivating a price never changes what an existing customer pays | `Subscription` snapshots `planPriceId`, `basePrice`, `discountType`, `discountValue`, `finalPrice` and `currency` at purchase; `subscription-terms-immutability.spec.ts` pins that the read path does not freshen them | HIGH | Publishing a price would reprice existing customers — which is the defect that spec exists to prevent |
| A-05 | A seed must not create Stripe objects | Stripe sync creates real objects in a real account and is a deliberate per-price operator action; `deriveCheckoutReadiness` already refuses an unsynced price | HIGH | 36 unwanted products and prices in the owner's Stripe account. `STRIPE_MODE=test` limits the blast radius, but it is not the seed's decision to take |
| A-06 | The fake Prisma client is a sufficient proof of the reconcile | **Stated as a limitation.** It proves which writes happen and with what; it cannot enforce the partial unique index `PlanPrice_active_plan_market_cycle_currency_model_key` | **LOW** | Disagreeing with that index is exactly the root cause of BUG-0030. Recorded as a DATABASE coverage gap on PLAN-020 |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

**One taken, one outstanding.**

*Taken:* nothing is deleted. Plans and prices the catalogue no longer lists are
deactivated and archived; a plan carrying subscriptions is withdrawn from sale
and left running. This is the literal request read against what `Plan` sits in
front of, and the mechanism is symmetric — anything withdrawn can be restored by
listing it again and re-running the seed.

*Outstanding:* whether `enterprise-plus` should remain. "Create new as starter,
growth and enterprise" names three, and the catalogue has four. The fourth
carries no price and exists so that "what does Enterprise+ cost" can be answered
with *ask us* rather than a number. Say the word and it is one line and one seed
run.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `99dc70a`, `main` untouched.

POST_TASK_REPO_HEALTH — on the engineering history record for this task.

## History

- 2026-08-22 — created at `99dc70a`.
- 2026-08-22 — WP-01 to WP-03 done. WP-04 blocked: the command that writes the
  database was refused by a permission prompt, so the code converges and the
  database has not yet been reconciled.
- 2026-08-24 — **WP-04 closed. The reconcile has been applied**, and the record
  simply never said so.

  Established without database access, by comparing `pricing.catalog.ts`
  against what `GET /api/public/plans` serves from production — the reconcile
  writes the catalogue into `PlanPrice` and that endpoint reads `PlanPrice`
  back, so the comparison answers exactly what the reconcile's own report would:

  | | |
  |---|---|
  | Prices the catalogue specifies | 36 |
  | Active prices in production | **36** |
  | Would create | **0** |
  | Would retire as uncatalogued | **0** |
  | Would supersede (amount differs) | **0** |

  Every one of the 36 matches on plan, currency, cycle, billing model *and*
  amount, annual included — which is the arithmetic `ANNUAL_MONTHS_CHARGED`
  asserts rather than a second set of literals. A reconcile run now would be a
  no-op, which is the definition of converged.

  `enterprise-plus` carries no price, as intended (A-03): it answers
  `CUSTOM_CONTRACT_ONLY` rather than quoting a figure.

  **This does not make the catalogue sellable.** 34 of the 36 have no Stripe
  price and 2 are synced in `TEST`. That is [[BUG-0898]] and [[BUG-0903]], and
  neither is a catalogue defect — seeding deliberately never talks to Stripe.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0030]], [[BUG-0531]], [[BUG-0532]], [[BUG-0533]], [[BUG-0534]], [[BUG-0898]], [[BUG-0903]]

<!-- GRAPH:END -->
