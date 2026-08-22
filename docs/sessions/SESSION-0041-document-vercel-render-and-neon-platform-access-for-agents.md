---
SESSION_ID: SESSION-0041
aliases: [SESSION-0041]
TASK_ID:
TITLE: Document Vercel, Render and Neon platform access for agents
ARCHITECT_INTENT: Document Vercel, Render and Neon platform access for agents
STATUS: COMPLETE
TASK_TYPE: DOC
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: e9819a3fcd8917cb15e14daacd56a9a31d070bb7
TASK_BRANCH: agent/platform-access-docs
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-22T13:30:26.204Z
LAST_HEARTBEAT: 2026-08-22T13:30:26.204Z
BLOCKERS: none
---

# SESSION-0041 — Document Vercel, Render and Neon platform access for agents

## Intent

Document Vercel, Render and Neon platform access for agents

## Scope

Documentation only; no runtime behaviour changed.

- **Added** `docs/deployment/platform-access.md` — the three control planes
  (Vercel frontends, Render API, Neon database), the credential variables and
  how to load them, provider ids, the read-only working agreement, and
  verification recipes. Every value read from the live provider APIs.
- **Changed** `docs/deployment/README.md` — indexed the new document.

Recorded but **not fixed**, because both are environment-variable writes on a
production service and need the user's explicit approval: the live Render
service sets `DIRECT_URL`, which nothing in the codebase reads, and does not set
`DIRECT_DATABASE_URL`, which `prisma.config.ts` and `packages/config` do read.
Migrations survive only by falling back to `DATABASE_URL`, which is currently
the direct endpoint. Since `docs/environment-variables.md` recommends the
*pooled* endpoint for `DATABASE_URL`, following that guidance would reproduce
BUG-0086 exactly.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-22 — session started from `origin/develop` at `e9819a3`.
- 2026-08-22 — `a92d27b` committed and pushed; `CI required gate` **success** on
  that exact SHA, all fourteen jobs green (run `32578774552`).
- 2026-08-22 — integrated by ref-push, `e9819a3..a92d27b` fast-forward, so
  `develop`'s tip is the SHA CI verified. `main` untouched at `3602ec3`.
