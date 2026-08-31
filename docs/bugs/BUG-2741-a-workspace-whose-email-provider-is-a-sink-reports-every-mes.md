---
ID: BUG-2741
aliases: [BUG-2741]
Title: A workspace whose email provider is a sink reports every message as SENT
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: 2b001494
AffectedModules: [notifications, reporting]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: QA-REPORTING-011
RegressionId: REG-391
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt: 2026-08-31
---

# BUG-2741 — A workspace whose email provider is a sink reports every message as SENT

## Summary

No email leaves the demo tenant at all, because its only provider is a `CONSOLE`
sink — and every layer of the system reported success anyway. A scheduled report
ran, its schedule recorded `lastRunStatus COMPLETED` with `lastFailureReason
null`, and its delivery log recorded `SENT` with a real-looking
`providerMessageId`. The only trace that nobody had received anything was a
`providerType` field nobody reads.

The owner decided to leave the demo tenant a sink. The defect is not the sink; it
is that nothing said so.

A second, independent defect kept it hidden: `LOG_LEVEL=info` silenced every
informational log line in production, including the console provider's own record
of each message it swallowed.

## Expected Behavior

A message handed to a provider that discards it is not recorded as sent. Someone
creating a scheduled report in a workspace that cannot deliver email is told
before they wait a day for an email that will never arrive. A `LOG_LEVEL` value
the service does not understand says so instead of silently logging less.

## Actual Behavior

- Delivery log `status: SENT`, `providerMessageId: console_1788166820151_…`,
  `deliveredAt` set — for a message written to a log and discarded.
- The Scheduled Reports screen and the schedule creation dialog said nothing.
- `LOG_LEVEL=info` produced the production default `['error','warn']`, silently.
  Measured on production logs: 100 lines between 08:00 and 09:30 UTC, **zero** at
  LOG level; zero lines at all in the 90 seconds around the 09:00:20 send.

## Reproduction

1. On a tenant whose only enabled email provider is `CONSOLE` — the demo tenant —
   create a scheduled report and let it run, or trigger any templated email.
2. Read the schedule: `lastRunStatus COMPLETED`, `lastFailureReason null`.
3. Read the delivery log row: `status SENT`, `providerType CONSOLE`,
   `providerMessageId console_…`.
4. No email exists. Nothing anywhere reports a problem.

For the logging half: set `LOG_LEVEL=info` on a production-mode service and
observe that no `logger.log()` output is emitted, with no warning.

## Evidence

The tenant's provider, from `GET /api/notifications/email-providers`:

```
providerType : CONSOLE
providerName : Console Provider
enabled      : true
isDefault    : true
fromEmail    : no-reply@dijipeople.local
```

Only `SMTP`, `SES`, `SENDGRID`, `MAILGUN` and `POSTMARK` deliver. `CONSOLE` and
`DEV` both resolve to `ConsoleEmailProvider`, which writes a JSON blob and
returns success exactly as a real transport does.

The scheduled report that ran at 09:00:20 UTC on 2026-08-31 rendered correctly —
its subject resolved `{{tenantName}}` to "DijiPeople Demo", which is the BUG-2683
fix working. The email was rendered properly and handed to a sink.

`services/api/src/modules/notifications/email/email-execution.service.ts` wrote
`status: EmailDeliveryStatus.SENT` on any successful provider send, without
consulting the provider type.

`services/api/src/main.ts` held the ladder
`['error','warn','log','debug','verbose']`. Nest names the informational level
`log`; every other logging ecosystem names it `info`. The live service carried
`LOG_LEVEL=info`, `indexOf` returned `-1`, the branch was skipped and it fell
through to the production default — with nothing logged about it.

## Root Cause

**Success was defined as "the provider did not throw."** That is the right test
for a transport and the wrong one for a sink, because a sink's whole behaviour is
to accept and discard. `EmailDeliveryStatus` had no value meaning "accepted and
not delivered", so the only available honest answer was unavailable and `SENT`
was written.

**The logging defect is a vocabulary mismatch with a silent fallback.** Either
half alone would have been survivable: an unrecognised value that warned would
have been fixed in a minute, and a recognised `info` would have surfaced the
console provider's output. Together they made the sink invisible.

