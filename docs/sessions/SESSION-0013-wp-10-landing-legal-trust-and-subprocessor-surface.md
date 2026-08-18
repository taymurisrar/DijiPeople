---
SESSION_ID: SESSION-0013
aliases: [SESSION-0013]
TASK_ID: TASK-0007
TITLE: WP-10 landing legal, trust and subprocessor surface
ARCHITECT_INTENT: WP-10 landing legal, trust and subprocessor surface
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 884bf9683ec27ef3bc9200f057fe266e5dae84c5
TASK_BRANCH: agent/landing-legal-surface
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople
AFFECTED_MODULES: [legal, landing]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: DONE
STARTED_AT: 2026-08-18T18:22:58.471Z
LAST_HEARTBEAT: 2026-08-18T18:22:58.471Z
BLOCKERS: none
---

# SESSION-0013 — WP-10 landing legal, trust and subprocessor surface

## Intent

WP-10 landing legal, trust and subprocessor surface

## Scope

WP-10: ten legal routes, ten drafted documents, four subprocessors, and a footer
that links only what is published. Integrated at f2957ae.

Everything is seeded as a DRAFT per the owner decision, so nothing unreviewed is
served. Two content rules are asserted by test rather than trusted to review: no
fabricated legal entity, and no invented certification.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-18 — session started from `origin/develop` at `884bf96`.
