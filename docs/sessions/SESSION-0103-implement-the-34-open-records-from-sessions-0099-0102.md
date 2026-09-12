---
SESSION_ID: SESSION-0103
aliases: [SESSION-0103]
TASK_ID: TASK-0030
TITLE: Implement the 34 open records from sessions 0099-0102
ARCHITECT_INTENT: Implement the 34 open records from sessions 0099-0102
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: b7bd1ca7d469fddc25222a06be0992d2a834927e
TASK_BRANCH: agent/records-0099-0102
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dp-records-impl
AFFECTED_MODULES: [apps/web, apps/admin, auth, billing, notifications, customization, employees]
WRITE_LEASES: [permissions, runtime-registries, record-indexes]
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
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
  script and an ADR.
- **[[BUG-3355]]** — concurrent sessions become the default. An absent security
  setting has until now meant "one session only", which is why a second sign-in
  silently destroyed the first with **Remember me** checked.
- Scope — the plan-required work is implemented, not merely planned.

Two further decisions were taken after the work began, and both changed what
this session is.

**The owner asked for the result to reach `main`.** This session does not take
it there. It integrates to `develop` and ends with `MAIN_CHANGE_STATUS =
UNTOUCHED`, exactly like any other feature task, and a separate RELEASE session
promotes `develop` to `main`.

That split is not bureaucracy. `rebuild-sessions.mjs --check` refuses a FEATURE
session that names `main` as its target, and it is right to: the branch model
exists so that a production deployment is always something a release task did
deliberately, never something a feature task did on its way past. Reclassifying
this session would have satisfied the instruction and defeated the check. The
owner also chose to run the grandfathering script against production before that
deploy, so no tenant loses access it has today, and to have the deploy verified
and triggered if it does not fire — both belong to the release session.

**Deploying does not turn entitlement enforcement on**, and an earlier version
of this section implied it would. The shipped default remains `REPORT_ONLY` and
the setting is deliberately absent from `seed-config`, because `seed:config`
runs on every release and a new field in the shipped defaults becomes live in
every environment that never set it — a cutover as a deploy side effect is
exactly what [[ADR-0009]] forbids. Turning it on is a separate, deliberate act
against one environment, reversible inside a minute because the mode is re-read
on a short TTL rather than at boot.

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
- 2026-09-12 — the account session limit killed all five running streams at once.
  Two had 90 files uncommitted between them; both worktrees were committed by the
  Architect before anything else, and every stream resumed from its own
  transcript rather than starting again.
- 2026-09-12 — all eight work packages merged. The integrated branch failed one
  invariant spec that no individual stream had failed: the employee work reached
  into the shared runtime widget renderer. Sent back and fixed rather than
  waived.
- 2026-09-12 — owner asked for the result to reach `main`. Handled as a separate
  RELEASE session rather than by retargeting this one.
- 2026-09-12 — integrated branch failed CI on the API lint ratchet: 795 against
  a ceiling of 789, a genuine +13. Every one came from a Jest matcher typed
  `any` assigned into a typed object. Retyped rather than the ceiling raised,
  and the ceiling lowered to 787 in the same change, as its own policy asks.
- 2026-09-12 — `CI required gate` PASS on `413565f0`. Integrated into `develop`
  by ref-push, so the tip is byte-identical to the verified commit.
- 2026-09-12 — the promotion to `main` was carried out as [[SESSION-0104]].
  That session was registered after the promotion rather than before it; its
  own record says so and why.
- 2026-09-12 — session closed COMPLETE. `MAIN_CHANGE_STATUS` for this session is
  `UNTOUCHED`; the production change belongs to SESSION-0104.

## Related

[[TASK-0030]] · [[SESSION-0099]] · [[SESSION-0100]] · [[SESSION-0101]] ·
[[SESSION-0102]] · [[SESSION-0104]]

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Engineering history for `agent/records-0099-0102`:

[[2026-09-12-records-0099-0102-f36ec9a9]]

Records this session worked on, cited in its own body:

[[BUG-3333]] · [[BUG-3350]] · [[BUG-3355]] · [[BUG-3359]] · [[ITEM-0160]] · [[ITEM-0161]] · [[ITEM-0169]] · [[SESSION-0099]] · [[SESSION-0100]] · [[SESSION-0101]] · [[SESSION-0102]] · [[SESSION-0104]]

Modules this record declares as affected:

[[auth]] · [[billing]] · [[employees]] · [[notifications]] · [[platform-admin]] · [[tenant-application]]

<!-- GRAPH:END -->
