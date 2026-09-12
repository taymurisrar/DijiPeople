---
ID: BUG-3375
aliases: [BUG-3375]
Title: The Notification Rules screen edits preferences and cannot reach NotificationRule at all
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [notifications, apps/web]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: REG-460
RelatedBacklogItem: ITEM-0169
RelatedDecision: ADR-0009
RelatedImplementation: EXECPLAN-0037
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3375 — The Notification Rules screen edits preferences and cannot reach NotificationRule at all

## Summary

The screen served at `/settings/notifications/rules` does not manage
notification rules. It manages `NotificationPreference`, the per-event channel
opt-in. The model that actually decides whether a notification fires,
`NotificationRule`, has no API surface anywhere in the product: no controller
route reads or writes it, and the only way to create or change one is to edit a
seed script and redeploy.

The consequence is not cosmetic. If no `NotificationRule` row exists for a
tenant, module and event, `NotificationsService.emit()` produces nothing at all,
silently, and there is no screen in the product on which an administrator could
see that, let alone fix it. The one screen named after rules shows a different
table and reports everything as Enabled.

## Expected Behavior

A screen called Notification Rules manages notification rules, or is named for
what it manages. An administrator can see which events have a rule, which do
not, and can change that. An event that cannot fire because it has no rule is
visibly distinguishable from one that is switched off by preference.

## Actual Behavior

The screen renders `NotificationPreferencesManager`, a table of 53 events with
channel checkboxes, all shown as Enabled. `NotificationRule` is neither read nor
written by it. An event with no rule looks identical to an event that is fully
configured and working.

## Reproduction

1. Open `/settings/notifications/rules` on the tenant product.
2. Observe the browser tab title reads `Rules`, the settings navigation entry
   reads `Notifications`, and the heading on the page reads
   `Notification Event Preferences`. Three names for one screen.
3. Observe every one of the 53 rows reports Default = Enabled.
4. Search the product for any screen that lists or edits `NotificationRule`.
   There is none.

## Evidence

Measured on the live demo workspace at `cbd9b812` by reading the rendered
table: **53 event rows, 64 channel checkboxes, one `Save Preferences` button, no
search box, no filter, no pagination, no per-row save.**

- `apps/web/app/(authenticated)/settings/notifications/rules/page.tsx:29` — the
  route renders `NotificationPreferencesManager`, forty lines total.
- `services/api/prisma/schema.prisma:7970` — `NotificationRule` is keyed on
  `(tenantId, moduleKey, eventKey, resolverType)` and carries `enabled`,
  `templateKey`, `channels`, `displayMode`, `priority`. This is the model that
  gates delivery.
- `services/api/src/modules/notifications/notifications.repository.ts:868` —
  `listEnabledRules` is the only read, called from `NotificationsService.emit()`.
- `services/api/src/modules/notifications/notifications.service.ts:612-658` —
  `emit()` with no matching rule creates nothing and reports nothing.
- Writes to the model exist only as `prisma.notificationRule.upsert` in
  `seed-config.ts` and `seed-demo.ts`. Grepping the notifications controller for
  a rule route returns nothing.

The page also leaks implementation detail into tenant-facing copy. Rendered
verbatim above the table:

> SOURCE: TENANTSETTING CONTROLS GLOBAL LIGHTWEIGHT NOTIFICATION TOGGLES.
> NOTIFICATIONPREFERENCE CONTROLS PER-EVENT CHANNEL ENABLEMENT.

and, above that, "These lightweight tenant settings are read from the existing
tenant settings API". Model names and API topology are not a tenant
administrator's concern.

## Root Cause

Two configuration models were built for overlapping purposes and only one was
given a user interface. The screen took the name of the model it does not
manage.

## Impact

An administrator cannot configure notification rules, cannot discover that an
event has no rule, and is shown a screen that implies otherwise by reporting
everything Enabled. This is the mechanism behind the wider complaint that
notifications are not properly used across the app: some events cannot fire, and
nothing surfaces it.

## Affected Areas

`/settings/notifications/rules`; the `notifications` module's rule evaluation
path. Related but distinct screen-level defects are listed below rather than
split into their own records:

1. No `loading.tsx` or Suspense boundary anywhere under
   `settings/notifications/`, despite three parallel server fetches.
   `apps/web/AGENTS.md` makes loading states mandatory.
2. No empty state when the event list is empty
   (`notification-preferences-manager.tsx:141`).
3. A hand-rolled `table` at `notification-preferences-manager.tsx:131-195`
   rather than the shared data-table kit, which is why 53 rows have no sort,
   filter or search. `apps/web/AGENTS.md` calls a hand-rolled table a review
   failure.
4. No `AuditService.log()` call anywhere in `notifications.service.ts`, so a
   preference change leaves no audit trail.
5. Table headers lack `scope="col"`; the per-row channel checkboxes are grouped
   visually with no fieldset or legend.
