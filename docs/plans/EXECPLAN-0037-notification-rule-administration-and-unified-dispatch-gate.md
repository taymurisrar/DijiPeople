CONTEXT_FILES_REQUIRED:
  - docs/decisions/ADR-0009-notification-rule-and-preference-are-two-gates-not-one.md
  - docs/knowledge/modules/notifications.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — controller, service, repository, DTO, permission wiring
  - Architecture — the model-ownership decision (ADR-0009)

DELIBERATELY_NOT_USED:
  - Prisma/Migration — no schema change is needed; both models are unchanged

SINGLE_WRITER_FILES:
  - services/api/src/common/constants/permissions.ts (new PermissionDefinition entries only, no removals)
  - services/api/src/common/constants/rbac-matrix.ts (not touched — existing privileges reused)
  - services/api/prisma/schema.prisma (not touched)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/declared-but-unwired-step.md
  - docs/qa/known-bug-patterns/silent-degradation.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-460 — NotificationRule had no controller, and half of email dispatch never asked it

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no (ordinary task; merges to develop only)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web (the web adapter calls the new API routes; deploying web first only 404s the new screen, does not break the existing one)
ROLLBACK_CLASS:           CODE_ONLY

# ExecPlan — Notification rule administration and a unified dispatch gate

## Objective

`NotificationRule` — the model that decides whether an event can notify
anyone at all — gets a real controller, and `EmailExecutionService.execute()`
(the single choke point every email send passes through) consults it
alongside the existing `NotificationPreference` check, so disabling an event
stops both its in-app and its email delivery, not only one of them. The
`/settings/notifications/rules` screen shows the true state of both models,
under names that match what it renders.

## Business requirement

BUG-3375 and ITEM-0171. The product owner asked whether notifications are
"properly utilized"; both records trace two related defects behind that
question — a model with no administration surface, and a second dispatch path
that silently ignores the one gate the (not-yet-existing) admin screen would
have offered.

## Existing behavior

