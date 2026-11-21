---
QUESTION_ID: QUESTION-3931
aliases: [QUESTION-3931]
TITLE: Should tenant administrators keep the ability to create, rename and deactivate the platform-wide shared geography (states, cities), or become platform-only (BUG-3156)?
STATUS: OPEN
CATEGORY: USER_DECISION_REQUIRED
ASKED_BY_AGENT: security
ASKED_AT: 2026-11-21
TASK_ID: 
WORK_PACKAGE_ID: 
BLOCKING: NONE
ANSWER:
DECISION_ID:
KNOWLEDGE_IMPACT: DECISION
---

# QUESTION-3931 — Should tenant administrators keep the ability to create, rename and deactivate the platform-wide shared geography (states, cities), or become platform-only (BUG-3156)?

## Question

Today any tenant's System Administrator can add, rename or hide the states and cities that EVERY customer shares. The tenant settings screen uses this. Should that stay, or should only DijiPeople staff (platform users) be able to change shared geography?

## Why It Matters

One tenant's edit changes the address lists, onboarding and employee records of all other tenants, with no audit trail pointing at the actor, and it can be used to hide a competitor's states (BUG-3156, open since 2026-09 and triaged FIX_NOW). Making it platform-only removes a capability that the tenant settings screen currently offers, so it cannot be done silently. Everything else in SESSION-0136 is independent of the answer (BLOCKING: NONE). BUG-3157, the cross-tenant employee counts, is already fixed and does not depend on it.

## Options

| OPTION | WHAT IT MEANS | COST | RISK |
|---|---|---|---|
| A. Platform-only writes | Create/rename/hide states and cities require a platform user; tenants keep read access. The tenant settings screens for them are removed or made read-only. | Small API change plus a web change; needs a platform-side UI or an operator process for requests. | Tenants that rely on adding a missing city must ask DijiPeople. |
| B. Tenant-owned additions | Tenants may only ADD rows scoped to themselves (new tenant-owned city/state tables or a tenantId on the rows); shared rows become read-only to tenants. | Schema change and migration, query changes in every address lookup. | Largest change; touches employee address handling. |
| C. Keep as is, add guard rails | Keep tenant writes but forbid rename/hide of rows that any other tenant's employees use, and write an audit record. | Small. | Still lets a tenant pollute shared data and can still block others; does not remove the root cause. |

## Agent Recommendation

Option A now, with B as a follow-up only if customers genuinely need local additions. It closes the cross-tenant integrity and denial-of-service risk immediately, is the smallest change, and matches what the repository's own rules say about cross-tenant writes belonging on the platform path. Until you answer, the write endpoints are unchanged (they are not made worse), and the usage endpoints are already tenant-scoped.

## Answer

Filled in when answered, with the reasoning — not only the verdict. A record
that says "option B" tells a future reader nothing about why A was rejected.

This category is durable: once answered, record an ADR under `docs/decisions/`
and put its id in `DECISION_ID`. Without that the answer is lost and the user
is asked the same thing on the next task.
