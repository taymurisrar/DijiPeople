---
ID: ITEM-0180
aliases: [ITEM-0180]
Title: One plain notification events page replacing Rules and Channel Preferences
Type: UX
Status: DONE
Priority: P1
Severity: MEDIUM
AffectedModules: [apps/web, notifications]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: BUG-3375
RelatedQA: [QA-SETTINGS-029]
RelatedADR: 
RelatedImplementation: [docs/plans/EXECPLAN-0049-one-notification-events-page.md, services/api/src/modules/notifications/notification-event-delivery.ts, services/api/src/modules/notifications/notifications.service.ts, services/api/src/modules/notifications/notification-orchestrator.service.ts, apps/web/app/(authenticated)/settings/notifications/_components/notification-events-manager.tsx]
TargetMilestone: 
BlockedBy: 
---

# ITEM-0180 — One plain notification events page replacing Rules and Channel Preferences

## Summary

`/settings/notifications/rules` is where a tenant administrator decides what the
product tells people. It is roughly 10,300px tall and made of two tables of
about 53 rows each: Notification Rules and Channel Preferences. They list the
same events twice, with no search, filter or grouping, and a raw event code
under every name. One Save Preferences button sits at the very bottom. Above
both, channel tiles report Browser Push and Digests as ACTIVE, though neither
channel exists. Many rows say "Not configured" or "No rule exists for this
tenant" with no way to create one, and events that cannot fire are still
listed. At phone width the page cannot be used.

The owner decided on 2026-09-13 to replace it with **one events page**. Events
are grouped by module (Leave, Attendance, …), one row per event, with In-app
and Email toggles that save immediately. Events with no emitter are hidden, as
are the unimplemented Browser Push and Digests channels. The page gets a search
and works at mobile width.

## Why It Matters

This is the only map an administrator has of tenant notifications. As it
stands it cannot be used for a decision:
- Every event appears twice, under two different mechanisms.
- It claims two channels are active that cannot send anything.
- It offers events that will never fire.
- A change made near the top is lost unless the administrator scrolls about
  10,000px to the only save button.

With tenant email live, a wrong switch here reaches real employees' inboxes.
P1 because notifications are part of go-live, and the demo walkthrough stalled
on this screen.

## Evidence

Observed on the demo tenant (`https://dijipeople-demo.ws.dijipeople.com`) as
the workspace owner, deployed build at `df0f84f1`. The screen is rendered by
`apps/web/app/(authenticated)/settings/notifications/_components/notification-rules-manager.tsx`
(route `apps/web/app/(authenticated)/settings/notifications/rules/page.tsx`).

| Measurement (1440px) | Value |
|---|---|
| Document height | ~10,300px |
| Tables | 2 (Notification Rules, Channel Preferences) |
| Rows per table | ~53 |
| Search / filter / grouping controls | 0 |
| Save buttons | 1, below the second table |

**N2 — two tables for one list.** The Notification Rules table
(`notification-rules-manager.tsx:204-283`) and the Channel Preferences table
(`:285-382`) iterate the same `rows`. Each prints `event.name` with `event.code`
in monospace beneath it (`:235-237`, `:315-317`). Preference checkboxes write to
a local draft that only persists through the single Save Preferences button at
`:371-381`.

**N2 — channels that do not exist, shown ACTIVE.** The channel tiles at
`:180-201` render In-app, Email, Browser Push and Digests. Each shows ACTIVE
unless the tenant setting is explicitly `false` (`:196`). No Browser Push or
digest delivery exists.

**N2 — rows the administrator can do nothing about.** Rows without an enabled or
disabled rule render the text "No rule exists for this tenant" or "No trigger
implemented yet" in place of an action (`:269-275`). The preference column
renders "Not yet available" (`:356-361`). Neither offers a way forward, and each
panel carries a paragraph explaining the two-gate model (`:177`, `:205`, `:286`).

**N8, N10 — mobile.** At 400px the document is 1,339px wide and 10,576px tall.
The tables carry `min-w-[720px]` and `min-w-[860px]` (`:211`, `:292`). The
settings category navigation from
`apps/web/app/(authenticated)/settings/_components/settings-shell.tsx` renders
above the page content, which starts about 900px down.

**N1 — names disagree across the notifications area.** The landing card says
"Notifications" while the page title says "Rules". The card says "Email
Delivery Logs", the navigation "Email Logs" and the page title "Delivery Logs".
All four landing cards use the same icon.

## Proposed Approach

An ExecPlan is needed under `PLANS.md`. This replaces a settings screen and its
save model, and must stay correct against the rule/preference model settled in
ADR-0011 and the dispatch paths in [[ITEM-0171]].

1. One page, one row per event, grouped by module. Show the event name, not its
   code. Show In-app and Email toggles only for channels the event supports.
2. A toggle saves on change, with per-row pending and failure state, and
   reverts on failure. No page-level save button.
3. Behind a row, map the toggle onto both gates in ADR-0011, rule and
   preference, so an administrator never meets "Not configured". Creating the
   missing rule is the page's job, not the administrator's.
4. Hide events whose catalog availability is `NOT_YET_AVAILABLE` or that have no
   emitter. Hide the Browser Push and Digests channels until they exist. Show an
   "always on" event's toggle as locked, with no sentence beside it.
5. A search over event names, filtering within groups.
6. Mobile: no fixed minimum table width; rows stack at 400px. The settings shell
   must not push content below its category navigation at phone width.
7. Remove the explanatory panel paragraphs. Where the model is unclear, fix the
   controls, not the copy.
8. Align names: one name per destination across landing card, navigation and
   page title, and distinct icons.