## Impact

Reachable in production. Any tenant whose resolved provider is a sink believes it
is sending email — password resets, invitations, scheduled reports, approval
notifications — and every diagnostic surface agrees with that belief.

The demo tenant is the known case. The blast radius is bounded by how few tenants
resolve to a sink, and the severity comes from the failure being **silent and
self-confirming**: the delivery log is exactly where someone would look to check.

## Affected Areas

`notifications/email/*` — the delivery log status and the provider factory.
`reporting` — the Scheduled Reports screen and the schedule creation dialog.
`main.ts` — log level resolution.

## Proposed Resolution

No ExecPlan. The migration is a single additive enum value.

1. `EmailDeliveryStatus.NOT_DELIVERED`, written where the provider send succeeds
   but the resolved provider is a sink. **Not** `DRY_RUN`, which means the caller
   asked for a rehearsal; conflating the two makes both unreadable.
2. `isSinkProvider()` as one shared predicate, replacing the pair of enum
   comparisons that already existed three times.
3. `delivered: boolean` added to `SendTemplateEmailResult` as an *additive*
   field. `sent` keeps its meaning deliberately — see Resolution.
4. A capability endpoint the Scheduled screens can call, resolved through the
   same provider chain a real send walks.
5. `LOG_LEVEL` validated: accept `info` as an alias for `log`, and warn on a
   value that is not recognised.

## Acceptance Criteria

- A send resolved to `CONSOLE` or `DEV` records `NOT_DELIVERED`; a send resolved
  to `SMTP` still records `SENT`; `DRY_RUN` still means a requested rehearsal.
- The Scheduled Reports screen and the schedule dialog warn when the workspace
  cannot deliver, and say nothing when it can.
- The capability check sees the platform relay, so a tenant with no provider of
  its own is not wrongly told it cannot send.
- `LOG_LEVEL=info` yields `['error','warn','log']`; an unrecognised value falls
  back **and** warns, naming the accepted values.

## Regression Coverage

`REG-391`. Every assertion was confirmed to fail on the unfixed tree by
reverting:

- `services/api/src/modules/notifications/email/email-sink-delivery-status.spec.ts`
- `services/api/src/modules/notifications/email/email-delivery-capability.spec.ts`
- `services/api/src/log-level-resolution.spec.ts`

## Dependencies

Migration `20260831140000_email_delivery_not_delivered_status`.

## Related Items

[[BUG-2683]] — the template variable fix this run incidentally confirmed.
[[BUG-1595]] — the platform provider the capability check must not overlook.
[[notifications]] · [[reporting]]

## Resolution

Fixed on `agent/email-sink-visibility`.

`sent` is deliberately unchanged. It means "the provider accepted it without
throwing", which the orchestrator, the report scheduler, password resets and
invitations all rely on: the scheduler's success counter increments when
`dispatch` does not throw, so making a sink *fail* would auto-disable every
schedule on a sink tenant after `MAX_CONSECUTIVE_FAILURES`. That may well be
correct and it is a behaviour change nobody has asked for, so `delivered` was
added beside `sent` rather than redefining it.

The summary line for an undelivered message is logged at `warn`, not `log`. That
is load-bearing rather than cosmetic: production resolves to `['error','warn']`,
so a `log` line would never be emitted — which is exactly how the console
provider's own output stayed invisible.

The migration was produced by `prisma migrate diff` against a throwaway database
carrying every prior migration, then applied and verified there, and the database
dropped. `migrate dev` could not be used: this branch's `schema.prisma` and its
migrations already disagree about several Timesheet constraint names and seven
unique constraints, so `migrate dev` will not proceed without a reset. **That
drift is pre-existing and unrelated to this change** — it reproduces on the
unmodified schema at `2b001494` — and is left untouched here.

Explicitly out of scope, by the owner's decision: configuring a real provider for
the demo tenant.

## QA Retest

`QA-REPORTING-011`.

## History

- 2026-08-31 — created from qa run at `2b001494`.
- 2026-08-31 — fixed; regression `REG-391` and scenario `QA-REPORTING-011` added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0120]]
- Modules — [[notifications]], [[reporting]]
- Regression — REG-391 (see the regression register)

<!-- GRAPH:END -->
