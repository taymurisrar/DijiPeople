---
SESSION_ID: SESSION-0103
aliases: [SESSION-0103]
TASK_ID: TASK-0030
TITLE: Implement the 34 open records from sessions 0099-0102
ARCHITECT_INTENT: Implement the 34 open records from sessions 0099-0102
STATUS: ACTIVE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: b7bd1ca7d469fddc25222a06be0992d2a834927e
TASK_BRANCH: agent/records-0099-0102
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dp-records-impl
AFFECTED_MODULES: [apps/web, apps/admin, auth, billing, notifications, customization, employees]
WRITE_LEASES: [permissions, runtime-registries, record-indexes]
ACTIVE_WORK_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-09-12T12:38:09.669Z
LAST_HEARTBEAT: 2026-09-12T12:38:09.669Z
BLOCKERS: none
---

# SESSION-0103 — Implement the 34 open records from sessions 0099-0102

## Intent

The four sessions before this one were review sessions. [[SESSION-0099]] read the
tenant subscription screens, [[SESSION-0100]] investigated a session that ended
without explanation, [[SESSION-0101]] walked eight points of a demo with the
product owner, and [[SESSION-0102]] swept up what that walkthrough had left
unfiled. Between them they produced 36 durable records and changed no product
code at all.

This session is the other half. It implements them.

## Scope

Thirty-four records, carried by [[TASK-0030]] across eight work packages. Two
were deliberately deferred by Architect triage — [[ITEM-0160]] and [[ITEM-0161]]
— and this session leaves that decision standing rather than quietly reversing
it.

Ten of the thirty-four are triaged `PLAN_REQUIRED`. The owner chose to have them
implemented rather than only planned, so each carries an ExecPlan written before
its code, in the same stream.

Four decisions were genuinely the owner's rather than the framework's, and were
taken before planning rather than discovered during it:

- **[[BUG-3333]]** — no price is touched. The PKR schedule implies roughly 136
  PKR per USD, about half the market rate, and what it *should* be stays a
  commercial question. Only the engineering half lands: currency scoped to the
  tenant's market, and a foreign-market price refused on the server.
- **[[BUG-3350]]** — entitlement enforcement goes on. The owner was told before
  answering that this removes Payroll and Recruitment from a Starter tenant, and
  confirmed. It ships as a reversible platform setting with a grandfathering
  script and an ADR, and it lands on `develop` only.
- **[[BUG-3355]]** — concurrent sessions become the default. An absent security
  setting has until now meant "one session only", which is why a second sign-in
  silently destroyed the first with **Remember me** checked.
- Scope — the plan-required work is implemented, not merely planned.

## Concurrency

Leases held: `permissions` (new keys for the delivery-log retry and the
entitlement path), `runtime-registries` (the lookup control and the record
shells), `record-indexes` (34 records change status in one task).

`SCHEMA_WRITE: NO` is a constraint on this session, not only a description. The
database is single-writer across every session, and two records — [[BUG-3359]]'s
rotation grace window and [[ITEM-0169]]'s catalog key migration — have routes
that approach schema and routes that avoid it. Every stream was told to take the
route that avoids it, and to report loudly rather than migrate quietly.

No overlap with another active session: `session.mjs check` classified the work
`SAFE_PARALLEL`, and no other session was running when this one started. Three
other worktrees are dirty with earlier sessions' unmerged work and are not this
session's to touch.

Live state: `node scripts/session.mjs list`.

## History

- 2026-09-12 — session started from `origin/develop` at `b7bd1ca`.
- 2026-09-12 — four owner decisions taken, recorded on [[TASK-0030]].
- 2026-09-12 — decomposed into eight work packages; six started in parallel, each
  in its own worktree.

## Related

[[TASK-0030]] · [[SESSION-0099]] · [[SESSION-0100]] · [[SESSION-0101]] ·
[[SESSION-0102]]
