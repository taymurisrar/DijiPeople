---
SESSION_ID: SESSION-0022
aliases: [SESSION-0022]
TASK_ID: TASK-0010
TITLE: Go-live readiness
ARCHITECT_INTENT: Go-live readiness
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 95551bcf29c9d1b807a8fecac86c39b273f651bd
TASK_BRANCH: agent/go-live-readiness
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople-selfservice
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-20T11:10:18.564Z
LAST_HEARTBEAT: 2026-08-20T11:10:18.564Z
BLOCKERS: none
---

# SESSION-0022 — Go-live readiness

## Intent

Go-live readiness

## Scope

[[TASK-0010]]. Clearing what stands between `develop` and a production release,
so `main` is updated deliberately rather than hopefully.

Four owner decisions were taken **before** any work, because each changed what
would be built: real prices rather than placeholders, publication wired into the
release command, [[ITEM-0069]] fixed before release rather than after, and
[[BUG-0052]] accepted with the risk recorded.

All four are now resolved. Three were code and are done; the price list arrived
mid-session and became WP-08, the largest package of the four.

What the session did **not** anticipate is most of what it found: the release
command had never been run against a virgin database and did not work; a
security record's reachability claim was wrong; and three bug records claimed a
verification nobody had performed. Each was found by executing something rather
than reading about it.

## Concurrency

`schema` lease taken for the discovery-throttle columns and released when the
migration was verified. `session.mjs check` returned `SAFE_PARALLEL` against the
other active sessions; none touches `auth`, `users` or `legal`.

Database work used throwaway databases only. The populated `dijipeople`
development database was not touched at all by this session.

## History

- 2026-08-20 — session started from `origin/develop` at `95551bc`, immediately
  after TASK-0009 integrated.
- 2026-08-20 — WP-01: [[ITEM-0069]] closed. Discovery gets its own throttle, so
  the public endpoint bounds guessing without being usable as a lockout weapon
  against a known address.
- 2026-08-20 — WP-02: `release:api` publishes the legal set, so a purchase
  finally records consent. Two more assertions inverted rather than deleted —
  the third time in this programme that a guard outlived its premise.
- 2026-08-20 — WP-05: [[BUG-0052]]'s `xlsx` reachability finding was wrong. The
  advisories were reachable from two authenticated uploads, not export-only.
  Parse moved to ExcelJS; no `XLSX.read` call site remains anywhere.
- 2026-08-20 — WP-06: the real `preDeployCommand` was run against a database
  built from every migration, for the first time. It aborted. [[BUG-0085]] would
  have failed the first production deploy and taken WP-02's legal publication
  with it; the fix an operator would reach for first reset the super admin's
  password on every deploy.
- 2026-08-20 — WP-07: [[ITEM-0071]] built, and on its first run it found three
  records claiming `VERIFIED` above prose saying otherwise — one of them a
  CRITICAL. **This session had caused the need for it**: reading BUG-0080's stale
  Resolution, I reversed a correct status, changed working billing code, and put
  a settled product decision back to the owner. All reverted.
- 2026-08-20 — WP-03 unblocked: the owner supplied a complete price schedule and
  changed the model to per-seat public with flat by arrangement.
- 2026-08-20 — WP-08: both models now coexist per plan and the channel decides.
  Building it found a millisecond race that could have removed a plan from public
  sale, a minimum seat commitment implemented as a refusal rather than a charge,
  and a landing estimate that disagreed with the server by the size of that
  minimum.
- 2026-08-20 — WP-04: readiness re-derived twice as its blocker narrowed. The
  platform is `READY_WITH_RISKS`; the commercial surface waits on a Stripe sync
  and on PKR/QAR presentment being confirmed against the live account. `main`
  untouched by the owner's decision.
- 2026-08-24 — closed by SESSION-0047. Seven of eight packages had
  integrated; WP-04 was `BLOCKED` on two owner actions. One of them — the merge
  hold on `main` — was released and discharged by the release tasks that
  followed, so [[TASK-0010]] is now `COMPLETE`. The other, confirming Stripe
  presents PKR and QAR, is **not** closed: it is tracked as [[BUG-0903]], stays
  `OPEN` under `BLOCKED_EXTERNAL`, and needs the live Stripe account.
