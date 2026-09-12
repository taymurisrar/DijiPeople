---
ID: ADR-0009
aliases: [ADR-0009]
Title: NotificationRule and NotificationPreference both stay, as two gates on one dispatch path
Status: ACCEPTED
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
---
# ADR-0009 — `NotificationRule` and `NotificationPreference` both stay, as two gates on one dispatch path

## Status

Accepted — 2026-09-12, during the BUG-3375 / ITEM-0171 remediation (SESSION-0103).

## Context

Two models look like they answer the same question — "will this event notify
anyone" — and only one of them had a screen. Reading the code closely, they
answer two different questions that both have to be true:

- **`NotificationRule`** (`tenantId`, `moduleKey`, `eventKey`,
  `recipientResolverType`) is wiring: does this event fire at all, through
  which recipient-resolution strategy, at what priority and display mode,
  requiring action or not. `NotificationsService.emit()` — used by leave,
  attendance, and (per the seed data, though not yet wired end to end)
  claims/loans/timesheets — consults it to build in-app `Notification` rows.
  It had **no controller at all**: the only writer was
  `seedTenantNotificationRules` in `seed-config.ts`. BUG-3375 traced the
  screen named "Notification Rules" and found it rendered
  `NotificationPreference` instead, reporting every event `Enabled`
  regardless of whether a rule existed.
- **`NotificationPreference`** (`scopeKey`, `eventCode`, `channel`) is the
  tenant/user-facing channel opt-in — "given that this event can fire, does
  this channel carry it". `EmailExecutionService.execute()` — the one place
  every email send passes through, gated or not — already consulted it before
  this change, for **every** caller (payroll, payslips, the report scheduler,
  auth mail included).

Because `EmailExecutionService.execute()` already gated on
`NotificationPreference` universally, but `NotificationRule` was consulted
only by `emit()`'s in-app path, an administrator disabling an event's
*preference* already stopped its email everywhere; disabling its *rule* (once
a screen existed to do that) would have stopped only its in-app row. That
asymmetry is ITEM-0171 — a second, undocumented dispatch fork inside a module
`AGENTS.md` already calls the *only* route for tenant email.

`recipientResolverType`, `templateKey`, `moduleKey` and `eventKey` on
`NotificationRule` are structural: they name which internal resolver function
runs and which `NotificationTemplate` row is used. A tenant admin choosing the
wrong resolver silently breaks recipient resolution with no error — there is
no way to validate a resolver choice against the record shapes it queries
without executing it. `NotificationPreference` carries none of that; it is a
plain boolean per (scope, event, channel).

## Decision

