# Feature — {{title}}

> Status: `#status/draft`  ·  Created: {{date}}
> Delete this line once the note is complete. Mark anything not established from
> the repository or confirmed by a human as:
> `TODO: Confirm product/business rule.`

## Business Requirement

What the business needs and why. In business language, not implementation
language.

## Problem

What is wrong, missing or painful today. Who feels it and how often.

## Current Behaviour

What the system does now. Reference the modules and routes involved by path.

## Expected Behaviour

What it should do instead. Be specific enough to test.

## Users / Roles

Which roles are affected, and what each one can do.
System roles: `global-admin`, `system-admin`, `system-customizer`, `ceo`,
`manager`, `hr`, `recruiter`, `payroll-manager`, `employee`. Tenants may define
more.

## Functional Requirements

1.
2.
3.

Numbered and testable. Each should map to at least one acceptance criterion.

## Architecture Impact

### Database

Models added or changed. New fields, indexes, uniqueness (tenant-scoped on
tenant-owned models). Migration and whether it is destructive. Backfill needed?
`None` if no schema change.

### Backend

Modules, controllers, services, repositories, DTOs. New endpoints with method,
path, request and response shape. Transaction boundaries. Existing services
reused rather than reimplemented.

### Frontend

Which app. Whether this uses the module runtime / settings runtime, or needs a
bespoke screen — and if bespoke, why the runtime cannot express it. Shared
components reused. Loading, error, empty and access-denied states.

### Permissions

New or changed permission keys and RBAC matrix entries. Which roles receive
them. Access levels (`OWN` / `TEAM` / `BUSINESS_UNIT` / `ORGANIZATION` /
`TENANT`). Remember: endpoints need **both** `@Permissions` and
`@RequirePermission`, plus row-level scoping in the service.

### Integrations

External systems touched. Contract changes affecting the .NET gateway, the
desktop agent, Stripe, email or storage.

### Events / Audit

What is audited (action name, entity type, snapshot contents). Platform events
raised. Notifications sent, and to whom.

## Tenant Isolation

How every new query is scoped, and where `tenantId` comes from (it must be
`request.user.tenantId`). Any deliberate cross-tenant behaviour, and its
justification. How a reviewer can confirm no cross-tenant read or write is
possible.

## Edge Cases

Empty states. Timezones and DST. Period and month boundaries. Zero and negative
amounts. Concurrent actors. Partial failure. Historical data predating this
feature. Tenants with the feature disabled.

## Acceptance Criteria

- [ ]
- [ ]
- [ ]

Written so someone else can verify them without asking you.

## Dependencies

Other features, decisions, data, credentials or external systems this needs.
What is blocking.

## Out of Scope

What this deliberately does not do. Naming it prevents scope drift during
implementation.

## Implementation Plan

Link to the ExecPlan in `06 - Implementation Plans/`. The ExecPlan is the
detailed technical plan; this note is the requirement.

## Testing Requirements

What must be tested and how. Which existing spec files should be extended.
Manual verification steps where automation is impractical.

## Related Modules

`[[Module — ...]]`

## Related ADRs

Links to `docs/decisions/` in the repository, or notes in `05 - Decisions/`.

## Status

`#status/draft` → `#status/needs-review` → `#status/confirmed` → Implemented →
Released
