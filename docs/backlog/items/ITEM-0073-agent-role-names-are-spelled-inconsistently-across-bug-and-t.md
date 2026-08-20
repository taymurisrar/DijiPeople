---
ID: ITEM-0073
aliases: [ITEM-0073]
Title: Agent role names are spelled inconsistently across bug and task records
Type: TECH_DEBT
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [framework]
Source: ARCHITECT
OwnerAgent: product-backlog-steward
ArchitectDisposition: DEFER
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
LastReviewed: 2026-08-20
NextAction: Normalise OwnerAgent and AGENTS values to the role-file slug, then have backlog-records reject a value that is not a known role
AcceptanceCriteria: scripts/agent-health.mjs reports ROLE_NAME_ALIASES 0 without its alias table, and backlog validation rejects an unknown OwnerAgent
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0073 — Agent role names are spelled inconsistently across bug and task records

## Summary

The same role is written several ways across the record tree: `release-devops`
and `release/devops`, `ui-ux` and `ui/ux`, `backend-api` and `backend/api`, plus
a `knowledge capture` that predates the Knowledge & Graph role. Nothing
validates `OwnerAgent` or `AGENTS` against the set of roles that actually exist,
so each spelling is accepted and stored.

Found while building `scripts/agent-health.mjs` for TASK-0012 WP-10.

## Why It Matters

One role spelled two ways splits its history in half, and every signal derived
from it is then **plausible and wrong** — which is worse than obviously wrong,
because nobody checks it.

Concretely: before normalisation, agent health showed `release-devops` with 3
tasks and `release/devops` with 6, as two unrelated roles with unrelated defect
histories. The repeated-defect detector — the one signal meant to identify a
systemic role weakness — could not see a pattern spread across two spellings,
and would equally have reported a pattern that was really one role's whole
history counted twice.

It also degrades retrieval: an agent searching for what its own role has
previously got wrong finds a fraction of it.

## Evidence

- `scripts/agent-health.mjs` — the `ROLE_ALIASES` table exists solely to
  compensate, and prints `ROLE_NAME_ALIASES` listing every variant it had to
  normalise. Six spellings were found across `docs/bugs/` and `docs/tasks/`.
- `scripts/lib/backlog-records.mjs` — `OwnerAgent` is validated as non-empty and
  never against a vocabulary.
- `scripts/validate-framework.mjs` — `REQUIRED_AGENTS` is the canonical list of
  thirteen role slugs and is not consulted by any record validator.

## Proposed Approach

Two steps, in order, and the second is the one that lasts:

1. Rewrite the existing `OwnerAgent` and `AGENTS` values to the role-file slug.
   Mechanical, and safe — the alias table already records every mapping needed.
2. Export the role vocabulary from one place and have `backlog-records.mjs` and
   `task-records.mjs` validate against it, so a new spelling is rejected at the
   point it is written rather than absorbed.

Without step 2 this recurs the next time somebody types a role name from memory.
No ExecPlan needed.

## Acceptance Criteria

- `node scripts/agent-health.mjs` reports `ROLE_NAME_ALIASES 0` **and** its
  `ROLE_ALIASES` compatibility table has been deleted rather than merely unused.
- `node scripts/rebuild-backlog.mjs --check` fails on a record whose
  `OwnerAgent` is not one of the thirteen permanent roles.
- The role vocabulary has exactly one definition, consumed by the validator and
  both record libraries.

## Dependencies

None. It can be done independently of anything in flight.

## Related Items

- [[TASK-0012]] — found while building the agent-health signal it corrupts.
- `.agent/context/agent-health.md` — states that health is derived from durable
  records, which is exactly why the records must be consistent.

## History

- 2026-08-20 — created at `a42fdf5` during TASK-0012 WP-10. Disposed `DEFER`:
  it is real and bounded, but the alias table makes the health signal correct
  today, and fixing record data is not this program's scope.
