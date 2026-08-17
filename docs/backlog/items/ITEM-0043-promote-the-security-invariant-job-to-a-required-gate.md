---
ID: ITEM-0043
aliases: [ITEM-0043]
Title: Promote the security invariant job to a required gate
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api]
Source: ARCHITECT
OwnerAgent: backend-api
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0043 — Promote the security invariant job to a required gate

## Summary

`security-invariant-report` runs the dual-permission wiring invariant — every
non-`@Public()` handler must declare **both** a legacy `@Permissions(...)` key and
a matrix `@RequirePermission(...)` privilege — and does not gate. The same
invariant is excluded by name from the required `test-api` job:

```
--testNamePattern "^(?!.*declares both permission systems).*$"
```

Both exclusions exist for one reason: a pre-existing inventory of handlers that
declare only one family.

## Why It Matters

`PermissionsGuard` early-returns `true` when **neither** family is declared. A
half-declared route is therefore not "partly protected" — it is open. This is the
single highest-value invariant in the repository, and it is the one currently not
gating.

`BUG-0047` is the argument for taking the exit criteria seriously: the API lint
job sat report-only with a 2-error baseline, nobody read it, and by the time it
was measured again the baseline was 15. A non-blocking check does not hold a
baseline still — it only stops anyone noticing it grow.

## Proposed Approach

Needs an ExecPlan, because closing the inventory means deciding the correct
permission for each handler, and a wrong choice either opens a route or locks out
a legitimate role.

1. Capture the current inventory from the job's uploaded artifact — the count is
   the missing number in this record and should be filled on first triage.
2. Group by module and by whether the missing family is legacy or matrix.
3. Close per module, with the Reviewer on each: a permission key is a security
   decision, not a lint fix.
4. Remove the `--testNamePattern` exclusion from `test-api` and move this job
   into `ci-required`.

## Acceptance Criteria

- The reported inventory reaches zero.
- `test-api` runs without the `--testNamePattern` exclusion.
- Two consecutive green runs on `develop`.
- `security-invariant-report` is either in `ci-required`'s `needs`, or deleted
  because the required `test-api` job now covers it.

## Dependencies

None external. Blocked only on the decision work being someone's task.

## Related Items

[[ITEM-0042]] · [[BUG-0047]] · [[BUG-0007]]

## History

- 2026-08-17 — raised while giving every report-only CI job a measurable exit
  criterion. `validate-framework.mjs` now fails a report-only job that states
  none, so this cannot quietly become permanent.