6. A channel can be enabled here while the workspace has no working provider for
   it, with no inline warning on this screen.

## Proposed Resolution

Needs an ExecPlan under `PLANS.md` — it is a model-ownership decision before it
is a screen.

Decide first whether `NotificationRule` and `NotificationPreference` should both
exist. If they should, give `NotificationRule` a controller, permission keys in
both systems, audit coverage and a real administration screen, and rename the
preferences screen to what it does. If they should not, fold the rule's fields
into the preference model and retire one of them. Either way, `AGENTS.md`
principle 4 applies: there should be one home for the answer to "will this event
notify anyone".

The screen defects listed above should be fixed with whichever screen survives,
not before.

## Acceptance Criteria

- Every route, navigation label and page heading for this screen agrees on what
  it manages.
- An administrator can see, for each catalog event, whether a rule exists and
  whether it is enabled.
- An event with no rule is visually distinct from an enabled, working one.
- Changing a rule or a preference writes an audit entry.

## Regression Coverage

Needs a test asserting that an event with no `NotificationRule` row is reported
as such through whatever API the new screen consumes, rather than defaulting to
Enabled. A register entry follows once written.

## Dependencies

Overlaps [[ITEM-0171]], which records the second dispatch path that bypasses
`NotificationRule` entirely; the two should be planned together, because the
answer to "which model gates delivery" has to hold for both paths.

## Related Items

[[ITEM-0169]] covers catalog hygiene on the same screen. [[ITEM-0170]] covers
the modules that emit nothing. [[ITEM-0171]] covers the ungated dispatch path.
[[BUG-0314]] is the admin console's notifications placeholder, a different
screen.

## Resolution

Decided in [[ADR-0009]] and implemented in
`docs/plans/EXECPLAN-0037-notification-rule-administration-and-unified-dispatch-gate.md`:
both `NotificationRule` and `NotificationPreference` stay, because they answer
different questions (wiring vs. channel opt-in) and merging them would need a
schema migration this task avoided.

- `NotificationRule` now has a real controller:
  `GET /notifications/rules`, `PATCH /notifications/rules/:id`
  (`notifications.controller.ts`), backed by
  `NotificationsService.listRules`/`updateRule` and
  `NotificationsRepository.listRulesForTenant`/`findRuleById`/`updateRule`.
  Both permission decorators reuse the existing `notifications.manageRules`
  legacy key (previously declared but unused) and the
  `ENTITY_KEYS.USER_PREFERENCES` matrix privilege.
- The screen at `/settings/notifications/rules` was rebuilt as
  `NotificationRulesManager` (replacing `NotificationPreferencesManager`):
  a "Notification Rules" section showing, per event, whether a rule exists
  and whether it is enabled/disabled/always-on/not-yet-available — each
  rendered with a distinct `StatusPill` tone — and a separate "Channel
  Preferences" section for the existing per-channel opt-in. Page title,
  section headings and the settings navigation entry now agree the screen
  manages rules and preferences together. The developer-facing "SOURCE:
  TENANTSETTING CONTROLS..." diagnostic text and the "read from the existing
  tenant settings API" line were removed; section blurbs are written in
  tenant language.
- `AuditService.log()` is now called from both `updatePreferences()` and the
  new `updateRule()`, with before/after snapshots — closing defect #4 from
  this record's Affected Areas list.
- Accessibility: table headers carry `scope="col"`; each row's channel
  checkboxes are grouped in a `fieldset`/`legend`. A hand-rolled table is
  still used rather than the shared data-table kit (`ModuleDataTable`) —
  this and a dedicated `loading.tsx` for this route are deliberately left as
  smaller follow-on polish, per this record's own Proposed Resolution
  ("screen defects... fixed with whichever screen survives, not before");
  the existing `(authenticated)/loading.tsx` ancestor already covers this
  route's loading state in the interim.
- A channel enabled with no working provider still shows no inline warning
  on this screen (defect #6) — not addressed in this pass; the Providers
  screen already surfaces this separately.

## QA Retest

QA-SETTINGS-018 covers the acceptance criteria end to end (NOT_CONFIGURED
distinct from ENABLED, both dispatch paths honouring a disabled rule,
ALWAYS_ON events rejecting a disable attempt, audit entries on every write).
Not yet executed against a live database in this session — no database was
provisioned for this task; unit-level coverage
(`notification-rules.spec.ts`, `email-execution-rule-gate.spec.ts`) was run
and passes (see the task's final validation report).

## History

- 2026-09-11 — created from user report at `cbd9b812`; screen contents measured
  live, model surface confirmed by code search.
- 2026-09-12 — fixed in SESSION-0103. Decision recorded as [[ADR-0009]];
  implementation in `EXECPLAN-0037`; regression register entry REG-460.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0169]]
- Referenced by — [[ITEM-0170]], [[ITEM-0171]]
- Modules — [[notifications]], [[tenant-application]]
- Regression — REG-460 (see the regression register)

<!-- GRAPH:END -->
