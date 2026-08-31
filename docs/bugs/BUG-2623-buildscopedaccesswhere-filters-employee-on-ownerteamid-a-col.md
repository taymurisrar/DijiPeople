---
ID: BUG-2623
aliases: [BUG-2623]
Title: buildScopedAccessWhere filters Employee on ownerTeamId, a column Employee does not have
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 1965b5cc
AffectedModules: [services/api/src/common/security/rbac-query-scope.ts]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2623 — buildScopedAccessWhere filters Employee on ownerTeamId, a column Employee does not have

## Summary

`buildOwnedRecordWhere()` adds `{ ownerTeamId: { in: teamIds } }` to the `OR` block it
produces whenever the caller belongs to at least one team. `Employee` has no
`ownerTeamId` column — it has `teamId`, which means something different — so any
query that reaches that branch against `Employee` is built with a predicate on a
column that does not exist. Five modules pass `Employee` where-fragments through
this helper without overriding `ownerTeamIdField`.

## Expected Behavior

A row-scope fragment produced for a model should only reference columns that model
has. A user whose effective access level on an entity is `SELF`, `USER` or `TEAM`,
and who is a member of a team, should get a valid narrowing predicate.

## Actual Behavior

The produced fragment contains `ownerTeamId`, which is not a field on
`Prisma.EmployeeWhereInput`. Prisma rejects an unknown argument at query time, so
the request fails rather than returning a narrowed result set.

## Reproduction

1. Give a user a role whose privilege on `employees:READ` is `SELF`, `USER` or
   `TEAM` (any level that routes through `buildOwnedRecordWhere`).
2. Add that user to any team, so `accessContext.teamIds` is non-empty.
3. Call any endpoint that scopes `Employee` through the helper — for example
   `GET /employees` (`employees.service.ts:321`).
4. The generated `where` contains `{ ownerTeamId: { in: [...] } }` and Prisma
   raises an unknown-argument error.

Both conditions are required: a `SELF`-scoped user with no team membership never
reaches the branch, which is why this has not been noticed.

## Evidence

`services/api/src/common/security/rbac-query-scope.ts`, `buildOwnedRecordWhere`:

```
const ownerTeamIdField = options.ownerTeamIdField ?? 'ownerTeamId';
const teamIds = user.accessContext?.teamIds ?? [];
return {
  OR: [
    { [ownerUserIdField]: user.userId },
    { [userIdField]: user.userId },
    { [createdByIdField]: user.userId },
    ...(teamIds.length > 0 ? [{ [ownerTeamIdField]: { in: teamIds } }] : []),
  ],
};
```

`Employee` in `services/api/prisma/schema.prisma` declares `organizationId`,
`businessUnitId`, `teamId`, `userId`, `ownerUserId` and `createdById`. It declares
no `ownerTeamId`; grepping the model block for it returns nothing.

Call sites that pass an `Employee` fragment with no `ownerTeamIdField` override:

- `services/api/src/modules/employees/employees.service.ts:321` and `:450`
- `services/api/src/modules/employees/employee-access.service.ts:52`
- `services/api/src/modules/documents/documents.service.ts:145`, `:491`, `:550`
- `services/api/src/modules/leave/leave.service.ts:2351`
- `services/api/src/modules/agent/agent.service.ts:352`, `:551`

## Root Cause

`ScopedWhereOptions` treats every ownership column as present-by-default and
supplies a default name for each. There is no way to express "this model has no
team-ownership column", so the helper cannot distinguish a model that uses a
different name from one that has none at all.

## Impact

Any tenant that both uses team membership and grants an entity at `SELF`, `USER`
or `TEAM` level. The failure is a 500 on an ordinary list screen, not a data leak —
the predicate is never silently dropped — so the severity is availability rather
than confidentiality. It is reachable in production; it has simply not been
exercised, because the default roles holding employee access hold it at
`BUSINESS_UNIT` or wider.

## Affected Areas

`common/security/rbac-query-scope.ts`, and the employees, documents, leave and
agent modules through it. The new `modules/reporting` engine is not affected:
`ReportScopeResolver` sanitises the fragment against the columns each data source
declares and drops predicates naming a column the model does not have.

## Proposed Resolution

Let a data source declare that it has no team-ownership column rather than guessing
a name for it — for example by allowing `ownerTeamIdField: null` in
`ScopedWhereOptions` and omitting the term when it is null, matching the existing
treatment of `organizationIdField: null`.

Do not fix it by pointing the predicate at `Employee.teamId`. Being a member of
someone's team is not owning their record, and that change would widen every
`SELF`-scoped employee query to the whole team. This needs an ExecPlan: it changes
row visibility across five modules.

## Acceptance Criteria

- A `SELF`-scoped user who belongs to a team can list employees without an error.
- The produced fragment for `Employee` contains no `ownerTeamId` key.
- A model that genuinely has `ownerTeamId` still receives the team term.
- No access level returns more rows after the fix than before it.

## Regression Coverage

A unit test asserting the exact `where` shape per access level for a model without
a team-ownership column, in the style of
`services/api/src/modules/data/entity-scope.resolver.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-2624]] · [[rbac]] · [[multi-tenancy]] · [[employees]]

## Resolution

Not yet fixed. Contained within `modules/reporting` only — see
`services/api/src/modules/reporting/engine/scope.resolver.ts`, which drops
predicates naming columns the data source does not declare, and logs when it does.

## QA Retest

Not yet retested.

## History

- 2026-08-30 — created from qa run at `1965b5cc`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
