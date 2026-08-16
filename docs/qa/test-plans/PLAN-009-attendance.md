---
PLAN_ID: PLAN-009
aliases: [PLAN-009]
TITLE: Attendance
AREA: attendance
STATUS: CURRENT
MODULES: [services/api/src/modules/attendance, services/api/src/modules/attendance-engine, services/api/src/modules/attendance-integrations]
RISK: CRITICAL
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: PARTIAL
COVERAGE_E2E: PARTIAL
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-0002, BUG-0047]
RELATED_REGRESSIONS: [REG-002]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-009 — Attendance

## Scope

Punch interpretation, session building, geofencing, impossible-travel detection, correction workflow, and ingestion from devices and the gateway. Attendance is payroll input, so an error here is a money error.

## Risks

- Self-approval of one's own correction (`BUG-0002`) — and per `BUG-0047` the
  regression test for it is **not on `main`**, which is why SECURITY is declared
  `GAP` here rather than covered.
- Punch pairing across midnight, shift boundaries and daylight-saving changes.
- Geofence evaluation treating a missing location as inside.
- Ingestion counting a replayed device batch twice.

## Preconditions

Configured work patterns, at least one geofenced site, and a device or gateway able to submit raw punches.

## Test Types

`UNIT` is strong. `E2E` needs a live database. `PERFORMANCE` is a real `GAP` — bulk ingestion has no baseline measurement.

## Data Requirements

Employees on different work patterns, including one crossing midnight.

## Security Cases

Correction approval must reject the requester as approver, and every attendance query must be tenant-scoped and access-scoped.

## Negative Cases

Punch out with no punch in · punch outside the geofence · correction approved by its author · replayed device batch · punch for another tenant's employee.

## State Transitions

`RAW → INTERPRETED → SESSION → CORRECTION_REQUESTED → APPROVED/REJECTED`. A rejected correction leaves the original session intact.

## Integration Cases

ZKTeco devices via the .NET gateway, plus the desktop agent. Both retry, so ingestion must be idempotent.

## Browser Cases

The daily attendance and correction screens.

## Regression Links

`REG-002` — **inactive on `main`**, see `BUG-0047`.