**Both models stay**, because folding one into the other would either lose the
wiring fields (breaking `emit()`'s recipient resolution) or expose them for
tenant edit (a foot-gun with no validation story) — and because merging them
would require a schema migration this task was instructed to avoid unless
genuinely unavoidable. It is not: the fix is entirely at the read/write-model
and dispatch-gate level.

1. **`NotificationRule.enabled` becomes the single gate for "can this event
   notify anyone at all", for both channels.** `EmailExecutionService.execute()`
   now also consults `NotificationRule` (matched by `eventKey === eventCode`,
   ignoring `moduleKey` — every seeded rule today has exactly one moduleKey per
   eventKey) alongside the existing `NotificationPreference` check, and skips
   the send (`SKIPPED` / `EVENT_RULE_DISABLED`) when a rule exists and is
   disabled. An event with **no** rule row is not treated as disabled — most
   direct-email events (payroll, payslips, `REPORT_SCHEDULE_DELIVERY`,
   `SUPPORT_CASE_UPDATE`) have no `NotificationRule` row at all and are
   unaffected.
2. **`NotificationPreference` remains the finer per-channel opt-in.** It can
   only narrow what an enabled rule/event allows — never widen. This was
   already true for email; nothing here changes it for in-app.
3. **`NotificationRule` gets a real controller** —
   `GET /notifications/rules`, `PATCH /notifications/rules/:id` — exposing
   `enabled`, `channels`, `priority`, `displayMode` and `requiresAction` as
   editable, and `moduleKey`/`eventKey`/`recipientResolverType`/`templateKey`
   as read-only wiring identity. Both permission systems:
   `notifications.manageRules` (a legacy key that already existed, unused,
   granted to `hr`) paired with `RequirePermission(ENTITY_KEYS.USER_PREFERENCES,
   'write')` — the same matrix pairing `/notifications/preferences` already
   uses, so no new `ENTITY_KEYS` entry or role-grant rewiring was needed.
4. **Transactional events are excluded from both gates, explicitly.**
   `NotificationEventDefinition.configurable === false`
   (`AUTH_ACCOUNT_ACTIVATION`, `AUTH_PASSWORD_RESET`) skips the
   `NotificationPreference` check and is never asked about a rule at all —
   a TypeScript-only catalog field, not a schema column, so this needed no
   migration either. The read model reports these as `ruleStatus: ALWAYS_ON`
   so the UI can render "Required — always on" instead of a toggle that would
   have silently done nothing (or worse, locked users out).
5. **The screen is renamed and restructured**, not just relabelled: it now
   shows both a "Notification Rules" section (rule status: Not configured /
   Enabled / Disabled / Required — always on / Not yet available — each
   visually distinct) and a "Channel Preferences" section (the existing
   checkbox grid), so the page heading, the settings navigation entry and the
   section titles all describe what is actually rendered.

## Consequences

- No Prisma migration. `NotificationRule`, `NotificationPreference` and
  `NotificationEvent` are unchanged at the schema level; `configurable` and
  `availability` live only in the TypeScript catalog
  (`notification-events.catalog.ts`) and are computed into API responses, not
  persisted.
- `services/api/AGENTS.md` now documents both dispatch paths and the merged
  gate, so the next agent adding a domain-triggered event knows to prefer
  `emit()` + a seeded `NotificationRule` over a direct `sendTemplateEmail()`
  call.
- A residual, honestly-scoped gap this decision surfaces rather than hides:
  `DEFAULT_NOTIFICATION_RULES` in `seed-config.ts` has entries only for
  `leave`, `attendance` and `employee` — claims, loans and timesheets call
  `NotificationsService.emit()` with matching `eventKey`s but have **no**
  seeded `NotificationRule` row, so `emit()` currently produces `{created: 0}`
  for them silently, and `resolveRecordOwner`/`resolveApprovalAssignees` have
  no branch for those `moduleKey`s even if a rule existed. The new
  `/notifications/rules` screen now makes this visible as `NOT_CONFIGURED`
  for the first time — which is the acceptance criterion BUG-3375 asked for —
  but does not itself wire those three modules' in-app notifications. That is
  a materially different, larger piece of work (new resolver branches, new
  templates) tracked separately rather than folded into this decision.
- ITEM-0169's catalog hygiene (dead entries, the `LEAVE_APPROVED`/
  `LEAVE_APPROVAL_REQUEST` duplicate collapse, description rewrites) is
  sequenced on top of this decision and implemented in the same change, since
  the new screen is what makes catalog quality visible to a tenant admin for
  the first time.

## Related

- [`BUG-3375`](../bugs/BUG-3375-the-notification-rules-screen-edits-preferences-and-cannot-r.md)
- [`ITEM-0171`](../backlog/items/ITEM-0171-a-second-dispatch-path-sends-email-without-consulting-notifi.md)
- [`ITEM-0169`](../backlog/items/ITEM-0169-notification-catalog-hygiene-dead-events-duplicate-leave-pai.md)
- [`EXECPLAN-0037`](../plans/EXECPLAN-0037-notification-rule-administration-and-unified-dispatch-gate.md)
- `services/api/src/modules/notifications/notification-events.catalog.ts` —
  `configurable`, `availability`, `RETIRED_EVENT_ALIASES`
- `services/api/src/modules/notifications/email/email-execution.service.ts` —
  the merged gate in `execute()`
- `services/api/AGENTS.md` — the two-dispatch-path note
