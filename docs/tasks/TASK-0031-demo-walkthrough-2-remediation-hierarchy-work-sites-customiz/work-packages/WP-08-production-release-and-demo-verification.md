---
WP_ID: WP-08
TASK_ID: TASK-0031
TITLE: Production release and demo-tenant verification
STATUS: NOT_STARTED
OWNER_AGENT: Release/DevOps
DEPENDENCIES: [WP-07]
LAST_VERIFIED_SHA: 58e4c32a
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

LAST_VERIFIED_SHA: 58e4c32a — not started; re-read everything at the release SHA.

## Relevant Files

- No repository files — this package produces release evidence.

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The owner authorised a production release for this program | USER_CONFIRMED | Owner decision on 2026-09-13 |

## Implementation State

Not started; waits on WP-07.

## Validation State

Not started.

## Evidence

Not started.

## Questions

None open.

## Handoff

Verify on the demo tenant: customization for the owner without the extra role,
the custom module, the notifications pages, and one real test email arriving.
Then remove the System Customizer role and re-verify.
