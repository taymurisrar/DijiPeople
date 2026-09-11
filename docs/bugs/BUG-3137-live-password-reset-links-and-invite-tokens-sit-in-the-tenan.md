---
ID: BUG-3137
aliases: [BUG-3137]
Title: Live password-reset links and invite tokens sit in the tenant-readable email delivery log
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/notifications]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3137 — Live password-reset links and invite tokens sit in the tenant-readable email delivery log

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Live reset links and invite tokens in a tenant-readable log is credential storage by accident. Stop persisting the token; log that a message was sent, never its contents.

## Summary

Live password-reset links and invite tokens sit in the tenant-readable email delivery log

Identified by the 2026-09-10 full technical audit as AUTH-01 (confidence: AUTH-01=CONFIRMED).

## Expected Behavior

Token-bearing URLs must never be persisted. Store the invitation id / user id and let the log link to the record, exactly as the platform-admin reset already does (`auth.service.ts:453` stores only `{ source, expiresIn }`).

## Actual Behavior

Every password-reset and account-activation email writes a row to `EmailDeliveryLog` whose `metadata.resetUrl` / `metadata.activationUrl` contains the **raw, still-valid** credential-bearing token (a 24-hour `password-reset` JWT, or the 48-hour invitation token). `GET /api/notifications/email-delivery-logs` returns those rows in full to any user in the tenant holding `notification.logs.read` + `REPORTS:read`.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-01** (services/api/src/modules/auth/auth.service.ts, services/api/src/modules/auth/user-invitations.service.ts, services/api/src/modules/notifications/):

`services/api/src/modules/auth/auth.service.ts:868` — the password-reset email is dispatched with the reset URL in the *persisted* metadata, not only in the rendered body:
```ts
      metadata: {
        userId: user.id,
        employeeId: user.employee?.id ?? null,
        resetUrl,
        source: 'forgot-password',
      },
```
(identical block at `auth.service.ts:1040` for `sendPasswordResetEmail`, the admin-initiated reset)
`services/api/src/modules/auth/user-invitations.service.ts:454` — the same for account activation:
```ts
      metadata: {
        userId: input.userId,
        invitationId: input.invitationId,
        activationUrl: input.activationLink,
        source: 'user-invitation',
      },
```
`services/api/src/modules/notifications/email/email-execution.service.ts:293` — `buildMetadata` spreads the caller's metadata verbatim into `baseMetadata`, which every `createDeliveryLog` call then writes.
`services/api/prisma/schema.prisma:7786` — `metadata Json?` on `model EmailDeliveryLog`.
`services/api/src/modules/notifications/notifications.repository.ts:623` — the list query selects the whole row:
```ts
    db.emailDeliveryLog.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
```
`services/api/src/modules/notifications/notifications.controller.ts:259` — exposed on a tenant-facing route behind an ordinary read permission:
```ts
  @Get('email-delivery-logs')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)   // 'notification.logs.read'
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
```

---


Full finding text: AUTH-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A tenant user with a notifications/reporting role — not necessarily an administrator — triggers "send password reset" for the tenant owner or the payroll administrator from the users screen, then reads the delivery log and follows the link. Full account takeover of any account in the tenant, including one with `hasElevatedTenantRole`, without ever seeing the victim's mailbox. It also permanently archives working credentials in a table that is copied by exports, backups and the tenant-erasure inventory (`tenant-erasure.constants.ts:291`).

## Affected Areas

services/api/src/modules/notifications

## Proposed Resolution

Remove `resetUrl` from both metadata blocks in `AuthService.requestPasswordReset` and `AuthService.sendPasswordResetEmail`, and `activationUrl` from `UserInvitationsService.sendAccountActivationEmail`. Add a redaction pass in `EmailExecutionService.buildMetadata` that strips any value matching a token/URL shape, so a future caller cannot reintroduce it. Purge existing rows: `UPDATE "EmailDeliveryLog" SET metadata = metadata - 'resetUrl' - 'activationUrl'`.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/auth/auth.service.ts, services/api/src/modules/auth/user-invitations.service.ts, services/api/src/modules/notifications/ (audit id AUTH-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-01=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-01) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]]

<!-- GRAPH:END -->
