---
ID: BUG-3883
aliases: [BUG-3883]
Title: Employee profile returns the linked user's password hash and MFA secrets, and 500s for MFA-enrolled users
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: SECURITY
Source: USER_REPORT
DetectedDate: 2026-10-07
DetectedInSha: 94f65fa4
AffectedModules: [employees, apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-647
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: [services/api/src/modules/employees/employee-user-summary.ts, services/api/src/modules/employees/employees.repository.ts, services/api/src/modules/employees/employee-profiles.service.ts, services/api/src/modules/employees/employees.service.ts]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-07
---

# BUG-3883 — Employee profile returns the linked user's password hash and MFA secrets, and 500s for MFA-enrolled users

## Summary

`GET /api/employees/:employeeId` returned the employee's linked login account
as the raw `User` database row. Any caller allowed to read an employee record
therefore received that account's `passwordHash`, `mfaSecretEncrypted` and
`mfaPendingSecretEncrypted`, along with every other User column.

The defect surfaced as a crash instead of as a leak. `mfaLastUsedStep` is a
BigInt, and once an account has signed in with MFA, serialising the response
throws `TypeError: Do not know how to serialize a BigInt`. My Profile and
Employee detail then returned 500 for that person.

## Expected Behavior

An employee response carries only a summary of the linked account: id, email,
name, status, last login and roles. Secrets are never loaded for an employee
query.

## Actual Behavior

- `employee-profiles.service.ts` returned `user: employee.user ?? null`.
- `employees.repository.ts` loaded the relation with
  `user: { include: { userRoles } }`, which selects every scalar User column.
- The owner turned on MFA on 2026-10-07. From then on, `/my-profile` on the demo
  tenant returned "This page failed to load on the server" (digest 1591151279).

## Reproduction

1. Sign in as a tenant user who holds employee read permission.
2. Call `GET /api/employees/<id>` for an employee whose account has never used
   MFA. The body's `user` object includes `passwordHash` and `mfaSecretEncrypted`.
3. Call it for an account that has signed in with MFA. The response is 500
   `SYSTEM_UNEXPECTED_ERROR`.

## Evidence

- Render logs, 2026-10-07 10:43:13 UTC: trace
  `web_a4c2ff68-fa93-4e4f-b82f-37a8635eff0c` on
  `GET /api/employees/7ac8967d-…`, with stack `TypeError: Do not know how to
  serialize a BigInt` at `express/lib/response.js` `json()`.
- The same 500 occurred at 10:08 and 10:08:22. That was before release
  `94f65fa4` reached the API at 10:32, so the release did not introduce it.
- The raw passthrough dates from `b984e570` (2026-04-21). The BigInt column
  dates from `10d5d148` (2026-09-25).

## Root Cause

The profile response mapped every other relation field by field, but passed
`user` through whole. The shared Prisma include loaded the whole User row, so
nothing upstream limited what could leak. The list response in
`employees.service.ts` already mapped `user` to a safe shape, so there were two
diverging hand-written mappings of one relation.

## Impact

- **Exposure:** password hashes and encrypted MFA secrets of tenant user
  accounts were returned to anyone allowed to read the corresponding employee
  record, within the same tenant and the caller's record scope.
- **Window:** since 2026-04-21 for password hashes, and since 2026-09-25 for MFA
  secrets.
- **Not crossed:** tenant isolation. The query is tenant-scoped.
- **Outage:** My Profile and Employee detail returned 500 for every
  MFA-enrolled user.
- **Follow-up:** treat every exposed hash as potentially disclosed.
  BUG-3883's follow-up is to decide whether to force password resets and MFA
  re-enrolment; see Dependencies.

## Affected Areas

- `services/api/src/modules/employees`: the profile, list and detail responses,
  and the shared include.
- `apps/web`: My Profile and Employee detail.

## Proposed Resolution

Load the relation through an explicit safe `select`, and map it through one
shared summary function. Ship as a production hotfix.

## Acceptance Criteria

- No employee response contains a secret User column.
- The User relation is loaded with an explicit select that excludes secrets.
- My Profile loads for an MFA-enrolled user.

## Regression Coverage

REG-647: `services/api/src/modules/employees/employee-user-summary.spec.ts`.

## Dependencies

A product decision is needed on credential rotation for exposed accounts: force
a password reset and MFA re-enrolment, or accept the risk. These are bcrypt
hashes, and the MFA secrets are encrypted at rest with `SECRET_ENCRYPTION_KEY`.

## Related Items

[[BUG-3844]]: the MFA entry points that led the owner to enrol, which exposed the
crash.

## Resolution

- New `employee-user-summary.ts` defines `EMPLOYEE_USER_SELECT` and
  `toEmployeeUserSummary`.
- `employees.repository.ts` now loads the user relation with `select:
  EMPLOYEE_USER_SELECT`.
- Both `employee-profiles.service.ts` and `employees.service.ts` map the
  relation through `toEmployeeUserSummary`.
- Side effect: the profile now returns `user.roles`, the shape the web already
  reads. It previously returned `userRoles`, so the role ids on the My Profile
  form were empty.

## QA Retest

Released to production on 2026-10-07 as `a95a3378` (PR #100).

QA-TENANT-068. The spec passes 4 of 4 cases, and each fix fails it when
reverted. The API suite passes 409 of 409 suites (7,615 tests), and API tsc
reports 0 errors.

## History

- 2026-10-07 — created from the owner's report that My Profile failed in
  production after enabling MFA. Triaged FIX_NOW as a production hotfix.
- 2026-10-07 — released to production at `a95a3378`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]], [[tenant-application]]
- Regression — REG-647 (see the regression register)

<!-- GRAPH:END -->
