---
ID: ADR-0031
aliases: [ADR-0031]
Title: Work components in the package engine, and accountability rules for blockers
Status: PROPOSED
CreatedAt: 2026-11-26
UpdatedAt: 2026-11-26
---
# ADR-0031 - Work components in the package engine, and accountability rules for blockers

## Status

Proposed - 2026-11-26. Implemented by DP-MASTER WP-21.S1, WP-38.S1, WP-03.S4 and the
WP-03/04 hardening. Several choices below were taken by the implementing agents, not
by the owner; each is marked **Owner may reverse** and says what reversing costs.

## Context

WP-35.S2 shipped work profiles as `.djpkg` components through a separate importer.
The master plan requires one package engine (L01-L05) and no competing one. Separately,
the plan requires blockers and downtime to be reported without turning an outage or a
slow approval into an employee's low output (WP-38, M05).

## Decisions

### 1. Work units, profiles and queues travel through the one package engine

`workUnit`, `workProfile` and `workQueue` are solution component types
(`CustomizationSolutionComponentType`). Release, export, dry-run, import and
uninstall all run through `PackageAlmService`; the work writes go through
`WorkProfilesService` / `WorkQueuesService` inside the engine's single transaction, so
validation, immutability and audit live in one place. The earlier importer is a thin
caller of the same service. Artifacts carry logical keys only: no row ids, tenant ids,
team or business-unit ids.

### 2. Adoption of an identical local component (Owner may reverse)

When a package is imported and the target tenant already has a unit, profile or queue
with the same key, owned by no package, and **exactly the same definition**, the engine
adopts it (status UPDATE, nothing rewritten) instead of reporting a conflict. A
different definition is a CONFLICT. Reversing means every first import onto a tenant
that built the same thing by hand reports conflicts the operator must resolve manually.

### 3. Uninstall deactivates, it does not delete (Owner may reverse)

Uninstalling a package deactivates its work components and keeps them with their
history (`retainedWorkComponents` in the result). It is blocked while open assignments,
open work items on a profile's versions, open items in a queue, or a profile outside the
package that uses one of its units exist. Closed history never blocks. Reasons: an
assignment restricts a profile delete, and deleting a queue would null the queue of
every item that ever waited in it. A later reinstall onto an inactive component
reactivates it. Reversing to true deletion needs a data-retention decision for the
history that references the component.

### 4. Blockers never assign blame by themselves

- The **cause** of a blocker starts `UNDETERMINED` and is never inferred by the system.
- A reporter may state their own view when raising it; afterwards the cause is set only
  by a reviewer. The person a blocker waits on, and anyone doing the delayed work,
  cannot set or change it (they can still resolve or raise).
- Blocked time is reported **beside** effort by category and by cause, with undetermined
  and worker-controllable delay as separate rows; it is never subtracted from effort or
  folded into a score.
- Escalation is a deliberate, audited act, bounded at 3 levels, and race-safe.
- Whoever a blocker waits on can see that one work item (and only that) while it is open.

### 4a. Workflow delivery rules (WP-03/04)

Recipient authorisation is re-checked on every attempt (a person who left is skipped
with a recorded reason); a step is claimed with a compare-and-set and settled only by the
holder of its claim (fenced by attempt number); a claim taken from a crashed worker
consults the delivery log before re-sending; fan-out is bounded (50 recipients per
action, 200 steps per run, 25 workflows per event, the excess refused visibly);
delivery results are read back by a reconciler, optionally on a timer
(`WORKFLOW_RECONCILE_ENABLED`). **Open:** templates are edited in place, so a retry
renders the current content and flags drift; true immutable rendering needs a template
revision history (registered as a later slice).

### 5. Capacity is net of approved leave and holidays, and says what it leaves out

Workload capacity removes approved leave days and holidays once each (weekdays only).
It does **not** model shifts, part-time contracts or half days; the response names that
(`limits`). A person with no capacity left is "unavailable", never 0% or a division by
zero. Scheduling (WP-09) will replace the plain-week basis.

## Consequences

- One engine to test and secure for every portable component.
- Accountability rules are enforced in the service and covered by real-database tests,
  not left to screen wording.
- Decisions 2 and 3 are the two the owner should confirm before the first customer
  package is shipped.

## References

- `docs/programs/dp-master/program-state.json` slices WP-21.S1, WP-38.S1, WP-03.S4
- `docs/decisions/ADR-0030-work-profile-and-work-identity-contracts.md`
