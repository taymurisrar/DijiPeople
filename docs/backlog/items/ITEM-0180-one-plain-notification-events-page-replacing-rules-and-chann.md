---
ID: ITEM-0180
aliases: [ITEM-0180]
Title: One plain notification events page replacing Rules and Channel Preferences
Type: UX
Status: READY
Priority: P1
Severity: MEDIUM
AffectedModules: [apps/web, notifications]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: BUG-3375
RelatedQA: 
RelatedADR: 
RelatedImplementation:
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

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3375]]
- Modules — [[tenant-application]], [[notifications]]

<!-- GRAPH:END -->
