# Attendance

> Generated from repository evidence at `ad8f77f`.

## Purpose

Recording and correcting worked time. Feeds timesheets and payroll, so its
correctness is **money**, not just data quality.

## Scope

Four modules cooperate: `attendance`, `attendance-engine`,
`attendance-integrations` and `time-payroll`. Device ingestion arrives through
the on-premise .NET gateway and the Electron agent — see
[[integration-architecture]].

## Authorization

Corrections carry their own permission family, including
`attendance.correction.approve` and `attendance.correction.readTeam`. The
seeded `manager` bundle grants approve, which is what made a self-approval gap
reachable by default configuration rather than by an unusual role.

## Important business rules

- **Nobody approves a correction they are a party to** — not as the subject, not
  as the filer, not as both. Separation of duties is the entire purpose of the
  approval step.
- **`readTeam` means own plus direct reports.** It is not a synonym for
  `manage`, and a scope branch that returns `{}` makes it one.
- Device ingestion must be idempotent: a device that resends must not create a
  second record.

## Known bugs

- [[BUG-0002-self-approval-of-attendance-corrections]] — VERIFIED, HIGH.
- [[BUG-0003-readteam-granted-tenant-wide-visibility]] — VERIFIED, HIGH. Found
  here *and* in [[approvals]] independently, which is what identified it as a
  shared scope-resolution defect rather than two local ones.

[[BUG-0020-window-prompt-used-for-governed-reasons]] touches the attendance
exceptions screen.

## Regressions

REG-002 — `attendance.correction-authorization.spec.ts`.
REG-003 — the same spec plus `approvals.scope.spec.ts`.

`services/api/test/attendance-integrations-isolation.e2e-spec.ts` covers tenant
isolation on the ingestion path.

## Related

[[rbac]] · [[approvals]] · [[employees]] · [[payroll]] ·
[[integration-architecture]] · patterns [[self-approval]], [[fail-open-scope]]
