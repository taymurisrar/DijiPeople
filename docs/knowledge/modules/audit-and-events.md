# Audit and Events

> Generated from repository evidence at `ad8f77f`.

## Purpose

Three related mechanisms that answer "what happened, who did it, and what
changed": the audit log, the platform event stream, and error logging.

## Audit

`AuditService.log()` is called for **every state-changing operation a tenant
admin or auditor would need to see**, with `beforeSnapshot` and `afterSnapshot`,
passing the transaction client when inside `$transaction` so the audit row and
the change succeed or fail together.

`tenantId: 'platform'` routes a row to `PlatformAuditLog`. **It is the only
string sentinel in the codebase**; do not invent others.

## Events

Platform-side through `PlatformEventsService`; tenant notifications through the
`notifications` module — catalog → orchestrator → queue → processor. **No domain
service sends email directly.**

Verified emitting correctly with actor and entity references, 2026-08-15:
`LEAD_SUBMITTED`, `PARTNER_INQUIRY_SUBMITTED`, `LEAD_CONVERTED`,
`LEAD_CONVERSION_BLOCKED` on refusals, `CUSTOMER_ONBOARDING_INITIALIZED`,
`CONTRACT_SIGNATURE_REQUEST`, `AGREEMENT_FULLY_SIGNED`, and
`TENANT_PROVISIONING_RETRIED`. Provisioning runs and steps are recorded per
attempt with `trigger`, `attempt` and `failedStepKey`.

No duplicate or noisy emission was observed on the paths exercised.

## Error logs

`HttpExceptionFilter` renders the standard error contract and records the
failure through `ErrorLogsService`. Every response carries a `traceId`, which is
how a support conversation reaches a specific failure.

## Known bugs

[[BUG-0005-cross-tenant-error-log-read-via-support-role]] — VERIFIED, was
CRITICAL. `findForUser` returned the log on the support-role branch **with no
tenant comparison**, while the owner branch three lines below did compare. A
tenant `system-admin` holding a foreign `traceId` read another tenant's log.

The fix returns `null` **indistinguishably from an unknown traceId**, so the
endpoint cannot be used to probe for foreign records. That property matters as
much as the fix itself. Pattern: [[tenant-filter-missing]].

## Standing rules

Never log tokens, passwords, secrets or full request bodies;
`sanitizeForErrorLog` exists for error payloads. A `traceId` is safe to share; a
connection string is not.

## Related

[[multi-tenancy]] · [[api-architecture]] · [[rbac]] ·
[[integration-architecture]]
