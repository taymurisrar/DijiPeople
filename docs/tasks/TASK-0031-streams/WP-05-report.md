# TASK-0031 — WP-05 stream report: one notification events page

Stream report of [[TASK-0031]].

- **Branch:** `agent/walkthrough2-notification-events` (base `origin/develop` 88f33c6e)
- **ExecPlan:** `docs/plans/EXECPLAN-0049-one-notification-events-page.md`
- **Records:** ITEM-0180. It also supersedes the screen-level part of BUG-3375, per ITEM-0180's Dependencies section.
- **Reserved REG range used:** REG-510, REG-511, REG-512. REG-513 and REG-514 are unused.

## ITEM-0180 — One plain notification events page replacing Rules and Channel Preferences

**Status proposed:** FIXED, pending browser verification on a throwaway database.

### Root cause

The page was not merely long. It showed controls that dispatch never read, and events that could never fire.

1. **Two tables for one list, and a Save button at the bottom.**
   - `apps/web/app/(authenticated)/settings/notifications/_components/notification-rules-manager.tsx:204-283` (rules) and `:285-382` (preferences) iterated the same rows.
   - Raw codes at `:235-237` and `:315-317`.
   - A single Save at `:371-381`.
   - `min-w-[720px]`/`min-w-[860px]` at `:211`/`:292`.
   - Explanatory paragraphs at `:177`, `:205`, `:286`.
2. **In-app checkboxes nothing read** (`declared-but-unwired-step`).
   - `NotificationsService.emit()` (`services/api/src/modules/notifications/notifications.service.ts`, the `emit` method) consulted only `NotificationRule`, never `NotificationPreference(IN_APP)`.
   - `NotificationOrchestratorService.dispatch()` (`notification-orchestrator.service.ts:93-110` at base) created payroll and payslip in-app rows with no gate at all.
   - Only email (`email/email-execution.service.ts:293-329`) honoured a preference.
3. **"Live" decided by catalog `availability` alone** (`gate-scoped-to-one-structure`).
   - `CLAIM_*`, `LOAN_*` and `TIMESHEET_*` are `ACTIVE`, but no tenant has a `NotificationRule` for module keys `claim`, `loan` or `timesheet` (`services/api/prisma/seed-config.ts:300-441`), so `emit()` returns `{created: 0}`.
   - Six more `ACTIVE` events have no emitter anywhere: `PAYROLL_PROCESSED`, `PAYROLL_CALCULATION_COMPLETED`, `PAYROLL_CALCULATION_FAILED`, `PAYROLL_BLOCKERS_FOUND`, `PAYSLIP_EMAIL_FAILED`, `JOURNAL_GENERATION_FAILED`.
   - Leave events list `EMAIL` in `defaultChannels`, but nothing emails them.
4. **Channel tiles for things with no consumer.** `inAppEnabled`, `browserPushEnabled` and `digestEnabled` are read by nothing on the server except the resolver that returns them (`tenant-settings/tenant-settings-resolver.service.ts:1287-1290`). `emailEnabled` is read at `email-execution.service.ts:327`.

### Fix

**API.** Existing `/notifications/rules` and `/notifications/preferences` routes are unchanged.

- **`notification-event-delivery.ts` (new).** Declares which path delivers each event: rule-driven `emit()` with its exact `moduleKey`, direct orchestrator in-app, or email. It also lists the ACTIVE events with no emitter. Module grouping lives here, and so does `resolveDeliverableChannels`, shared by the read model and the write validation. It is kept out of the catalog to avoid colliding with WP-04.
- **`GET /notifications/event-settings`.**
  - Returns one item per event some path delivers to *this* tenant. Rule-driven in-app requires the tenant's own rule with the emitter's `moduleKey`.
  - Each channel's `enabled` mirrors dispatch:
    - rule-driven in-app is on when some matching rule is enabled and the preference is not `false`;
    - direct in-app and email are on when the governing rule (if any) is enabled and the preference is not `false`;
    - a missing preference row counts as on.
  - Required events (`configurable: false`) report `required: true`.
  - Permissions: `notifications.read` + `USER_PREFERENCES:read`.
