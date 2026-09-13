---
WP_ID: WP-05
TASK_ID: TASK-0031
TITLE: One plain notification events page
STATUS: DONE
OWNER_AGENT: Frontend
DEPENDENCIES: []
LAST_VERIFIED_SHA: 1051495e
KNOWLEDGE_IMPACT: [MODULE, UI_CONVENTION]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-05 — One plain notification events page

Work package of [[TASK-0031]].

## Goal

One page lists every notification event with a plain switch per channel, and
a switch saves and survives a reload.

## Context Manifest

REQUIRED:
- `apps/web/app/(authenticated)/settings/notifications/rules/`
- `services/api/src/modules/notifications/notifications.service.ts`
- `docs/decisions/ADR-0011-notification-rule-and-preference-are-two-gates-not-one.md`

OPTIONAL:
- `services/api/src/modules/notifications/notifications.constants.ts`

DO_NOT_LOAD:
- the template editor and provider pages — WP-04 and WP-06
- customization and employee record source

LAST_VERIFIED_SHA: 1051495e — re-read any summarised source that changed since.

## Relevant Files

- `apps/web/app/(authenticated)/settings/notifications/rules/`
- `services/api/src/modules/notifications/notifications.service.ts`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The page is not renamed | VERIFIED | Architect declined the rename; the navigation still says Notification Rules |

## Implementation State

Done on `agent/walkthrough2-notification-events` at `1051495e`; merged at
`80235361`.

## Validation State

Unit tests pass. Local browser QA passed at desktop width.

## Evidence

- The page renders a searchable event list with per-channel switches (27 on the local tenant).
- A switch toggled, reloaded, reads the new value; it was restored afterwards.

## Questions

Whether the `hr` role may manage notification events is an owner decision,
filed as ITEM-0193.

## Handoff

KNOWLEDGE_IMPACT: MODULE, UI_CONVENTION.
OBSIDIAN_IMPACT: UPDATE_NODE.

At 400px the settings shell itself overflows; that belongs to ITEM-0185, not
this page. Release note: an in-app preference that was unticked now suppresses
the notification, and turning off an event's last channel stops its workflow
email.