- `NotificationsService.emit()` (`notifications.service.ts:612-658` before
  this change) reads `NotificationRule` via `listEnabledRules` and produces
  nothing when no rule matches — used by leave and attendance triggers
  (claims/loans/timesheets call it too, but no rule row exists for those
  modules; see ADR-0009's Consequences).
- `EmailExecutionService.execute()` consulted `NotificationPreference` and the
  tenant-wide `emailEnabled` setting only. It never consulted
  `NotificationRule`.
- `NotificationRule` had zero controller routes; the only writer was
  `seedTenantNotificationRules` in `seed-config.ts`.
- `/settings/notifications/rules` rendered `NotificationPreferencesManager`,
  a table of `NotificationEvent` × `NotificationPreference`, reporting every
  row's "Default" column as `event.enabledByDefault` regardless of any rule.

## Existing architecture

- `services/api/src/modules/notifications/notifications.service.ts` —
  `emit()`, `listPreferences()`, `updatePreferences()`.
- `services/api/src/modules/notifications/notifications.repository.ts` —
  `listEnabledRules`, `listPreferences`, `findPreference`.
- `services/api/src/modules/notifications/email/email-execution.service.ts` —
  `execute()`, the single email choke point.
- `services/api/src/modules/notifications/notification-events.catalog.ts` —
  `NOTIFICATION_EVENT_CATALOG`, the TypeScript source of truth for event
  metadata, mirrored into the `NotificationEvent` table by
  `seedNotificationConfig`.
- `apps/web/app/(authenticated)/settings/notifications/rules/page.tsx` and
  `_components/notification-preferences-manager.tsx` — the screen.

## Requirements

1. `GET /notifications/rules` returns, per non-retired catalog event: rule
   status (`NOT_CONFIGURED` | `ENABLED` | `DISABLED` | `ALWAYS_ON` |
   `NOT_YET_AVAILABLE`), the rule id if one exists, and its channels/priority/
   displayMode/requiresAction/recipientResolverType.
2. `PATCH /notifications/rules/:id` updates `enabled`, `channels`, `priority`,
   `displayMode`, `requiresAction` on a tenant-owned rule; `moduleKey`,
   `eventKey`, `recipientResolverType`, `templateKey` are not writable through
   this route.
3. `EmailExecutionService.execute()` skips the send (status `SKIPPED`,
   `skipReason: EVENT_RULE_DISABLED`) when a `NotificationRule` exists for the
   event and is disabled, for every caller, without changing any of the
   caller sites.
4. A `configurable: false` catalog event (`AUTH_ACCOUNT_ACTIVATION`,
   `AUTH_PASSWORD_RESET`) is excluded from both the rule gate and the
   `NotificationPreference` gate, and cannot be disabled through either
   `PATCH /notifications/rules/:id` or `PATCH /notifications/preferences`.
5. Every rule and preference change writes an `AuditService.log()` entry with
   a before/after snapshot.
6. The settings screen's page title, section headings and settings navigation
   entry agree on what the screen manages; an event with no rule is visually
   distinct from one that is enabled.

## Dependencies

None blocking. ITEM-0169 (catalog hygiene) and ITEM-0170 (new event wiring)
are sequenced after this, per their own records, because both depend on which
model gates delivery being settled first.

## Files / modules affected

Backend: `notifications.constants.ts`, `notification-events.catalog.ts`,
`notifications.repository.ts`, `notifications.service.ts`,
`notifications.controller.ts`, `notifications.module.ts`, `dto/notification-rule.dto.ts`,
`dto/index.ts`, `email/email-execution.service.ts`, `common/errors/error-catalog.ts`,
`common/constants/permissions.ts`, `AGENTS.md` (services/api).
Frontend: `lib/notifications-api.ts`, `settings/notifications/rules/page.tsx`,
`settings/notifications/_components/notification-rules-manager.tsx` (new,
replaces `notification-preferences-manager.tsx`), `lib/security-keys.ts`.

## Database impact

None. No new model, no new column, no migration. `configurable` and
`availability` are TypeScript-only fields on `NotificationEventDefinition`,
computed into API responses at read time.

## Backend impact

- `NotificationsService.listRules(user)` — merges `listEvents()` (DB) with
  `listRulesForTenant(tenantId)` (DB) and the TypeScript catalog, filtering
  out retired codes.
- `NotificationsService.updateRule(user, ruleId, dto)` — `findRuleById`
  (tenant-scoped `findFirst`), throws `AppError('NOTIFICATION_RULE_NOT_FOUND')`
  if absent, updates via `updateRule` (`updateMany` scoped by
  `{ id, tenantId }`), audits.
- `NotificationsRepository.findRuleForEvent({tenantId, eventCode})` —
  `findFirst` on `NotificationRule` by `eventKey` alone (not moduleKey — email
  dispatch does not always know it).
- `EmailExecutionService.execute()` — added a parallel `findRuleForEvent` call
  next to the existing `findPreference` call, both skipped for
  `configurable: false` events.
- New `NotificationsController` routes: `GET /notifications/rules`,
  `PATCH /notifications/rules/:id`.
- Reused existing services: `AuditService` (newly imported into
  `NotificationsModule` via `AuditModule`), `EffectiveEmailProviderService`.

## Frontend impact

`apps/web` tenant product, settings-runtime is not used here — this screen
predates the settings-runtime adapter registry and remains a bespoke page
under `settings/notifications/`, consistent with how it already worked.
`NotificationRulesManager` replaces `NotificationPreferencesManager`: three
`SettingsPanel` sections (Notification Channels, Notification Rules, Channel
Preferences), `scope="col"` table headers, a `fieldset`/`legend` around each
row's channel checkboxes, an `EmptyState` when no events are configured. No
new loading state was added (the existing `(authenticated)/loading.tsx`
ancestor already covers this route); a dedicated Suspense boundary is
deliberately left as a smaller follow-up, noted in BUG-3375's Resolution.

## Permission / RBAC impact

- No new legacy key or matrix entry for the rule routes: reused
  `notifications.read` / `notifications.manageRules` (a legacy key that
  already existed, granted to `hr`, previously unused because no route
  declared it) paired with the existing `ENTITY_KEYS.USER_PREFERENCES`
  `'read'`/`'write'` privileges — the same pairing `/notifications/preferences`
  already uses.
- `notification.logs.retry` is new (see EXECPLAN-0039 / ITEM-0168), added to
  `permissions.ts` and `notifications.constants.ts` in this same change since
  both plans touch the same files.
- Mirrored to `apps/web/lib/security-keys.ts`.

## Tenant-isolation impact

`findRuleById`/`updateRule` filter `{ id, tenantId }` via `findFirst`/
`updateMany`, never `findUnique` by bare id. `listRulesForTenant` filters by
`tenantId`. `tenantId` is always `currentUser.tenantId`, never accepted from
the request body — `UpdateNotificationRuleDto` has no `tenantId` field and the
global `ValidationPipe` (`forbidNonWhitelisted`) would reject one anyway.

## Audit / event / logging impact

`notification_rule.updated` and `notification_preference.updated` actions,
`entityType: 'NotificationRule'` / `'NotificationPreference'`,
before/after snapshots of the mutated fields. No PII beyond event
identifiers.

## Integration impact

None. No gateway, agent-desktop or Stripe contract changes.

## Migration / data compatibility

Fully additive at the schema level. An already-deployed frontend calling
only `/notifications/preferences` continues to work unchanged; the new
`/notifications/rules` routes are additive. Old and new code can run
side by side during a rolling deploy.

## Parallel-safe tasks

Catalog description rewrites (ITEM-0169) — PARALLEL_SAFE once this plan's
`configurable`/`availability` fields exist. Frontend screen restructuring —
DEPENDENCY_BLOCKED on the new `/notifications/rules` API shape.

## Dependency-blocked tasks

ITEM-0170's new event wiring is DEPENDENCY_BLOCKED on this plan settling
which model gates delivery, per its own record.

## Integration tasks

None beyond the ordinary develop-branch merge.

## Testing strategy

- `services/api/src/modules/notifications/notification-rules.spec.ts` (new) —
  `listRules` NOT_CONFIGURED/ENABLED/ALWAYS_ON/retired-hiding, `updateRule`
  audit snapshot.
- `services/api/src/modules/notifications/email/email-execution-rule-gate.spec.ts`
  (new) — disabled rule skips the send; no rule does not skip; a
  `configurable: false` event never consults the rule at all.
- `services/api/src/modules/notifications/email/email-sink-delivery-status.spec.ts`
  (updated) — added the `findRuleForEvent` stub the new gate needs.
- `npm --workspace api run check-types`, `npm --workspace api run test`,
  `npm --workspace api run lint`, `npm --workspace web run check-types`,
  `npm --workspace web run test` — see the task's final report for actual
  results.
- Manual/browser: QA-SETTINGS-018.

## Risks

1. **Tenant isolation** — mitigated by `findFirst`/`updateMany` scoping,
   verified by reading every new query.
2. **A rule row with no matching template silently producing nothing** —
   pre-existing behavior in `emit()`, unchanged by this plan; not introduced
   here.
3. **Breaking an existing working send by adding a rule-gate check email
   never had before** — mitigated by making the gate a no-op when no rule row
   exists (the common case for direct-email events), verified by a spec
   asserting `PAYROLL_APPROVED` (no rule) still sends.
4. **Regression risk to `email-sink-delivery-status.spec.ts`** from adding a
   dependency the stub did not provide — caught immediately by running the
   suite, fixed by adding the stub.

## Rollback considerations

Pure code rollback — revert the commits. No migration to unwind. A
mid-rollout state (API deployed, web not yet) leaves the old screen calling
`/notifications/preferences` only, which still works exactly as before.

## Definition of Done

- [x] `check-types`, `test`, `lint` run for both `api` and `web` (see task
      report for pass/fail).
- [x] Audit entries in place for both rule and preference writes.
- [x] Both permission decorators present on every new route.
- [x] Tenant scoping verified by inspection of every new/changed query.
- [x] `services/api/AGENTS.md` updated with the two-dispatch-path note.
- [x] No unrelated file changes in the diff.