- **`PATCH /notifications/event-settings/:code` with `{channel, enabled}`.** Permissions: `notifications.manage` **and** `notifications.manageRules` + `USER_PREFERENCES:write`. In one `$transaction`:
  1. Upsert the tenant-scope preference, keeping any stored metadata.
  2. Set every `NotificationRule` for the event to "any deliverable channel still on" (ADR-0011). Rules are never created.
  3. Audit `notification_preference.updated` and, for each changed rule, `notification_rule.updated`, with before/after snapshots.

  It refuses required, unavailable or undeliverable channels (`NOTIFICATION_EVENT_NOT_CONFIGURABLE`), and unknown or retired codes (404).
- **In-app gates.**
  - `emit()` creates no rows when `NotificationPreference(IN_APP)` is `false`; workflows still run.
  - `NotificationOrchestratorService.dispatch()` now skips the in-app create on preference `false` or a disabled rule, mirroring `execute()`. It returns `inAppSkippedReason`.
  - Both skip the check for `configurable: false` events.
  - The email half is untouched.

**Web.**

- **`rules/page.tsx`** fetches `/notifications/event-settings` and `/tenant-settings`. Its title stays **"Notification Rules"** (see "Naming" below).
- **`_components/notification-events-manager.tsx` (new)**:
  - a search field;
  - a "Send email" tenant switch, the only channel switch with a consumer, hidden if tenant settings could not be read;
  - one `SectionCard` per module;
  - per event, the name plus a `CheckboxField` for each deliverable channel (In-app, Email), or a `StatusPill` "Always on";
  - rows wrap, with no `min-w-*`;
  - no codes are shown (`data-event-code` only) and there is no explanatory copy;
  - Email toggles are disabled while "Send email" is off;
  - the empty state (no events, no search results) uses `EmptyState`; loading and error use the shared `(authenticated)/loading.tsx` and `error.tsx`.
- **`_components/notification-events-model.ts` (new, pure logic)**: grouping, search, the payload builder, and optimistic toggles. A failure rolls back only that toggle and sets an inline error.
- **`_components/notification-rules-manager.tsx`**: deleted.
- **`lib/notifications-api.ts`**: event-settings types and two client calls.

### Tests added

Every new spec was mutation-checked. With the fix removed, it fails:

| Spec | Mutation that fails it |
|---|---|
| `services/api/src/modules/notifications/notification-event-delivery.spec.ts` | `PAYROLL_PROCESSED` dropped from the no-emitter list; a rule declared under the wrong moduleKey |
| `services/api/src/modules/notifications/notification-event-settings.spec.ts` | rule never aligned; read model ignoring rule and preference; `manageRules` removed from the route |
| `services/api/src/modules/notifications/notification-in-app-gate.spec.ts` | orchestrator gate removed; `emit()` gate removed |
| `services/api/src/modules/notifications/notification-event-channel-dto-contract.spec.ts` (seam) | web payload gains a field |
| `apps/web/app/(authenticated)/settings/notifications/_components/notification-events-model.spec.ts` | failed save keeps the optimistic value |

What each spec covers:

- **Delivery declarations**:
  - completeness: every live catalog event sits in exactly one list;
  - a call site exists for each declared emitter, with the rule `moduleKey` in the same file;
  - no emitter-shaped call site exists for a no-emitter event;
  - every event resolves to a module;
  - a self-test proves the negative check can fail.
- **Service and controller**:
  - hiding: no emitter, not yet available, retired, and a rule that belongs to another tenant;
  - no Email channel on leave events;
  - the truth table;
  - required events locked;
  - enabling re-enables a disabled rule, and the last channel off disables it;
  - another channel still on leaves the rule untouched;
  - metadata kept;
  - refusals;
  - audit before/after on both models, inside the transaction;
  - every repository call carries `user.tenantId`, and another tenant's rows are untouched;
  - both permission decorators on both routes.
