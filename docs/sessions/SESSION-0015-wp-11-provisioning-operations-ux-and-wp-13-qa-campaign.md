---
SESSION_ID: SESSION-0015
aliases: [SESSION-0015]
TASK_ID: TASK-0007
TITLE: WP-11 provisioning operations UX and WP-13 QA campaign
ARCHITECT_INTENT: WP-11 provisioning operations UX and WP-13 QA campaign
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: aa335249839fa1c44449b5b620ab2e3c5936e37a
TASK_BRANCH: agent/provisioning-ops-and-qa
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-bugs
AFFECTED_MODULES: [tenant-control-plane, platform-auth, super-admin, platform-communications, admin, e2e]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-18T19:44:00.375Z
LAST_HEARTBEAT: 2026-08-19T22:40:00.000Z
BLOCKERS: none
---

# SESSION-0015 — WP-11 provisioning operations UX and WP-13 QA campaign

## Intent

Complete TASK-0007 WP-11 (admin provisioning operations UX) and WP-13
(consolidated QA, regression, security, accessibility and visual campaign), end
to end.

## Scope

**WP-11** — the provisioning queue. Provisioning runs and their steps had been
recorded for a long time and nothing read them across tenants. An operator could
open one workspace and see its history, but there was no answer to the only
question that matters when somebody has paid and cannot use the product: *is
anybody stuck right now.* Six operator-facing states derived from recorded runs,
an endpoint, and a screen.

**WP-13** — the campaign across unit, API, database, invariant, security,
browser, accessibility, layout and SEO. Four defects found and fixed.

## Concurrency

Held the `permissions` lease while changing
`services/api/src/modules/platform-auth/platform-permissions.ts`, which is a
`SINGLE_WRITER_FILES` path.

SESSION-0016 and SESSION-0017 landed ten commits on `develop` during this
session — the repository-health primary-worktree work, the Obsidian sync
rewrite, and 761 lines of new framework validators. Merged in at `b016441`.

That concurrency produced one real collision worth recording: **REG ids have no
allocator.** Every other durable id comes from `scripts/allocate-id.mjs`, which
scans every branch and reserves before the record exists; regressions are
sections in one hand-maintained register, so two sessions both reached for
REG-065. Theirs was already integrated, so this branch renumbered to 066–068
before merging rather than during it.

SESSION-0018 started later on self-service onboarding and provisioning, which
overlaps this session's module. It began after this work was complete, so no
lease conflict arose, but the overlap is noted for whoever sequences next.

## Outcome

| Package | Result |
|---|---|
| WP-11 | DONE — service, endpoint, screen; 9 unit + 9 DB-backed + 5 browser tests |
| WP-13 | DONE — 4 defects found and fixed; performance NOT RUN, no harness exists |
| WP-14 | Merged `develop` in, CI verified at the exact SHA |

Defects found and fixed:

- **BUG-0071** (CRITICAL) — a tenant user holding the ordinary `system-admin`
  tenant role reached every platform `super-admin` endpoint, including the
  cross-tenant tenant, customer, invoice and payment lists and the platform
  staff directory. The same guard was inverted for unmapped routes, so genuine
  platform operators got 403 from three routes.
- **BUG-0072** (HIGH) — every method on `/plans*` resolved `plans.read`, so
  `READ_ONLY_AUDITOR` could create, update and delete the commercial catalog.
- **BUG-0073**, **BUG-0074** (MEDIUM) — the first accessibility audit this
  repository has ever had: contrast failing on every admin screen through the
  shared shell, and a scroll region reachable only by pointer.

## What this session got wrong, and how it was caught

Recorded because the framework's value is in the catching, not in the tidy
report:

- **Framework validation failed twice on the same mistake** — records edited
  without regenerating what derives from them. Both times the gate caught it.
  Promoted to durable guidance rather than remembered.
- **Flow D's browser assertions were reading data the suite had not written.**
  Four orphaned `nest start --watch` processes kept reclaiming port 4000 against
  the wrong database, so fixtures went to one database while the API served
  another, and the tests passed against rows seeded by hand hours earlier. Found
  by probing rather than by assuming, and reported as a correction to a
  previously-claimed "verified" result.
- **A hand-written keyboard test passed on a screen that was keyboard-unusable.**
  It asserted header `scope` and a caption; axe asserted what the rule set knows
  to look for. Both are kept.

## History

- 2026-08-18 — session started from `origin/develop` at `aa33524`.
- 2026-08-18 — WP-11 built and verified; BUG-0071 and BUG-0072 found, fixed and
  live-verified.
- 2026-08-19 — accessibility, SEO and layout coverage added; BUG-0073 and
  BUG-0074 found and fixed; WP-13 closed.
- 2026-08-19 — REG ids renumbered after the collision on `develop`; `develop`
  merged in at `b016441`; session complete.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Engineering history for `agent/provisioning-ops-and-qa`:

[[2026-08-19-provisioning-operations-and-qa-campaign-b016441]]

Records this session worked on, cited in its own body:

[[BUG-0071]] · [[BUG-0072]] · [[BUG-0073]] · [[BUG-0074]] · [[SESSION-0016]] · [[SESSION-0017]] · [[SESSION-0018]]

Modules this record declares as affected:

[[platform-admin]] · [[platform-auth]] · [[platform-communications]] · [[qa-and-ci-architecture]] · [[super-admin]] · [[tenant-control-plane]]

<!-- GRAPH:END -->
