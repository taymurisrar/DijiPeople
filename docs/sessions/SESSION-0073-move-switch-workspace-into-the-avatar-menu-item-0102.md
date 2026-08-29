---
SESSION_ID: SESSION-0073
aliases: [SESSION-0073]
TASK_ID:
TITLE: Move Switch workspace into the avatar menu (ITEM-0102)
ARCHITECT_INTENT: Move Switch workspace into the avatar menu (ITEM-0102)
STATUS: COMPLETE
TASK_TYPE: UI
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: a86362cfa1b2fe7384dcdf283745554e2759f7f1
TASK_BRANCH: agent/workspace-switcher-avatar-menu
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/wt-workspace-menu
AFFECTED_MODULES: [views]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-29T10:55:55.248Z
LAST_HEARTBEAT: 2026-08-29T10:55:55.248Z
BLOCKERS: none
---

# SESSION-0073 — Move Switch workspace into the avatar menu (ITEM-0102)

## Intent

Move Switch workspace into the avatar menu (ITEM-0102)

## Scope

`apps/web` only, and within it the authenticated shell:

- `app/components/workspace-switcher.tsx` — rewritten from a `<details>`
  disclosure into a labelled menu section that draws its own separator
- `app/(authenticated)/layout.tsx` — the standalone row removed; the switcher
  resolved into a `<Suspense fallback={null}>` slot
- `app/(authenticated)/_components/dashboard-topbar.tsx` — a pass-through prop
- `app/(authenticated)/_components/user-menu-dropdown.tsx` — renders the slot
- `app/components/workspace-switcher-placement.spec.ts` — new

Nothing under `services/api`, no schema, no migration, no permission key, no
settings key, no environment variable.

Records: `ITEM-0102` closed; `BUG-2148`, `BUG-2149`, `ITEM-0114` and
`QA-TENANT-054` created; `docs/knowledge/modules/tenant-application.md` updated
in place.

## Concurrency

**No write leases taken, and none needed.** `session.mjs check --paths` returned
`SAFE_PARALLEL` against four other live sessions at planning time, and the scope
above never widened into a leased resource: no schema, no migration, no runtime
registry, no seed. `SESSION-0072` held `runtime-registries` throughout and this
session never touched it.

`SESSION-0071` (`agent/web-shell-accessibility`) is the near miss worth
recording — it works on the same shell, and its `BUG-1673` had already landed on
`develop` before this started, which is what made `ITEM-0102`'s deferral
expire. The two never collided in a file.

**What did collide was `develop` itself.** It moved twice while this branch sat
in CI, forcing two rebases. Every conflict in both was a generated index, and
every one was resolved by taking `origin`'s side and re-running the generator —
see the Conflicts section of the engineering history record.

Queued on the develop merge queue before the first integration attempt; released
by `session.mjs finish`. Live state: `node scripts/session.mjs list`.

## History

- 2026-08-29 — session started from `origin/develop` at `a86362c`.