- **In-app gates**:
  - orchestrator skips on preference `false` or a disabled rule;
  - it creates when there is no row, or when both allow;
  - it never asks about `configurable: false`;
  - email still sends when in-app is opted out;
  - `emit()` creates nothing on preference `false` but still runs workflows.
- **Seam**: the web builder is read from source and must return exactly `{ channel, enabled }`, with that result being what the runner and client send. `ValidationPipe` uses `main.ts` options and accepts IN_APP/EMAIL. It rejects PUSH, SMS, a body `eventCode`/`tenantId`, `"false"` and a missing flag.
- **Web model**:
  - grouping order;
  - only In-app and Email shown;
  - search is case- and accent-insensitive, never matches codes, and drops empty groups;
  - optimistic success;
  - failure rollback with a message and a fallback message;
  - a rollback does not touch a toggle that already saved;
  - a pending sibling keeps its on-screen value.

### Commands run (final, at 6581cdc5)

The pattern `notification` matches the worktree path, so it runs every suite in the workspace.

| Command | Result |
|---|---|
| `DATABASE_URL=<dummy> npm --workspace api run test -- notification` | **PASS** — 334/334 suites, 6694/6694 tests |
| `npm --workspace web run test -- notification` | **PASS** — 95/95 suites, 1855/1855 tests |
| `npm --workspace web run check-types` | **PASS** |
| `npm --workspace api run check-types` | **FAIL, pre-existing** — only `src/common/storage/providers/r2-object-storage.provider.ts(8,8)` and `(9,30)`: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` not installed. Both are declared in `services/api/package.json:65-66` (commit f4278f17), absent from the junctioned `node_modules`, and neither file is touched by this branch. No other type errors. |
| `npx eslint --fix` on every changed file (api, web) | **PASS** — 0 errors, 0 warnings |
| Mutation checks (9 mutations, script-applied, originals restored byte-identically) | **9/9 killed** |

### Regression entries

#### REG-510 — An In-app notification checkbox that no dispatch path read

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api/src/modules/notifications`, `apps/web` |
| **Bug record** | ITEM-0180 |
| **Root cause** | `/settings/notifications/rules` wrote `NotificationPreference(IN_APP)`. Neither in-app path read it: `NotificationsService.emit()` consulted only `NotificationRule`, and `NotificationOrchestratorService.dispatch()` (payroll, payslips) created in-app rows with no gate at all. Only `EmailExecutionService.execute()` honoured a preference. |
| **Regression test** | `services/api/src/modules/notifications/notification-in-app-gate.spec.ts`, `services/api/src/modules/notifications/notification-event-settings.spec.ts` |
| **QA scenario** | (orchestrator to assign) |
| **Scenario** | On the events page, turning an event's In-app channel off stops its in-app notification on both paths: `emit()` creates no rows, though workflows still run, and the orchestrator reports `inAppSkippedReason`. Email for the same event is unaffected. Turning the last channel off disables the event's rules; turning one back on re-enables them. Both writes are audited in one transaction. Required events (`AUTH_ACCOUNT_ACTIVATION`, `AUTH_PASSWORD_RESET`) are never asked. |
| **Proven to fail without the fix** | Removing either gate fails `notification-in-app-gate.spec.ts`: 3 of 8 tests fail for the orchestrator gate, 1 of 8 for the `emit()` gate. Removing rule alignment fails 2 of 18 in `notification-event-settings.spec.ts`. |
| **Note** | ADR-0011 is unchanged: rule = can this event notify anyone; preference = which channels. This change only makes the in-app side read the preference, as the email side always did. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

#### REG-511 — Events with no emitter offered as live, because "live" meant catalog availability

