---
SESSION_ID: SESSION-0045
aliases: [SESSION-0045]
TASK_ID:
TITLE: Release develop to main: landing E2E findings and the three checkout fixes
ARCHITECT_INTENT: Release develop to main: landing E2E findings and the three checkout fixes
STATUS: COMPLETE
TASK_TYPE: RELEASE
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 3960dde555f23f2a71a8ab32b75eba1079663a3f
TASK_BRANCH: agent/release-landing-e2e
TARGET_BRANCH: main
WORKTREE: D:/My Work/hrm-dijipeople/wt-landing-e2e
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-23T10:56:15.359Z
LAST_HEARTBEAT: 2026-08-23T10:56:15.359Z
BLOCKERS: none
---

# SESSION-0045 — Release develop to main: landing E2E findings and the three checkout fixes

## Intent

Release develop to main: landing E2E findings and the three checkout fixes

## Scope

Promote `develop` `3960dde5` to `main` — the three self-service checkout fixes
(BUG-0900, BUG-0901, BUG-0902), the landing soft-404 fix (BUG-0907), and the
browser suites the public site never had. No code was written in this session;
it is an integration.

## Outcome

**Merged.** PR [#41](https://github.com/taymurisrar/DijiPeople/pull/41) merged as
`be486ae1` at 2026-08-23T11:11:59Z. `CI required gate` PASS on the exact SHA —
full run [32634163128](https://github.com/taymurisrar/DijiPeople/actions/runs/32634163128),
15 of 15 jobs, browser e2e green on the PR itself.

**Deployed: partially, as expected.**

| Target | Result |
|---|---|
| `www.dijipeople.com` (landing) | **READY** at `be486ae1` |
| `app.dijipeople.com` (web) | **READY** at `be486ae1` |
| `admin.dijipeople.com` (admin) | **READY** at `be486ae1` |
| `api.dijipeople.com` (API) | **`pre_deploy_failed`** — still serving `ef57b2a` |

The API failure is [[BUG-0899]] and was predicted before the merge: Render's
`preDeployCommand` runs `npm run release`, whose last step `legal:publish
--confirm` exits 2 because `seed-legal` writes ten documents that declare
themselves drafts. A failed pre-deploy is non-destructive — Render aborts and the
previous instance keeps serving, which is exactly what happened. Confirmed in the
deploy log at 11:17:33 and by `/api/health` still reporting `ef57b2a`.

Worth recording because it contradicts an earlier reading: **`landing` and
`admin` had not deployed since `35f263c6` (2026-08-22 19:59)**, missing two
`main` merges with no deployment record at all, while `web` deployed both from
identical project settings. This release triggered all three normally, so the
gap was transient rather than a configuration fault. It is still unexplained,
and worth watching on the next release.

## Verification

The browser suite was run against production after the frontends went live:

```
E2E_LANDING_URL=https://www.dijipeople.com npx playwright test   landing-public-surface landing-public-forms
→ 53 passed, 3 skipped, 0 failed
```

The three skips are the positive form cases, which write and are gated off for a
production target unless `E2E_ALLOW_PROD_WRITES=yes` is set deliberately.

Spot-verified on the live site: `/subscribe` now serves the current copy, and
`/legal/not-a-document` returns **404** rather than the 200 soft-404 it served
before ([[BUG-0907]] confirmed fixed in production).

## What this release does NOT fix

The API fixes are on `main` and **not running**. Until [[BUG-0899]] is resolved
they cannot reach production, so [[BUG-0900]], [[BUG-0901]] and [[BUG-0902]]
remain live defects in the deployed API — currently unreachable only because
[[BUG-0898]] means no purchase can start at all.

Go-live still requires, in this order: real legal copy → `STRIPE_MODE=live` →
sync the plan prices → `OUTBOX_WORKER_ENABLED=true`. Sequence matters;
`stripeEnvironment` is baked into each price at sync time.

## Concurrency

No write leases taken — an integration touching no shared resource. `main` was
changed deliberately and by permission: `MAIN_CHANGE_STATUS = CHANGED` is correct
for a RELEASE and would be a failed task for anything else.

## History

- 2026-08-23 — session started from `origin/develop` at `3960dde`.
- 2026-08-23 — PR #41 opened, gate green on the exact SHA, merged as `be486ae1`.
- 2026-08-23 — frontends deployed; API pre-deploy failed on BUG-0899 as predicted.
- 2026-08-23 — production verified with the browser suite: 53 passed, 0 failed.
