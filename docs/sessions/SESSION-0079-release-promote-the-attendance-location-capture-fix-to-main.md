---
SESSION_ID: SESSION-0079
aliases: [SESSION-0079]
TASK_ID:
TITLE: Release: promote the attendance location-capture fix to main
ARCHITECT_INTENT: Release: promote the attendance location-capture fix to main
STATUS: COMPLETE
TASK_TYPE: RELEASE
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: 51ca3045761f3f5982cb125e501b4c3a7705e400
TASK_BRANCH: agent/attendance-location-capture
TARGET_BRANCH: main
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-attendance-loc
AFFECTED_MODULES: [packages/config, apps/web, apps/admin, services/api/src/common/errors]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-30T11:37:27.533Z
LAST_HEARTBEAT: 2026-08-30T11:37:27.533Z
BLOCKERS: none
---

# SESSION-0079 — Release: promote the attendance location-capture fix to main

## Intent

The owner asked for the attendance work to be released to `main`. This session
wrote **no code** — its output is a merge to the production branch, a verified
rollout, and the records describing both.

## Scope

| | |
|---|---|
| Released tree | `51ca3045` — 5 commits, 9 code files |
| Merge commit | `ec1d58da` — PR #59, 11:51 UTC |
| Production before | `855b5941` (API), `geolocation=()` on all three apps |
| Production after | `ec1d58da` — web live ~11:53 UTC, API deploy followed |
| Migrations applied | **None.** `Database migration gate` green; no migration in the delta. |

Three fixes reached production:

- **BUG-2331** (HIGH) — `Permissions-Policy: geolocation=()` denied geolocation
  to the page's own origin, so Chrome refused `getCurrentPosition` above the
  permission layer and never prompted. Web attendance check-in was impossible
  for every employee of every tenant.
- **BUG-2332** (HIGH) — attendance reason codes were absent from the error
  catalog, so every refusal was rewritten to `VALIDATION_FAILED` and raised the
  platform's technical error dialog for an ordinary policy outcome.
- **BUG-2333** (MEDIUM) — the attendance adapter ignored the `storeUserAgent`
  tenant privacy setting.

`SCHEMA_WRITE: NO` is accurate in both senses here: this session authored no
migration **and** applied none — unlike SESSION-0074, which deployed two. The
delta was checked for migrations before merging rather than assumed.

Left open and dispositioned, not shipped as fixed: **BUG-2334** (FIX_NOW — the
adapter discards location failure reason codes) and **BUG-2335**
(PRODUCT_DECISION — the IP fallback setting whose provider is a stub).

## Verification

The release was verified **functionally**, not only by commit hash, because the
defect was a response header and a hash tells you nothing about one:

- `geolocation=(self)` now served by the tenant app and admin.
- `geolocation=()` **still** served by landing — the narrow default held, which
  is the half of the change most likely to regress unnoticed.
- On the unmodified production attendance page, with every intervention removed
  and permissions cleared: `allowsFeature('geolocation')` is `true` and the
  first-visit permission state is `prompt`, where before the release it was
  `false`/`denied`. `prompt` is the browser saying it will ask.

## Concurrency

No write leases — a release takes none; it deploys what other sessions already
merged. `develop` was re-read immediately before the merge and had not moved
from `51ca3045`, so the PR still described exactly what shipped. That check
exists because SESSION-0074 saw `develop` move three times under an open release
PR.

After the merge, `develop` was fast-forwarded to `ec1d58da` rather than given a
merge commit: `develop` was an ancestor of the merge commit, so the two branches
are now identical and cannot drift.

## History

- 2026-08-30 — session started from `origin/develop` at `51ca304`.
- 2026-08-30 — PR #59 opened; waited for the `pull_request` CI run rather than
  merging on the earlier `push` run's verdict, though both were green on the
  same SHA.
- 2026-08-30 — merged as `ec1d58da`; Vercel and Render auto-deployed; the header
  fix confirmed live on production before this record was written.