| | |
|---|---|
| **Bug class** | `gate-scoped-to-one-structure` |
| **Module** | `services/api/src/modules/notifications` |
| **Bug record** | ITEM-0180 |
| **Root cause** | The settings screen treated `availability: ACTIVE` as "can fire". Claims, loans and timesheets are ACTIVE, but their in-app path needs a tenant `NotificationRule` for module keys `claim`, `loan` and `timesheet`, which no tenant has. Six payroll events are ACTIVE with no emitter at all. Leave events list EMAIL, but nothing emails them. |
| **Regression test** | `services/api/src/modules/notifications/notification-event-delivery.spec.ts`, `services/api/src/modules/notifications/notification-event-settings.spec.ts` |
| **QA scenario** | (orchestrator to assign) |
| **Scenario** | The events page lists only events a code path delivers to this tenant, with only the channels it delivers on. Every live catalog event is declared in `NOTIFICATION_EVENT_DELIVERY` or `EVENTS_WITHOUT_EMITTER` (never both, never neither). Each declared emitter has a call site, with the rule's `moduleKey` in the same file, and no no-emitter event has a sending call site. |
| **Proven to fail without the fix** | Dropping `PAYROLL_PROCESSED` from the no-emitter list, or declaring a leave event under `moduleKey` `leaves`, fails `notification-event-delivery.spec.ts` (1 of 6). Making the read model ignore rule and preference fails 3 of 18 in `notification-event-settings.spec.ts`. |
| **Note** | Hiding claims, loans and timesheets is truthful today, not permanent. They reappear automatically once a tenant has a matching rule and ITEM-0170's resolver work lands. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

#### REG-512 — The events page toggle payload and its DTO are one contract

| | |
|---|---|
| **Bug class** | `seam` (client payload vs `forbidNonWhitelisted` DTO) |
| **Module** | `apps/web`, `services/api/src/modules/notifications` |
| **Bug record** | ITEM-0180 |
| **Root cause** | A field added on the web side would 400 every toggle. With optimistic save and rollback, that reads as "the checkbox will not stay ticked", not as a validation error. |
| **Regression test** | `services/api/src/modules/notifications/notification-event-channel-dto-contract.spec.ts`, `apps/web/app/(authenticated)/settings/notifications/_components/notification-events-model.spec.ts` |
| **QA scenario** | (orchestrator to assign) |
| **Scenario** | The body the page sends (`{ channel, enabled }`, read from the web source) passes the real `ValidationPipe` with `main.ts` options. Any extra field, a `PUSH`/`SMS` channel, or a non-boolean flag is rejected. A failed save reverts only its own checkbox and shows an inline error. |
| **Proven to fail without the fix** | Adding a field to `buildEventChannelPayload` fails the contract spec (1 of 11). Making a failed save keep the optimistic value fails 3 of 11 in `notification-events-model.spec.ts`. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

### QA retest steps (browser, throwaway database, as a tenant administrator)

1. Open `/settings/notifications/rules` at 1440px.
   - Expect one list grouped by module (Leave, Attendance, Payroll, Employees, Onboarding, Reports, Support, Billing, Account, in whatever subset exists), each event once.
   - Expect no raw codes, no "Not configured" / "No rule exists" / "Not yet available", no Browser Push or Digests, no paragraphs, and no Save button.
2. Confirm Claims, Loans and Timesheets are absent on a seeded tenant (no rules for those modules), and that no leave event shows an Email checkbox.
3. Untick In-app on "Leave request approved for employee" and reload: it stays unticked.
   - DB: the tenant-scope `NotificationPreference(IN_APP)` is `false` and the event's `NotificationRule.enabled` is `false`.
   - Audit log: `notification_preference.updated` and `notification_rule.updated`.
   - Tick it again: both come back on.
4. Approve a leave request with In-app off: no inbox notification is created. With it on: one is created.
5. Untick Email on "Payslip available": In-app stays ticked, and the rule (if any) is untouched. Publish or deliver a payslip: the email is `SKIPPED` (`EVENT_EMAIL_DISABLED`) and the in-app notification is still created.
6. Untick "Send email": every Email checkbox is disabled, and `notifications.emailEnabled` is `false`. Re-tick.
7. Force a failure (for example block `PATCH /api/notifications/event-settings/*` in devtools) and tick a box: it reverts, with an inline error beside it. Other checkboxes are unaffected.
8. Type in Search ("payslip"): only matching events remain, and empty groups disappear. Type nonsense: "No matching events".
9. "Account activation" and "Password reset" show "Always on" with no checkbox. `PATCH` for them returns 400 `NOTIFICATION_EVENT_NOT_CONFIGURABLE`.
10. As a user with only `notifications.read`: checkboxes render disabled, and a forced `PATCH` returns 403.
11. At 400px: rows wrap (name above checkboxes) with no row-level horizontal scroll. See the residual risk on the settings shell.