## Acceptance Criteria

- `/settings/notifications/rules` (or its replacement route, redirected from
  the old one) shows each event exactly once, grouped by module.
- Changing a toggle persists without any further click. Reloading the page
  shows the new state, and a failed save visibly reverts the toggle.
- No row shows "Not configured", "No rule exists for this tenant" or "Not yet
  available". Enabling an event creates or enables its rule and preference
  together, verified by an API spec.
- No event without an emitter, and no Browser Push or Digests channel, is
  rendered.
- A search field filters events by name.
- At 400px the document width equals the viewport width, and the event list
  starts within the first viewport height.
- The landing card, navigation label and page title use the same name for each
  notifications destination.
- No raw event code is visible as primary text.

## Dependencies

Supersedes the screen-level part of [[BUG-3375]]; resolve that record against
this item. Uses the availability data [[ITEM-0169]] introduced. Must respect
ADR-0011. Should land before [[ITEM-0181]] narrows its event picker, so both
read one definition of "fires".

## Related Items

[[BUG-3375]] the rules screen edits preferences. [[ITEM-0169]] catalog hygiene.
[[ITEM-0171]] the second dispatch path that ignores rules. [[ITEM-0174]] key
convention. [[ITEM-0181]] the template editor. [[ITEM-0182]] delivery logs.
[[ITEM-0183]] helper-text removal. Decision: ADR-0011.

Follow-ups filed from this item: [[ITEM-0185]] the settings shell at phone
width; [[ITEM-0192]] unconsumed notification switches in
`settings-page-config.ts`; [[ITEM-0193]] whether the `hr` role may manage
notification events.

## Resolution

Done in TASK-0031 WP-05 (commit 1051495e on
`agent/walkthrough2-notification-events`, merged into
`agent/walkthrough2-integration`; plan EXECPLAN-0049). Browser verification
pending in WP-07/WP-08 (QA-SETTINGS-029).

**What was actually wrong** (beyond length): the In-app checkboxes were read by
no dispatch path, and "live" meant catalog availability alone, so events with no
emitter, or no tenant rule, were offered.

**API** (existing `/notifications/rules` and `/notifications/preferences` routes
unchanged):

- `notification-event-delivery.ts` (new) declares which path delivers each event
  (rule-driven `emit()` with its `moduleKey`, direct orchestrator in-app, or
  email) and lists the ACTIVE events with no emitter; module grouping and
  `resolveDeliverableChannels` live here.
- `GET /notifications/event-settings` returns one item per event some path
  delivers to this tenant, each channel's `enabled` mirroring dispatch; required
  events report `required: true`.
- `PATCH /notifications/event-settings/:code` with `{ channel, enabled }`
  (`notifications.manage` and `notifications.manageRules`, plus
  `USER_PREFERENCES` write), in one transaction: upsert the tenant-scope
  preference, set every rule for the event to "any deliverable channel still on"
  (ADR-0011; rules are never created), and audit both with before/after
  snapshots. Required, unavailable and undeliverable channels are refused.
- **In-app gates.** `emit()` creates no rows when `NotificationPreference(IN_APP)`
  is `false` (workflows still run); `NotificationOrchestratorService.dispatch()`
  skips the in-app create on preference `false` or a disabled rule and returns
  `inAppSkippedReason`. Email is untouched.

**Web.** `rules/page.tsx` renders `notification-events-manager.tsx` (new): a
search field, a "Send email" tenant switch, one `SectionCard` per module, per
event its name with In-app and Email checkboxes for deliverable channels or
"Always on", autosave with per-toggle rollback and inline error, no codes, no
`min-w-*`, no explanatory copy. `notification-rules-manager.tsx` was deleted. It
supersedes the screen-level part of [[BUG-3375]].

**Differences from the proposed approach, decided in the ExecPlan.** Events whose
module has no tenant rule (claims, loans, timesheets) are hidden rather than
having rules created, because creating a rule would not make them fire; they
reappear when a tenant has a matching rule. The page title stays "Notification
Rules"; the Architect declined the proposed rename to "Notification Events" for
now.

**Acceptance criteria not met by this page alone.** At 400px the rows wrap with
no minimum width, but the shared settings shell still pushes content below its
navigation, so "the event list starts within the first viewport height" depends
on [[ITEM-0185]].

**Release notes.** A tenant that unticked In-app on the old page (which nothing
read) now stops receiving those in-app notifications. Turning an event's last
channel off disables its rules, which also stops a tenant workflow's
`SEND_EMAIL` action keyed on that event.

Regression coverage: REG-510, REG-511, REG-512. Stream validation: api 334
suites / 6694 tests and web 95 suites / 1855 tests passed; web typecheck passed;
9 of 9 mutations killed.

## QA Retest

**PASS.** Browser-verified in the local QA run
(`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
scenario S15) on a throwaway database: an event toggle persisted across a
reload. On production after release PR #80 (merge commit e253306a, deployed
2026-09-13): the rules page shows 27 channel switches. Local scenario S20 found
that at 400px the settings shell overflows; that is owned by [[ITEM-0185]], not
this item. CI runs 34732185363, 34732682935 and 34732697734 passed on f865ac5e
(the merged tree).

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — done in TASK-0031 WP-05; unit-tested; browser verification pending. Follow-ups ITEM-0185, ITEM-0192 and ITEM-0193 filed.
- 2026-09-13 — QA retest: PASS — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3375]]
- Modules — [[tenant-application]], [[notifications]]
- Implementation — [[EXECPLAN-0049-one-notification-events-page]]

<!-- GRAPH:END -->
