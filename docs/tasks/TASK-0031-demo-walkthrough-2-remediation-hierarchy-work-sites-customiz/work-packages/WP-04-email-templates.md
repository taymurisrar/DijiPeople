---
WP_ID: WP-04
TASK_ID: TASK-0031
TITLE: Email templates - real default copy and visual editor
STATUS: DONE
OWNER_AGENT: Backend/API
DEPENDENCIES: []
LAST_VERIFIED_SHA: b0d8278d
KNOWLEDGE_IMPACT: [MODULE]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-04 — Email templates

Work package of [[TASK-0031]].

## Goal

Replace placeholder system email templates with real copy that ships active,
and give tenants a visual editor to customise a system template.

## Context Manifest

REQUIRED:
- `services/api/src/modules/notifications/`
- `apps/web/app/(authenticated)/settings/notifications/templates/`
- `docs/tasks/TASK-0031-streams/WP-04-email-copy-for-owner-review.md`

OPTIONAL:
- `services/api/prisma/seed-config.ts` — how system templates reach production

DO_NOT_LOAD:
- customization and employee record source
- the email provider factory — WP-06 owns it

LAST_VERIFIED_SHA: b0d8278d — re-read any summarised source that changed since.

## Relevant Files

- `services/api/src/modules/notifications/system-email-templates.copy.ts`
- `apps/web/app/(authenticated)/settings/notifications/templates/`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The drafted copy ships active | USER_CONFIRMED | Owner decision on 2026-09-13 |
| A-02 | Release applies seeded template copy on deploy | VERIFIED | Render pre-deploy runs migrate and `seed:config`; `seed:config` run twice locally changed 0 rows the second time |

## Implementation State

Done on `agent/walkthrough2-email-templates` at `b0d8278d`; merged at
`d0922e9b`.

## Validation State

Unit tests pass. Local browser QA passed.

## Evidence

- The templates page lists the system defaults as ACTIVE, each with View and Customize.
- No placeholder copy and no raw JSON fields on the page.
- A production read-only check found 0 tenant-owned ACTIVE placeholder templates, so ITEM-0194 closed DONE.

## Questions

None open. The owner reviews the copy in the stream's copy document.

## Handoff

KNOWLEDGE_IMPACT: MODULE — notifications.
OBSIDIAN_IMPACT: UPDATE_NODE.

Residuals in ITEM-0181: the scheduled-report email prints its period as the raw
preset value, and older tenant copies of the invoice and support-case templates
still override the system copy. BUG-3506 covers the payslip email link.