### Residual risks and findings for the orchestrator

- **Mobile layout comes from the shared settings shell. Reported, not restyled.**
  - `apps/web/app/components/settings/settings-layout.tsx:26-31` is a `flex` row with a `shrink-0` aside.
  - `apps/web/app/(authenticated)/settings/_components/settings-shell.tsx:63-67` gives that aside a fixed `w-[260px]` (collapsed `w-[56px]`).
  - There is no small-screen stacking or hiding, so at 400px the content column is squeezed beside, or pushed under, the navigation (walkthrough finding N10).
  - This page no longer contributes any minimum width; the shell needs a responsive fix by its owner.
- **Behaviour change on release.** A tenant that unticked In-app on the old page (which nothing read) will stop receiving those in-app notifications once this ships. That is truthful to what the administrator chose; worth a release note.
- **Workflow email follows the rule.** Turning an event's last visible channel off disables its rule, and `execute()` already skips email for a disabled rule (ADR-0011). A tenant workflow's `SEND_EMAIL` action keyed on that event therefore stops too.
- **`hr` role sees the page read-only.** `hr` holds `notifications.manageRules` but not `notifications.manage` (`services/api/src/common/constants/permissions.ts:2250`), and the toggle route requires both because it writes both models. The old `/notifications/rules` and `/notifications/preferences` routes remain. **Open question:** should `hr` be granted `notifications.manage`?
- **Other surfaces still show the dead switches.** `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts:1966-2000` (`notificationSettingsSections`, the settings-runtime notifications form) still offers "Enable in-app notifications", "Enable browser notifications" and "Enable digest notifications", none of which has a consumer. Not in WP-05 ownership.
- **Naming.** The coordinator fixed the title as "Notification Rules" (WP-06 pins it with navigation, group and adapter-registry labels). **Proposed rename:** "Notification Events" across all four together, since the page no longer shows rules as such.
- **No DB-backed e2e spec written.** The transaction, upsert and `updateMany` behaviour is covered by unit specs with a faithful fake. The orchestrator's throwaway-database browser pass (steps 3–6) is the DB-backed check.
- **Pre-existing:** `api check-types` fails on the missing `@aws-sdk` packages (see Commands run).

### Files touched

- **API:**
  - `services/api/src/modules/notifications/notification-event-delivery.ts` (new)
  - `dto/notification-event-channel.dto.ts` (new)
  - `dto/index.ts`
  - `notifications.repository.ts`
  - `notifications.service.ts`
  - `notification-orchestrator.service.ts`
  - `notifications.controller.ts`
  - four new specs
- **Web:**
  - `apps/web/app/(authenticated)/settings/notifications/rules/page.tsx`
  - `_components/notification-events-manager.tsx` (new)
  - `_components/notification-events-model.ts` (new)
  - `_components/notification-events-model.spec.ts` (new)
  - `_components/notification-rules-manager.tsx` (deleted)
  - `apps/web/lib/notifications-api.ts`
- **Docs:** `docs/plans/EXECPLAN-0049-one-notification-events-page.md`, this report.
- **Outside declared ownership:** `notification-orchestrator.service.ts` and the `emit()` gate in `notifications.service.ts` are dispatch code, not endpoints. Requirement 3 needs them: without them the In-app toggle writes a value no path reads. Nothing touched in templates, providers, delivery logs, settings navigation, `settings-runtime.ts`, the adapter registry, `standard-module-list-page.tsx`, `settings-runtime-pages.tsx`, `form-control.tsx` or the error provider.
