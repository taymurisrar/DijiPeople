CONTEXT_FILES_REQUIRED:
  - docs/decisions/ADR-0011-notification-rule-and-preference-are-two-gates-not-one.md
  - docs/plans/EXECPLAN-0042-notification-rule-administration-and-unified-dispatch-gate.md
  - services/api/AGENTS.md (the two-dispatch-path note)
  - apps/web/AGENTS.md (settings, reuse, testing limits)

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — read model, toggle endpoint, DTO, in-app dispatch gates
  - Frontend — the events page, optimistic toggles, search, mobile layout
  - Security — both permission systems, tenant scoping, audit on a new write route
  - QA — browser retest at 1440px and 400px on a throwaway database (orchestrator)

DELIBERATELY_NOT_USED:
  - Database/Prisma — no schema change; both models are used as they are
  - UI/UX — the owner decision of 2026-09-13 already fixes the page shape

SINGLE_WRITER_FILES:
  - none (permissions.ts, rbac-matrix.ts, security-keys.ts, schema.prisma are read, not written)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/declared-but-unwired-step.md
  - docs/qa/known-bug-patterns/stale-read-model-of-a-write-rule.md
  - docs/qa/known-bug-patterns/gate-scoped-to-one-structure.md
  - docs/qa/known-bug-patterns/silent-degradation.md
  - docs/qa/known-bug-patterns/two-writers-one-field.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-460 — NotificationRule had no controller, and half of email dispatch never asked it
  - REG-412 — formatting state held outside React (this page renders no timestamps; noted so nobody adds one without the context)

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no (ordinary task; the orchestrator integrates into develop)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web (the page calls the new routes; the old routes stay, so web-first only 404s the new page's data)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff (orchestrator)
KNOWN_CONCURRENT_WORK:    TASK-0031 WP-04 (templates; may touch notification-events.catalog.ts and notifications-api.ts), WP-06 (providers, delivery logs, settings navigation labels)
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — One notification events page (ITEM-0180, TASK-0031 WP-05)

## Objective

`/settings/notifications/rules` becomes one plain page. It lists the events that
can actually notify someone, grouped by module, one row per event, with an
In-app and an Email toggle that saves on change. Every toggle writes exactly
what dispatch reads, so the state on the page is the state dispatch acts on.

## KNOWN_MISTAKES_TO_AVOID

- **BUG-3375 / REG-460** — a screen named after one model that edits another.
  Here, each toggle's write is defined below and pinned by an API spec against the
  gates in `emit()`, `NotificationOrchestratorService.dispatch()` and
  `EmailExecutionService.execute()`.
- **declared-but-unwired-step** — a preference the UI writes that no dispatch path
  reads. FACT: today `NotificationsService.emit()`
  (`services/api/src/modules/notifications/notifications.service.ts:930-1090`) never
  reads `NotificationPreference`, and `NotificationOrchestratorService.dispatch()`
  (`notification-orchestrator.service.ts:93-110`) creates in-app rows with no gate
  at all. The old page's In-app checkbox wrote preferences nothing read. This
  plan adds the in-app reads, so the new toggle is not a second instance.
- **stale-read-model-of-a-write-rule** — the read model is computed from the same
  helper the write path validates with (`resolveEventChannels`), not a copy.
- **gate-scoped-to-one-structure** — "hide events with no emitter" must cover all
  three dispatch structures (rule-driven `emit()`, orchestrator in-app, direct
  email), not only catalog `availability`. FACT: `CLAIM_*`, `LOAN_*` and
  `TIMESHEET_*` are `availability: ACTIVE` in the catalog, but no tenant has a
  `NotificationRule` for module keys `claim`/`loan`/`timesheet`
  (`services/api/prisma/seed-config.ts:300-441`), so `emit()` returns
  `{created: 0}` for them.
- **silent-degradation** — a failed save must visibly revert, not leave the
  optimistic value on screen.
- **Seam** — the web toggle payload and the DTO are one contract under
  `forbidNonWhitelisted`; one spec runs the real payload through the real pipe.
- **CRLF** — source-reading specs use `includes`/`toContain`, never a `\n`-literal
  regex (memory: CRLF makes source-reading specs pass vacuously).

## Business requirement

ITEM-0180 and owner decision D4 (2026-09-13, `findings.md`), both binding: one
events page that merges rules and preferences, grouped by module, with toggles
and autosave. Unimplemented events and the Browser Push/Digests channels are
hidden. The page has a search and works on mobile.
ADR-0011 is binding: both models stay, rule = can this event notify anyone,
preference = which channels.

## Existing behavior

- FACT: `rules/page.tsx` fetches `/notifications/events`, `/notifications/preferences`,
  `/notifications/rules`, `/tenant-settings` and renders
  `_components/notification-rules-manager.tsx`, which has three panels:
  - channel tiles at `:180-201`, including Browser Push and Digests;
  - a rules table (`min-w-[720px]`) at `:211`;
  - a preferences table (`min-w-[860px]`) at `:292`, saved by one button at `:371-381`.
  Raw event codes print at `:235-237` and `:315-317`, and explanatory panel
  descriptions at `:177`, `:205` and `:286`.
- FACT, the dispatch paths and what each reads:

  | Path | File | Reads |
  |---|---|---|
  | In-app via rule | `notifications.service.ts:930-1090` (`emit`) | `NotificationRule` rows matching `tenantId + moduleKey + eventKey + enabled` (`notifications.repository.ts:954-967`). Nothing else. |
  | In-app direct | `notification-orchestrator.service.ts:93-110` | Nothing — no rule, no preference, no tenant switch. Used by payroll (`payroll/payroll-notification.service.ts:67-80`) and payslips (`payslips/payslips.service.ts:564`, `:860`). |
  | Email | `email/email-execution.service.ts:288-364` (`execute`) | Tenant `emailEnabled`, `NotificationPreference(EMAIL)`, first `NotificationRule` by `eventKey` (priority, createdAt). The last two are skipped for `configurable: false`. |

- FACT: `inAppEnabled`, `browserPushEnabled` and `digestEnabled` have no consumer
  anywhere in `services/api/src` besides the settings resolver that returns them
  (`tenant-settings-resolver.service.ts:1287-1290`). `emailEnabled` is consumed at
  `email-execution.service.ts:327`.
- FACT, who actually emits each ACTIVE catalog event:
  - Email only: `AUTH_ACCOUNT_ACTIVATION` (`auth/user-invitations.service.ts:440`),
    `AUTH_PASSWORD_RESET` (`auth/auth.service.ts:865`), `BILLING_INVOICE_ISSUED`
    (`super-admin/super-admin.service.ts:3253`, tenant-scoped),
    `REPORT_SCHEDULE_DELIVERY` (`reporting/schedule/report-scheduler.worker.ts:500`),
    `SUPPORT_CASE_UPDATE` (`support-cases/support-cases.service.ts:594`).
  - Email and in-app direct: `PAYSLIP_AVAILABLE`.
  - In-app direct: `PAYSLIP_PUBLISHED`, `JOURNAL_POSTED`, `JOURNAL_REVERSED`,
    `PAYROLL_READY_FOR_REVIEW`, `PAYROLL_RETURNED_FOR_RECALCULATION`,
    `PAYROLL_APPROVAL_REQUIRED`, `PAYROLL_APPROVED`, `PAYMENT_BATCH_SUBMITTED`,
    `PAYMENT_BATCH_PARTIALLY_FAILED`, `PAYMENT_BATCH_FAILED`, `PAYROLL_PAID`.
  - In-app via rule, module `leave`: the three `leave.request.*` events.
  - In-app via rule, module `attendance`: the five `attendance.correction.*` events and
    `attendance.exception.detected.manager`.
  - In-app via rule, module `employee`: `employee.document.*` and
    `employee.onboarding.task.assigned` (`onboarding/onboarding.service.ts:545`).
  - In-app via rule, module `claim`, `loan` or `timesheet`, with no rule seeded:
    `CLAIM_*`, `LOAN_*`, `TIMESHEET_*`.
  - No emitter, despite ACTIVE: `PAYROLL_PROCESSED`,
    `PAYROLL_CALCULATION_COMPLETED`, `PAYROLL_CALCULATION_FAILED`,
    `PAYROLL_BLOCKERS_FOUND`, `PAYSLIP_EMAIL_FAILED`, `JOURNAL_GENERATION_FAILED`.
    None appears as a literal outside `payroll-notification.service.ts`'s type union.
- FACT: the leave events carry `EMAIL` in `defaultChannels` (catalog `:150`, `:161`),
  but nothing emails them; the email channel is a relic of the ITEM-0169 collapse.

## Existing architecture

- Catalog: `services/api/src/modules/notifications/notification-events.catalog.ts`
  (`configurable`, `availability`, `RETIRED_EVENT_ALIASES`).
- Controller/service/repository: `notifications.controller.ts`,
  `notifications.service.ts`, `notifications.repository.ts`.
- Web client: `apps/web/lib/notifications-api.ts`. It is proxied by
  `apps/web/app/api/notifications/[...path]/route.ts`, which handles GET, POST and PATCH
  and URI-encodes each segment.
- Settings shell: `apps/web/app/(authenticated)/settings/_components/settings-shell.tsx`
  → `apps/web/app/components/settings/settings-layout.tsx`.
- The route is linked from `settings/_lib/settings-runtime.ts:333`
  (`notifications: "/settings/notifications/rules"`), so the path stays unchanged.
- Shared UI: `app/components/ui/form-control.tsx` (`TextField`, `CheckboxField`,
  used as-is, not edited), `section-card.tsx`, `empty-state.tsx`, `status-pill.tsx`.
  Route boundaries: `(authenticated)/loading.tsx` and `(authenticated)/error.tsx`.

## Requirements

1. `GET /notifications/event-settings` returns one item per event that some code
   path can deliver to this tenant: `{eventCode, name, moduleKey, moduleLabel,
   required, channels: [{channel: 'IN_APP'|'EMAIL', enabled}]}`, grouped by
   module order, then catalog order. An event is omitted when any of these holds:
   - it is retired;
   - it is not `ACTIVE`;
   - it has no emitter;
   - no channel remains deliverable for it.
2. A channel is deliverable for an event when both hold:
   - the event's delivery declaration names it, and `NotificationEvent.supportedChannels` includes it;
   - for rule-driven in-app, the tenant also has a `NotificationRule` with the emitter's `moduleKey` and `eventKey`.
3. `enabled` equals what dispatch will do (see Backend impact, "Truth table").
4. `PATCH /notifications/event-settings/:code` with `{channel, enabled}` writes the
   preference and derives the rule state per the write model below. It refuses a
   required event, an unavailable event and an undeliverable channel with
   `NOTIFICATION_EVENT_NOT_CONFIGURABLE`, and an unknown code with 404.
5. Both in-app dispatch paths honour `NotificationPreference(IN_APP)`, and the
   orchestrator in-app path honours the event's rule, both mirroring `execute()`
   and skipping both for `configurable: false`.
6. Every delivery declaration is guarded by a spec: each declared emitter's
   code literal exists in a non-spec source file, each "no emitter" code has
   none, and every ACTIVE, non-retired catalog code sits in exactly one of the
   two lists and resolves to a module.
7. The page:
   - groups by module;
   - shows names and never codes;
   - shows In-app and Email only;
   - hides Browser Push and Digests;
   - shows required events as "Always on" with no toggle;
   - searches by name.
8. A toggle updates optimistically, disables itself while pending, and replaces
   its value with the server's on success. On failure it reverts only its own
   value and shows an inline error. There is no Save button.
9. A tenant-wide Email switch writes `notifications.emailEnabled`, its only
   consumer being `execute()`. While it is off, per-event Email toggles are
   disabled. There is no In-app, Browser Push or Digests switch, because none has
   a consumer.
10. No explanatory paragraphs. Short headings and labels only.
11. At 400px the page content has no fixed minimum width and rows wrap. If the
    shared settings shell pushes content below its navigation, that is reported,
    not restyled.
12. Loading and error states use the shared `(authenticated)` route boundaries.
    Empty states (no events, no search results) use `EmptyState`.

## Dependencies

None blocking. ADR-0011 and EXECPLAN-0042 are on develop at 88f33c6e.
WP-04 may edit the catalog file; this plan does not edit the catalog, to avoid a
conflict, and declares delivery in a new file instead.

## Files / modules affected

API (`services/api/src/modules/notifications/`):
- `notification-event-delivery.ts` (new) — delivery declarations, no-emitter
  list, module resolution, `resolveEventChannels` (shared by read and write).
- `notification-event-delivery.spec.ts` (new).
- `dto/notification-event-channel.dto.ts` (new), `dto/index.ts`.
- `notifications.repository.ts` — `listRulesForEvent`, `listPreferencesForEvent`,
  `setRulesEnabledForEvent`, and `db` on `upsertTenantPreference` (it already accepts one).
- `notifications.service.ts` — `listEventSettings`, `updateEventChannel`, in-app
  preference gate in `emit()`.
- `notification-orchestrator.service.ts` — in-app gate.
- `notifications.controller.ts` — two routes.
- Specs (new): `notification-event-settings.spec.ts`,
  `notification-in-app-gate.spec.ts`, `notification-event-channel-dto-contract.spec.ts`.

Web (`apps/web/`):
- `lib/notifications-api.ts` — event-settings types and two client calls, added
  beside the rule/preference calls.
- `app/(authenticated)/settings/notifications/rules/page.tsx` — rewritten.
- `app/(authenticated)/settings/notifications/_components/notification-events-model.ts` (new, pure logic).
- `.../_components/notification-events-model.spec.ts` (new).
- `.../_components/notification-events-manager.tsx` (new).
- `.../_components/notification-rules-manager.tsx` — deleted (replaced).

Docs: this plan; `docs/tasks/TASK-0031-streams/WP-05-report.md`.

## Database impact

None. No model, column, index or migration. Writes use existing unique keys:
`NotificationPreference @@unique([scopeKey, eventCode, channel])`, and
`updateMany` on `NotificationRule` by `{tenantId, eventKey}`.

## Backend impact

### Read model — `NotificationsService.listEventSettings(user)`

- It loads `listEvents()`, `listRulesForTenant(tenantId)` and
  `listPreferences(tenantId)` in parallel.
- `resolveEventChannels(event, catalogEntry, rules)` returns the deliverable
  channels (Requirement 2).

### Truth table (PROPOSAL, pinned by `notification-event-settings.spec.ts`)

| Channel / delivery | `enabled` means dispatch will… |
|---|---|
| IN_APP via rule | `rules(moduleKey, eventKey).some(enabled)` **and** `pref(IN_APP)?.enabled !== false` |
| IN_APP direct | `(firstRule(eventKey)?.enabled ?? true)` **and** `pref(IN_APP)?.enabled !== false` |
| EMAIL | `(firstRule(eventKey)?.enabled ?? true)` **and** `pref(EMAIL)?.enabled !== false` |
| `configurable: false` | always `true`, `required: true` |

A missing preference row means "on", because every gate tests
`enabled === false`, never the catalog's `enabledByDefault`. The old
`listPreferences` fell back to `enabledByDefault`, which dispatch never reads.
That fallback was a stale read model and is not reused. The tenant `emailEnabled`
switch is reported separately and not folded into the per-event value, because
the page shows it as its own control.

### Write model — `PATCH /notifications/event-settings/:code` `{channel, enabled}`

Everything runs in one `prisma.$transaction`, passing `tx` to the repository and
to `AuditService.log`:
1. Resolve the catalog entry. Unknown or retired → `NotFoundException({code:
   'NOTIFICATION_EVENT_NOT_FOUND'})`. Not ACTIVE, `configurable: false`, or `channel`
   not deliverable → `AppError('NOTIFICATION_EVENT_NOT_CONFIGURABLE')`.
2. Upsert `NotificationPreference(tenant scope, code, channel) = enabled`,
   preserving any stored `metadata`.
3. Set `ruleEnabled` to true when any deliverable channel is on after the change:
   the toggled channel's new value, and each other channel's preference, where a
   missing row counts as on.
4. If the tenant has `NotificationRule` rows for `eventKey = code` whose `enabled`
   differs, set them all to `ruleEnabled` (`updateMany {tenantId, eventKey}`).
   Turning a channel on therefore re-enables a disabled rule, so the toggle does
   not lie. Turning the last channel off disables the rule, which ADR-0011 defines
   as "this event notifies nobody".
5. No rule is ever created. ADR-0011 makes rule wiring (resolver, template)
   structural, and an event whose in-app delivery needs a rule that does not
   exist is not listed at all (Requirement 2). ITEM-0180's "creates or enables"
   is satisfied by "enables". Creating is never needed for truthfulness.
6. Audit `notification_preference.updated` with before/after
   `{eventCode, channel, enabled}`. For each rule changed, audit
   `notification_rule.updated` with before/after `{enabled}`.
7. Return the recomputed item for the event.

### Dispatch gates (PROPOSAL)

- `emit()`: after loading enabled rules, if the event is configurable and
  `findPreference(IN_APP).enabled === false`, create no rows. Workflows still run,
  as they do when no rule matches.
- `NotificationOrchestratorService.dispatch()`, in-app half: for configurable
  events, read `findPreference(IN_APP)` and `findRuleForEvent`, and skip the
  in-app create when the preference is `false` or the rule is disabled. The email
  half is untouched, because `execute()` already gates it. The orchestrator gains
  a `NotificationsRepository` dependency, a provider in the same module.

### DTO

`UpdateNotificationEventChannelDto { @IsIn(['IN_APP','EMAIL']) channel; @IsBoolean() enabled }`.
`code` is a path parameter, trimmed and length-checked (≤120) in the service.

### Reused, not reimplemented

`listEvents`, `listRulesForTenant`, `listPreferences`, `findPreference`,
`findRuleForEvent`, `upsertTenantPreference`, `AuditService`, `AppError`,
`isRetiredEventCode`, `isConfigurableEvent`, `isAvailableEvent`.

The existing `GET/PATCH /notifications/rules` and `/notifications/preferences`
routes are kept unchanged for backward compatibility.

## Frontend impact

App: `apps/web`. The page is bespoke, as before. The settings runtime adapter
registry has no row-per-event toggle surface. `notificationSettingsSections` in
`settings-page-config.ts` is a form of tenant settings keys and cannot express a
per-event, two-model toggle.

- `page.tsx` (server):
  - `requireSettingsPermissions(["notifications.read"])`;
  - fetches `/notifications/event-settings` and `/tenant-settings`;
  - computes `canManageEvents` (both `notifications.manage` and `notifications.manageRules`, matching the API) and `canManageEmail` (`settings.update`);
  - renders `SettingsShell` titled "Notification Events".
- `notification-events-manager.tsx` (client):
  - a toolbar: `TextField type="search"` labelled "Search events", and `CheckboxField` "Email" (the tenant switch);
  - one `SectionCard` per module, titled with the module label;
  - each row is a `role="group"` labelled by the event name, holding a `CheckboxField` per deliverable channel ("In-app", "Email"), with the inline `error` prop used for a failed save;
  - required events show `StatusPill` "Always on" instead of checkboxes;
  - rows are `flex flex-wrap`, with no `min-w-*`;
  - the event code is kept only as `data-event-code`.
- `notification-events-model.ts` (pure, jest-testable, no jsdom):
  - `groupNotificationEvents(items, query)`;
  - `buildEventChannelPayload(channel, enabled)`;
  - `applyChannelValue`;
  - `runOptimisticToggle({update, save, ...})` — begin, then commit or roll back; rollback restores only the toggled key.
- Loading: the shared `(authenticated)/loading.tsx`. Error: the shared
  `(authenticated)/error.tsx` (server fetch throws). Empty: `EmptyState` for "no
  events" and "no search results".
- Mobile: rows wrap. Settings shell layout
  (`app/components/settings/settings-layout.tsx:26-31`: `flex` row with a
  `shrink-0` 260px aside and no small-screen stacking) is reported in the stream
  report and not restyled (brief item 10).

## Permission / RBAC impact

- No new keys and no matrix entries. Mirror in `security-keys.ts` already has
  `NOTIFICATIONS_READ/MANAGE/MANAGE_RULES` (`apps/web/lib/security-keys.ts:75-77`).
- `GET event-settings`: `@Permissions(notifications.read)` +
  `@RequirePermission(USER_PREFERENCES, 'read')`, the same pairing as `GET preferences`.
- `PATCH event-settings/:code`: `@Permissions(notifications.manage,
  notifications.manageRules)` + `@RequirePermission(USER_PREFERENCES, 'write')`.
  Both legacy keys are required because the route writes both models. FACT:
  `PermissionsGuard` requires all declared legacy keys.
- INFERENCE: the `hr` role holds `manageRules` but not `manage`
  (`common/constants/permissions.ts:2250`), so `hr` sees the page read-only.
  Settings administrators (`hasSettingsAdministratorRole`) and elevated roles are
  unaffected. The old routes remain for `hr`. This is recorded as an open question
  in the stream report.
- No elevated-role list change. No row-level scope: this is tenant configuration,
  not person data.

## Tenant-isolation impact

- Every new query takes `tenantId` from `currentUser.tenantId`:
  - `listRulesForEvent` → `findMany {tenantId, eventKey}`;
  - `listPreferencesForEvent` → `findMany {tenantId, userId: null, eventCode}`;
  - `setRulesEnabledForEvent` → `updateMany {tenantId, eventKey}`;
  - `upsertTenantPreference` → its unique key contains `buildTenantNotificationScopeKey(tenantId)`.
- The DTO has no `tenantId`, and `forbidNonWhitelisted` rejects one.
- The dispatch gates use the `tenantId` the caller already passes to `emit()` or `dispatch()`.
- No `findUnique` by bare id.
- A reviewer confirms isolation by reading the four repository methods and the spec
  that asserts every repository call received `user.tenantId`.

## Audit / event / logging impact

- `notification_preference.updated` (`NotificationPreference`, preference id)
  and `notification_rule.updated` (`NotificationRule`, rule id), with before/after
  snapshots, inside the transaction.
- The orchestrator logs a `debug`-free skip: no new log line, and the result
  carries `inAppSkippedReason`.
- No PII.

## Integration impact

None. No gateway, agent, Stripe or email-provider contract changes.

## Migration / data compatibility

- Existing preference rows written by the old bulk Save apply as stored.
  INFERENCE: a tenant that unticked In-app on the old page (which no dispatch
  path read) will stop receiving that in-app notification once this ships. That
  is the truthful behaviour, and is listed under Risks.
- Retired codes are already migrated by `migrateRetiredEventPreferences`.
- Old API routes remain, so an older web build keeps working against the new API.

## Parallel-safe tasks

- PARALLEL_SAFE: `notification-event-delivery.ts` + spec. Web model + spec against
  the agreed response shape.

## Dependency-blocked tasks

- DEPENDENCY_BLOCKED: service read/write and controller (need the delivery helper);
  the web manager (needs the model); the seam spec (needs the DTO and the model).

## Integration tasks

- INTEGRATION: the page wiring; a full api + web test/typecheck/lint run. Browser
  verification on a throwaway database (orchestrator).

## Testing strategy

- API (new):
  - `notification-event-delivery.spec.ts`:
    - completeness: every ACTIVE, non-retired catalog code is in exactly one list;
    - every declared emitter's literal exists in non-spec source (with the rule `moduleKey` literal in the same file for rule delivery);
    - every no-emitter code has no literal;
    - every code resolves to a named module.
  - `notification-event-settings.spec.ts`:
    - hiding: no emitter, rule-driven without a rule, not-yet-available, retired;
    - no leave Email channel;
    - required event locked;
    - truth table: rule disabled, preference false, missing preference = on;
    - write model: enable re-enables the rule; last-off disables it; other channel on leaves it; required, undeliverable and unknown are refused;
    - audit before/after for both models;
    - every repository call carries `user.tenantId`;
    - controller metadata carries both permission decorators on both routes.
  - `notification-in-app-gate.spec.ts`:
    - orchestrator skips in-app on preference false or rule disabled;
    - never asks for a `configurable: false` event;
    - the email half is unaffected;
    - `emit()` creates no rows on preference false but still runs workflows.
  - `notification-event-channel-dto-contract.spec.ts`:
    - the web builder's payload, read from the web source, passes `ValidationPipe` configured as in `main.ts`;
    - `PUSH` and an extra `eventCode` are rejected.
- Web (new), `notification-events-model.spec.ts`:
  - grouping order;
  - hides events without IN_APP/EMAIL and strips other channels;
  - search (case-insensitive, trimmed, empty groups dropped);
  - optimistic success;
  - failure rollback of only the toggled key, with error set and pending cleared;
  - payload builder shape.
- Existing specs that must still pass: `notification-rules.spec.ts`,
  `email/email-execution-rule-gate.spec.ts`, `email/email-sink-delivery-status.spec.ts`.
- Commands:
  - `npm --workspace api run test -- notification` (with a dummy `DATABASE_URL`);
  - `npm --workspace api run check-types`;
  - `npm --workspace web run test -- notification`;
  - `npm --workspace web run check-types`;
  - `npx eslint --fix <changed files>` in each workspace.
- Manual/browser (orchestrator, throwaway DB), in `WP-05-report.md`:
  - 1440px and 400px: each event shown once, grouped;
  - a toggle persists across reload;
  - a forced failure reverts;
  - no Browser Push/Digests, no codes, no "Not configured".

## Risks

1. **Tenant isolation on a new write route.** Likelihood: low. Impact: high.
   Mitigation: `{tenantId, …}` on every query, and a spec asserting the tenant argument.
2. **Behaviour change: in-app preferences start being honoured.** Likelihood:
   medium. Impact: medium. A preference row with `enabled: false` stored by the
   old page now suppresses in-app rows. Mitigation: this is the truthful reading
   of what the admin chose. Called out in the report for the release note.
3. **Disabling the last visible channel disables the rule, which also stops workflow
   `SEND_EMAIL` actions keyed on that event.** `execute()` already consults the rule
   (ADR-0011). Likelihood: low. Impact: medium. Mitigation: consistent with
   ADR-0011's definition, and documented in the report.
4. **Orchestrator gate adds two lookups per in-app dispatch.** Likelihood: certain.
   Impact: low. These are unique-key and indexed reads, and payroll fan-out already
   does a dedupe query per dispatch.
5. **The delivery declaration drifts from code.** Likelihood: medium. Impact: medium.
   Mitigation: the source-scan and completeness spec (Requirement 6).
6. **`hr` loses toggle ability on the page.** Likelihood: certain for `hr`. Impact: low.
   Mitigation: this is an open question, and the old routes remain.
7. **Mobile shell layout** is outside this package. Likelihood: certain. Impact:
   medium. Mitigation: reported with file:line.

## Rollback considerations

- Code-only: revert the commits.
- Web without API: the page's fetch 404s, and the shared error boundary renders.
  The old routes remain, so reverting web alone restores the old page.
- API without web: the old page still works, because the old routes are unchanged.
  The in-app gates apply regardless.

## Definition of Done

- [ ] ExecPlan committed before implementation.
- [ ] Both permission decorators on both new routes, pinned by spec.
- [ ] Tenant scoping on every new query, pinned by spec.
- [ ] Audit before/after for preference and rule writes.
- [ ] The toggle payload is validated by the real pipe (seam spec).
- [ ] api: `test` (notification specs), `check-types`, eslint on changed files. web: `test`, `check-types`, eslint on changed files.
- [ ] No edits to templates, providers, delivery logs, settings navigation/adapter registry, `form-control.tsx` or the error provider.
- [ ] Stream report with root causes, tests, REG-510…, QA retest steps, residual risks.

## Related

[[ITEM-0180]] · [[BUG-3375]] · [[ITEM-0169]] · [[ITEM-0171]] · ADR-0011 · EXECPLAN-0042
