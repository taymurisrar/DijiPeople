# Feature Documentation

Implementation-facing notes for individual DijiPeople features: **what shipped
and where it lives**.

This is not the place for requirements. Requirements, business rules and
acceptance criteria belong in Obsidian (`04 - Requirements/`,
`03 - Modules/`). See [`../README.md`](../README.md) for the full boundary.

## When to add a document here

Add one when a feature is non-obvious from the code alone — typically when it
spans several modules, introduces permissions, changes the data model, or has
behaviour a future reader would misdiagnose as a bug.

Do not add one for every change. Git history and the code are the primary
record.

## Naming

```
kebab-case-feature-name.md
```

## Suggested shape

```markdown
# <Feature>

## What it does
Two or three sentences.

## Where it lives
- API: services/api/src/modules/<module>/
- Web: apps/web/app/(authenticated)/<route>/ + lib/runtime/modules/<adapter>
- Admin: apps/admin/app/(internal)/<route>/
- Models: <Prisma models>

## Permissions
Keys and RBAC matrix entries introduced or used.

## Tenant scoping
How records are scoped, and any deliberate cross-tenant behaviour.

## Audit and events
Actions written, events raised, notifications sent.

## Settings
Tenant settings that change its behaviour.

## Integrations
External systems involved.

## Non-obvious behaviour
The things that look like bugs but are not, and why.

## Known limitations
What it does not do, and what is deliberately deferred.

## Related
ADRs, architecture documents, Obsidian notes.
```

## Existing feature-adjacent documents

Some feature documentation already exists at the `docs/` root and remains there:

- [`../timesheet-payroll-demo-flow.md`](../timesheet-payroll-demo-flow.md)
- [`../billing/stripe-billing.md`](../billing/stripe-billing.md)
- [`../platform-admin-runtime-and-workflows.md`](../platform-admin-runtime-and-workflows.md)

Extend those rather than creating duplicates here.
