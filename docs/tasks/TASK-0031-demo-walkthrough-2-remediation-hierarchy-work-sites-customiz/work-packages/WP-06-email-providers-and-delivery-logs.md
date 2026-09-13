---
WP_ID: WP-06
TASK_ID: TASK-0031
TITLE: Email providers and delivery logs - retire sinks in production, truthful status, logs
STATUS: DONE
OWNER_AGENT: Backend/API
DEPENDENCIES: []
LAST_VERIFIED_SHA: 11e987a6
KNOWLEDGE_IMPACT: [MODULE, SECURITY, DECISION]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-06 — Email providers and delivery logs

Work package of [[TASK-0031]].

## Goal

Production ignores sink providers such as Console so tenants fall back to the
platform relay (ADR-0015); the providers page says truthfully whether mail is
delivered; delivery logs are readable.

## Context Manifest

REQUIRED:
- `services/api/src/modules/notifications/email/`
- `apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx`
- `docs/decisions/ADR-0015-production-retires-sink-email-providers.md`

OPTIONAL:
- `services/api/src/modules/notifications/email/platform-email-settings.shared.ts`

DO_NOT_LOAD:
- template copy — WP-04
- customization and employee record source

LAST_VERIFIED_SHA: 11e987a6 — re-read any summarised source that changed since.

## Relevant Files

- `services/api/src/modules/notifications/email/email-provider-factory.service.ts`
- `apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.ts`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Production has a working platform relay | VERIFIED | Production read-only check on 2026-09-13: relay enabled as live SMTP |
| A-02 | Sink providers are offered only outside production | VERIFIED | The local development stack still offers Console in Add provider; the allowed types come from the server |

## Implementation State

Done on `agent/walkthrough2-providers-logs` at `11e987a6`; merged at
`f09ddce2`.

## Validation State

Unit tests pass. Local browser QA passed.

## Evidence

- The providers page on a Console-only tenant says email is not delivered and why.
- Add provider opens a dialog with typed SMTP settings; SMTP is the default type.
- Delivery Logs render with a channel switch and an empty state.
- Production read-only check: all 3 production tenants are sink-only, so they send real mail through the relay after release.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: MODULE, SECURITY, DECISION — ADR-0015.
OBSIDIAN_IMPACT: UPDATE_NODE.

Release note: real email starts for all three production tenants on release.
