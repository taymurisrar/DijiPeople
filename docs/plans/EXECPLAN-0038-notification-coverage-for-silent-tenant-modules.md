CONTEXT_FILES_REQUIRED:
  - docs/decisions/ADR-0009-notification-rule-and-preference-are-two-gates-not-one.md
  - docs/plans/EXECPLAN-0037-notification-rule-administration-and-unified-dispatch-gate.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — catalog, seed template, and (for the four deferred candidates) a real trigger call site in each domain module

DELIBERATELY_NOT_USED:
  - Prisma/Migration — no schema change; the fixed case (SUPPORT_CASE_UPDATE) needed only a catalog entry and a seeded template

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma (not touched)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/declared-but-unwired-step.md
  - docs/qa/known-bug-patterns/silent-degradation.md

REGRESSION_ENTRIES_IN_SCOPE:
  - none yet — SUPPORT_CASE_UPDATE was a latent defect fixed as part of this plan; filed as part of ITEM-0170's resolution rather than its own REG, since it was never observed to work and so never regressed

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api only (seed-config)
ROLLBACK_CLASS:           CODE_ONLY

# ExecPlan — Notification coverage for silent tenant modules (ITEM-0170)

## Objective

Rank the eleven modules ITEM-0170 found with no notification wiring by
customer-visible value, and close the highest-value, lowest-risk gap found:
`support-cases` already calls `EmailService.sendTemplateEmail` for a case
update, but the eventCode it uses (`SUPPORT_CASE_UPDATE`) has no catalog entry
and no template, so every such send has thrown since the feature was written.
The remaining ranked candidates are named explicitly rather than silently
dropped, so a future survey does not re-discover them as if they were never
looked at.

## Business requirement

ITEM-0170. The product owner asked that notifications be properly used across
the app; this plan is the coverage half (BUG-3375/ITEM-0169 are the
configuration half).

## Existing behavior

Wired: leave, attendance, employee documents, onboarding, timesheets, claims,
loans, payroll, payslips, scheduled reports, authentication (see ITEM-0170's
own evidence table). Not wired, verified by grepping each module for any
reference to the notifications service/orchestrator/catalog and finding none:
`recruitment`, `documents` (policy acknowledgement), `contracts`,
`business-trips`, `benefits`, `compensation`, `projects`, `sla`, `legal`,
`partners`. **One correction to that table**: `support-cases` is not silent —
`SupportCasesService.sendCommunication`
(`services/api/src/modules/support-cases/support-cases.service.ts:591-620`)
already calls `EmailService.sendTemplateEmail({ eventCode:
'SUPPORT_CASE_UPDATE', templateKey: 'SUPPORT_CASE_UPDATE', ... })`. Neither a
`NotificationEvent` row nor an `EmailTemplate` row for that code existed
anywhere in `notification-events.catalog.ts` or any seed file — confirmed by
grep across `services/api/prisma/`. `EmailExecutionService.execute()`'s
`findTemplateForEvent` returns nothing for an eventCode with no matching
template, which `execute()` turns into
`throw new BadRequestException('No active email template is configured for
event SUPPORT_CASE_UPDATE.')`. This has been broken since the module was
written; it is a bug fix, not new functionality.

## Existing architecture

`notification-events.catalog.ts` (`NOTIFICATION_EVENT_CATALOG`,
`SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS`, `createSystemTemplateSeed`),
`seed-config.ts` (`seedNotificationConfig`, `seedSystemEmailTemplates`, both
called from the seed entrypoint), `EmailExecutionService.execute()`
(template resolution and the dispatch gate from EXECPLAN-0037).

## Requirements

1. `SUPPORT_CASE_UPDATE` has a catalog entry (category `SYSTEM`, EMAIL
   channel, `configurable: true` — a support agent's own admin can turn this
   off like any other notification) and a real, non-placeholder system
   template using exactly the variables `sendCommunication` supplies
   (`caseNumber`, `caseTitle`, `customerName`, `updateBody`).
