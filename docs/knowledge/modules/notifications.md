# Notifications

> Generated from repository evidence at `b1c09ac`.

## Purpose

The **only** route for tenant notification and email. A domain service that sends
mail directly is a defect, not a shortcut: it bypasses the event catalog, tenant
templates, scope resolution, the queue and the delivery record.

## Scope

`services/api/src/modules/notifications/`. The pipeline is
**catalog → orchestrator → queue → processor**:

| Stage | File | Responsibility |
|---|---|---|
| Catalog | `notification-events.catalog.ts` | Declares every event code and its channels |
| Orchestrator | `notification-orchestrator.service.ts` | Resolves template and recipients, dispatches |
| Queue | `queues/` | Decouples send from the request |
| Processor | `processors/` | Performs delivery and records the outcome |

In-app delivery is `in-app-notifications.service.ts`; email lives under `email/`.
`notification-diagnostics.service.ts` explains why a notification did or did not
go out — reach for it before adding logging.

## Important behaviour

- **Dispatch is tenant-scoped by construction.** `NotificationDispatchInput`
  takes `tenantId` as a required field, alongside `eventCode`, `channels` and
  `sourceModule`.
- **Template resolution walks a scope chain.** The optional `scope` narrows to
  organization, business unit, department, team, employee or user, picking the
  most specific template available; without it, resolution falls back to the
  tenant template. `notification-scope-chain.spec.ts` pins this.
- **Adding a notification means adding a catalog entry**, not calling the email
  service from a domain module. The catalog is the single source of truth for
  which events exist and which channels they may use.
- `dryRun` exists on the email path — use it rather than pointing a test at a
  real transport.

## Known trap

[[BUG-0050]] — the notification settings UI offered email providers the backend
does not actually implement. The settings surface and the delivery surface are
different modules, and nothing forced them to agree, so the catalog of
*offerable* providers drifted ahead of the catalog of *deliverable* ones. When
adding a provider, change both ends together or the tenant configures a channel
that silently never sends.

## Related

[[audit-and-events]] · [[settings]] · [[BUG-0050]] · [[tenant-isolation]]
