---
SESSION_ID: SESSION-0030
aliases: [SESSION-0030]
TASK_ID:
TITLE: Platform Admin record header status group and default command bar
ARCHITECT_INTENT: Platform Admin record header status group and default command bar
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 08b8661a17e4b7cf99789bab7474f89e3efe60b9
TASK_BRANCH: agent/admin-record-status-header
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-record-header
AFFECTED_MODULES: [platform-runtime, super-admin, admin-runtime]
WRITE_LEASES: [runtime-registries]
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-21T13:54:09.827Z
LAST_HEARTBEAT: 2026-08-21T13:54:09.827Z
BLOCKERS: none
---

# SESSION-0030 — Platform Admin record header status group and default command bar

## Intent

Platform Admin record header status group and default command bar

## Scope

Platform Admin (`apps/admin`) record pages, and the one `platform-runtime`
validation switch that made the plans page savable.

1. **Plans detail page.** Explicit record form, publication read-only and
   explained, entitlements editor, commercial summary derived from `PlanPrice`
   rows, and the Subscriptions and Customers panels that had never rendered.
2. **Default record command bar.** Built by `define()` from a `capabilities`
   map that restates the runtime API's `create` / `update` / `remove` switch
   statements, merged over each module's own actions and sorted into one fixed
   order. Reaches the five bespoke detail pages too.
3. **Record header status group.** Owner, Status and Sub-status drawn together
   at the top right of every record, editable only where the API exposes a
   governed route for that slot.

Deliberately out of scope: governed publish and archive actions for commercial
configuration ([[ITEM-0022]]), and making `Plan.isPublic` writable
([[BUG-0223]]). Both would add an ungoverned way to change what customers can
buy.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-21 — session started from `origin/develop` at `08b8661`.
- 2026-08-21 — integrated into `develop` at `acb14a2` by ref-push, `CI required
  gate` green on the exact SHA (run 32495674259). BUG-0220/0221/0222 fixed and
  closed, BUG-0223 raised for an owner decision, REG-174/175/176 registered.
  Full account in
  [[2026-08-21-admin-record-status-header-08b8661|the engineering history]].
