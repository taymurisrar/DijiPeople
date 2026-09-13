---
WP_ID: WP-08
TASK_ID: TASK-0031
TITLE: Production release and demo-tenant verification
STATUS: DONE
OWNER_AGENT: Release/DevOps
DEPENDENCIES: [WP-07]
LAST_VERIFIED_SHA: e253306a
KNOWLEDGE_IMPACT: [NONE]
OBSIDIAN_IMPACT: NONE
---

# WP-08 — Production release and demo-tenant verification

Work package of [[TASK-0031]].

## Goal

Release `develop` to `main` through a pull request, confirm production serves
the merge commit, verify the fixes on the demo tenant, and remove the temporary
System Customizer role from the owner.

## Context Manifest

REQUIRED:
- `.agent/agents/release-devops.md`
- `.agent/context/repository-health.md`

OPTIONAL:
- `docs/deployment/environments.md`

DO_NOT_LOAD:
- product source — nothing is changed in this package
- the bug backlog beyond the TASK-0031 records

LAST_VERIFIED_SHA: e253306a — the release merge commit.

## Relevant Files

- No repository files — this package produces release evidence.

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The owner authorised a production release for this program | USER_CONFIRMED | Owner decision on 2026-09-13 |
| A-02 | Render's pre-deploy step applies `seed:config`, so the system template copy reaches production | VERIFIED | The production templates page shows the system defaults updated at 2:36 AM on 2026-09-13, during the deploy |

## Implementation State

Done. PR #80 (`develop` → `main`) merged at `e253306a` after the required gate
passed on its head `f865ac5e`; `develop` fast-forwarded to `e253306a`. The
owner's temporary System Customizer role was removed after the permission-based
access fix was confirmed live.

## Validation State

Production serves `e253306a` on both the API and the tenant web app, and every
decided behaviour was checked on the demo tenant (see Evidence). A real email
through the relay was not sent by hand; the tenant's 09:00 UTC scheduled report
is the first one.

## Evidence

- `/api/health` reports `commit: e253306a…`; Render deploy `dep-daj0mc7qj5pc73ardk10` live after its pre-deploy step; Vercel `diji-people-web` production READY on `e253306a`.
- Demo tenant, owner: Customization loads; the "QA Assets" custom module is in the main menu and its create screen shows its field; the Email Providers page states delivery through the platform relay with Console "Not used"; Notification Rules shows 27 channel switches; Email Templates lists the ACTIVE system defaults with no placeholder copy; Delivery Logs renders.
- Temporary System Customizer role removed (`DELETE /api/users/…/roles/…` → 200); with System Administrator only, Customization → Modules still lists the QA Asset module with no denial or error.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: NONE.
OBSIDIAN_IMPACT: NONE.

Read the delivery log after 09:00 UTC on 2026-09-13: the tenant's scheduled
report should show Sent through the relay, not Console.
