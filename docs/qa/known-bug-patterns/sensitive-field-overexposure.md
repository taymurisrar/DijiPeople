# Bug Pattern — Sensitive Field Overexposure

## Pattern
Authorization is correct for the *entity* but wrong for the *data returned*. A
query without an explicit `select` publishes every column, including fields far
more sensitive than the permission implies.

## Why it happens in DijiPeople
Prisma returns all scalar fields when no `select` is given, and services
routinely spread the row into the response. A model that starts benign acquires
sensitive columns later, and every existing endpoint silently begins returning
them. Nothing in the type system flags it.

## Example architecture area
`getCurrentCompensation` was gated on employee-record READ and returned the
whole `EmployeeCompensation` row — `basicSalary`, `bankName`,
`bankAccountTitle`, `bankAccountNumber`, `bankIban`, `bankRoutingNumber`,
`taxIdentifier`. `getProfile` embeds the same value, so `GET /employees/:id`
leaked it too. The **write** side of the same resource required `payroll.write`;
the read side required nothing comparable.

Reporting-hierarchy access made it worse: a manager reaches their whole subtree
without holding any RBAC privilege at all.

A second instance: `GET /tenant-settings/features/availability` returned
`subscription.finalPrice` — what the tenant pays — to every authenticated user.

## Detection checklist
- Does the query use an explicit `select`?
- List the model's columns: money, bank details, national identifiers, tokens,
  secrets, pricing?
- Compare authorization on read with authorization on write for the same
  resource — asymmetry is a smell.
- Who can reach this record? Reporting-hierarchy reads bypass RBAC privileges.
- Is the same value embedded in a larger aggregate endpoint?

## Required regression test
A caller with entity read but without the sensitive-data permission receives
`null` or a redacted projection, and the sensitive field names appear nowhere in
the serialized response.

## Agent responsible
Backend/API.

## Reviewer check
Explicit `select` on anything carrying money, bank details or identifiers, and
check the aggregate endpoints that embed it.

## QA check
Assert absence of the sensitive fields **by name**, and assert that denial is
indistinguishable from "no record exists".

## Prevention rule
Authorization must match the sensitivity of the data returned, not the entity it
hangs off. Name your columns.