2. The four ranked-but-not-implemented candidates (document/policy
   acknowledgement due, contract renewal/expiry, recruitment stage change,
   business trip approved) are named in a follow-up backlog item with the
   ranking reasoning preserved, not silently dropped.
3. The six lower-ranked modules (benefits, compensation, projects, SLA,
   legal, partners) are each reviewed and either wired or explicitly declined
   with a reason, per ITEM-0170's own acceptance criterion.
4. No new event bypasses the notifications module — the fix here is entirely
   catalog/seed data; `support-cases.service.ts` itself is not modified.

## Dependencies

Sequenced after EXECPLAN-0037 (ADR-0009), per ITEM-0170's own record.

## Files / modules affected

`services/api/src/modules/notifications/notification-events.catalog.ts`
(new `SUPPORT_CASE_UPDATE` entry and template branch). No other file in this
plan.

## Database impact

None. `SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS` and `NOTIFICATION_EVENT_CATALOG`
are seeded through the existing `seedNotificationConfig` /
`seedSystemEmailTemplates` upsert loops (`npm run seed:config`), which already
run in every environment; no migration, no new seed function.

## Backend impact

None beyond the catalog addition — `sendCommunication` was already calling
the right function with the right shape.

## Frontend impact

None directly. The new event appears automatically on the
`/settings/notifications/rules` screen (EXECPLAN-0037) once seeded, since that
screen reads the live catalog.

## Permission / RBAC impact

None — no new route, no new permission.

## Tenant-isolation impact

Unchanged. `sendCommunication` already resolves `supportCase.tenantId` and
passes it through; the fix does not touch tenant resolution.

## Audit / event / logging impact

None new — `EmailExecutionService` already writes an `EmailDeliveryLog` row
for every send/skip/failure, tenant-scoped, unaffected by this plan.

## Integration impact

None.

## Migration / data compatibility

Purely additive. A tenant that already has an `EmailTemplate` row for
`SUPPORT_CASE_UPDATE` (unlikely, since nothing before this plan could produce
one) keeps it — `seedSystemEmailTemplates` upserts by `(scopeKey,
templateKey)` and never overwrites a tenant-scoped template with a
system one.

## Parallel-safe tasks

Wiring the four ranked candidates and reviewing the six lower-ranked ones —
each is its own module and PARALLEL_SAFE against the others and against this
plan, tracked in the follow-up item this plan creates.

## Dependency-blocked tasks

None beyond the sequencing on EXECPLAN-0037 already noted.

## Integration tasks

None.

## Testing strategy

Manual verification: seed a tenant, call `SupportCasesService.sendCommunication`
(via `POST /support-cases/:id/communications` or equivalent), confirm no
`BadRequestException` and a `SENT`/`NOT_DELIVERED` `EmailDeliveryLog` row is
created with the rendered subject `Update on your support case <caseNumber>`.
No new automated test was added for this specific fix in this session — it is
a one-line-of-evidence catalog/seed correction with no new branching logic;
`npm --workspace api run test` (existing `support-cases.domain.spec.ts`) was
run to confirm no regression.

## Risks

1. **A tenant already relying on the send silently failing** — none plausible:
   a `BadRequestException` on every call means the feature has never
   successfully sent, so there is no existing behavior to preserve.
2. **Template content wrong for a real customer-facing email** — mitigated by
   using only the variables the call site actually supplies, avoiding the
   generic placeholder's "configure tenant-specific content" text ever
   reaching a customer.

## Rollback considerations

Revert the catalog/seed addition; `sendCommunication` returns to throwing as
it always did. No data to unwind — no template existed before.

## Definition of Done

- [x] Catalog entry and system template added, following the same shape as
      every other system-templated event.
- [x] `support-cases.service.ts` unmodified — confirmed by diff.
- [ ] `npm run seed:config` run against a real database to confirm the
      template seeds cleanly — **not run in this session**; no database was
      provisioned for this task. Flagged in the final report.
- [x] The four ranked-but-undone candidates and the six lower-ranked modules
      are named with reasons in ITEM-0170 and its follow-up item, not
      silently dropped.
