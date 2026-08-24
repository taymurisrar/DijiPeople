---
SESSION_ID: SESSION-0048
aliases: [SESSION-0048]
TASK_ID:
TITLE: Release: bring main up to develop after the session close-out
ARCHITECT_INTENT: Release: bring main up to develop after the session close-out
STATUS: COMPLETE
TASK_TYPE: RELEASE
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: 0a5586f7902c5775dc0419ea0d672ff09c910d1c
TASK_BRANCH: agent/session-registry-closeout
TARGET_BRANCH: main
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-session-closeout
AFFECTED_MODULES: [apps/web, pkg:config, docs]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-24T16:44:39.394Z
LAST_HEARTBEAT: 2026-08-24T16:44:39.394Z
BLOCKERS: none
---

# SESSION-0048 — Release: bring main up to develop after the session close-out

## Intent

Release: bring main up to develop after the session close-out

## Scope

Bring `main` up to `develop` after SESSION-0047 closed every stale session.

A clean fast-forward of five commits — `origin/main` was already an ancestor of
`origin/develop`, so there is nothing to reconcile and no merge commit to reason
about. Four of the five commits are documentation and records.

Registered as a separate `RELEASE` session rather than folded into SESSION-0047.
That session was `FRAMEWORK`, targeting `develop`, and
[`branch-model.md`](../../.agent/context/branch-model.md) is explicit that only a
`RELEASE`, `DEPLOY` or `HOTFIX_PRODUCTION` task may target `main` — and that the
Architect may not reclassify a normal task into one because integration would be
simpler. The user authorised the promotion; that authorises the *release*, not a
shortcut around how releases are recorded.

### What actually reaches production

One behaviour change, and it is deliberately a no-op on the current deployment.
`apps/web` stops trusting `X-Forwarded-Host` unconditionally (ITEM-0044). Vercel
sets `VERCEL=1`, which the shared rule reads as one trusted hop, so the forwarded
host still wins there. What ships is the removal of the *dependence* on that
being true.

The API half is a pure refactor: two duplicated copies of the trust rule now
delegate to `packages/config/forwarded-host.js`, and the existing specs pass
unchanged.

`ROLLBACK_CLASS: CODE_ONLY`. No migration, no schema change, no new required
environment variable.

### What this release does not fix

The five `BLOCKED_EXTERNAL` production records stay open — BUG-0898, BUG-0903,
BUG-0904, BUG-0905, BUG-0989. The commercial surface is not sellable after this
merge, and nothing here moves it: those need Stripe account and Render dashboard
changes. Shipping code past them would look like progress on the wrong axis.

## Concurrency

`SAFE_PARALLEL`. SESSION-0047 finished before this one registered; no other
session was live and no write lease was held.

## History

- 2026-08-24 — session started from `origin/develop` at `0a5586f`.
- 2026-08-24 — PR #45 merged to `main` as `6ed7a440`. CI run `32752656236` green
  on `0a5586f7`, the exact SHA merged; a second green run `32752548986` existed
  on the same SHA from `develop`. `mergeStateStatus: CLEAN`.
- 2026-08-24 — **deployed and verified, not assumed.** Render deploy of
  `6ed7a44` went `build_in_progress` → `pre_deploy_in_progress` →
  `update_in_progress` → `live`; the pre-deploy step is where migrations and
  seeds run, so reaching `live` means it completed rather than being skipped.
  `https://api.dijipeople.com/api/health` then reported `commitShort: 6ed7a44`,
  and all three Vercel apps (`web`, `admin`, `landing`) deployed the same SHA.

  Both signals were watched because neither alone is proof. A merge landing is
  not a deploy — this repository has seen `main` move and production serve the
  old build for 48 minutes with no error anywhere. The health hash lagged the
  Render status by about a minute here, which is the instance swap, not a
  failure.
- 2026-08-24 — `smoke:deployment` against production: health, served-commit,
  unauthenticated rejection on a protected route, CORS, a purchasable plan in a
  launched market, and published legal documents all pass. Authenticated checks
  skipped — they need `SMOKE_LOGIN_EMAIL`/`SMOKE_LOGIN_PASSWORD`, which this
  session does not hold.
- 2026-08-24 — `main` trails `develop` by this record's own closure commit,
  deliberately. It is documentation only, and a production redeploy to carry a
  session record would be cost without benefit. It rides along with the next
  release. `main` contains every line of code `develop` has.
