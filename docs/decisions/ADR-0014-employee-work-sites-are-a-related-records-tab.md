---
ID: ADR-0014
aliases: [ADR-0014]
Title: Employee work sites are managed in a related-records tab with a transactional Make primary action
Status: ACCEPTED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
---
# ADR-0014 — Employee work sites are managed in a related-records tab with a transactional Make primary action

## Status

Accepted — 2026-09-13, by the product owner during the second demo walkthrough.
Refines the presentation delivered for [[ITEM-0165]]; tracked as [[ITEM-0179]].

## Context

An employee has one primary location (`Employee.locationId`) and a set of
authorised attendance sites (`EmployeeWorkSite` rows with primary flag and
validity dates). The two are kept in step inside one transaction by
`services/api/src/modules/attendance/attendance-operations.service.ts`.

[[ITEM-0165]] moved the work-site panel into the Organization section as an
in-form widget under the Location lookup. On the live tenant the owner asked why
it is "like that" rather than a lookup or a subgrid with its own tab. The widget
carries three explanatory texts that contradict each other, a cramped add row,
and is editable while the rest of the record is read-only.

The generic related-records subgrid already supports pick-and-assign rows
(`apps/web/app/components/runtime/module-related-subgrid.tsx`, used for project
allocations). What it cannot do through generic create/update/delete is the
transactional "make this site primary" step.

## Decision

**Work sites are a "Work Sites" related-records tab on the employee record,
rendered by the standard subgrid** — columns site, primary, valid from, valid to
— with:

- assign and remove through the existing attendance endpoints;
- a **Make primary** row action that calls the existing transactional endpoint,
  so `Employee.locationId` and the `EmployeeWorkSite` rows still change together;
- the Location field on the form **read-only**, mirroring the primary site;
- the in-form work-site widget and all of its explanatory text removed.

## Reasons

- A set of dated child rows is what a related-records tab is for; the product
  already renders every other employee child collection that way.
- Keeping the transactional endpoint as a row action preserves the one guarantee
  that made the original design a bespoke widget.
- A read-only mirrored Location removes the second place a user could change the
  primary site without updating the authorised set.

## Alternatives Considered

- **Keep the in-form widget and clean it up.** Rejected by the owner.
- **A single Location lookup only, with authorisations managed from Attendance
  settings.** Rejected: hides where an employee may check in from the record.

## Consequences

- Attendance behaviour is unchanged; only presentation and the edit path move.
- Saving the form can no longer change the primary site; that happens only
  through Make primary.

## Migration / Compatibility Impact

No schema change. Existing `EmployeeWorkSite` rows and `locationId` values are
displayed as they are.

## Security / Tenant Impact

The tab uses the existing attendance endpoints and their `attendanceDevices.*`
permissions; every read and write stays scoped by `request.user.tenantId`. No
new endpoint is required unless the subgrid needs a list shape the attendance
controller does not return — any such endpoint must follow the same decorators.

## Agent Rules

- Do not reintroduce a work-site control inside the employee form sections.
- Do not make Location editable on the employee form again.
- Changing the primary site must go through the transactional endpoint, never a
  generic record update.

## Related Modules

`employees`, `attendance`, `attendance-integrations`, `apps/web` runtime.

## Related Features

Employee record; attendance check-in site authorisation.

## Related

- [[ITEM-0179]] — the implementation record.
- [[ITEM-0165]] — the previous presentation.
