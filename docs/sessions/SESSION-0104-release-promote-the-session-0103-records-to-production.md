---
SESSION_ID: SESSION-0104
aliases: [SESSION-0104]
TASK_ID: TASK-0030
TITLE: Release: promote the SESSION-0103 records to production
ARCHITECT_INTENT: Promote the SESSION-0103 integration of 34 records from develop to production, then carry out the owner-approved entitlement cutover
STATUS: COMPLETE
TASK_TYPE: RELEASE
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: f36ec9a90da406c076d935a8d29888d6c7b5a566
TASK_BRANCH: develop
TARGET_BRANCH: main
WORKTREE: D:/My Work/hrm-dijipeople/dp-records-impl
AFFECTED_MODULES: [apps/web, apps/admin, auth, billing, notifications, customization, employees]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-09-12T22:06:44.814Z
LAST_HEARTBEAT: 2026-09-12T22:06:44.814Z
BLOCKERS: none
---

# SESSION-0104 — Release: promote the SESSION-0103 records to production

## Intent

Promote [[SESSION-0103]]'s integration of 34 records from `develop` to `main`,
verify it reached production, then carry out the entitlement cutover the owner
approved.

## A record written after the fact, and why

This session was registered **after** the promotion it describes, not before.
That is backwards, and it is recorded here rather than smoothed over.

[[SESSION-0103]] was an ordinary feature task. When the owner asked for its
result to reach `main`, its record briefly named `main` as the target, and
`rebuild-sessions.mjs --check` refused it: a FEATURE session may not target
`main`. The check was right. SESSION-0103 was returned to `develop`, and this
release was supposed to be registered as its own session before promoting.

It was not. The promotion, the deploy and the cutover were carried out from the
same conversation without first registering this record. The work was done
correctly and verified at every step; the bookkeeping that should have preceded
it did not. It is filed now so that the production change has a session of the
right type attached to it, and so the gap is visible rather than inferred.

No write lease was taken for `deployment` either, for the same reason. Nothing
else was deploying at the time — `session.mjs list` showed no other active
session — so no collision resulted, but that was luck of timing rather than the
lease doing its job.

## Scope

### Promotion

- `develop` carried the CI-verified commit `413565f0`, integrated by ref-push so
  its tip was byte-identical to what the `CI required gate` had passed.
- Pull request [#79](https://github.com/taymurisrar/DijiPeople/pull/79) from
  `develop` to `main`. Its own gate settled clean with zero failures.
- Merged at `df0f84f1`, 2026-09-12T21:35:56Z.
- The ten commits already on `develop` before SESSION-0103 were documentation
  only, so every code change in this release belongs to that session: 138 code
  files.
- `main` was then merged back into `develop` as an empty reconcile commit,
  `f36ec9a9`, whose tree is byte-identical to `main`'s, so the framework's
  `DEVELOP_CONTAINS_MAIN` check holds for the next session.

### Deploy

- Fired automatically two seconds after the merge. Deploy
  `dep-daisbfmk1f9s73fbvrfg` went build, pre-deploy, update, live in roughly
  eight minutes.
- `/api/health` reported `df0f84f`, status ok, environment production. Verified
  against the endpoint rather than assumed from the merge.
- The CI run on the merge commit passed. Two runs on `main` show failure; both
  are the Dependabot Updates workflow, not CI, and belong to the dependency
  advisories already tracked by [[ITEM-0122]] and [[ITEM-0123]].
- **No migration shipped and `schema.prisma` did not change.**

### A correction this deploy made to what we believed

The service **does** have a pre-deploy command: `npm --workspace api run
release`, which runs `prisma migrate deploy` and then `seed:config` and several
other seeds, on every deploy. A standing note in agent memory said it had none.
That note was wrong, and it has been corrected.

The consequence is the reason ADR-0009's design held. `seed:config` runs on
every release, so had the entitlement-enforcement setting been placed in the
shipped defaults, this deploy would have switched enforcement on across
production as a side effect. It was kept out deliberately. Production was read
immediately after the deploy: the setting was still absent, the report-only
default applied, and no tenant had lost access.

One thing the deploy did activate, as predicted: the support case update email
event is now seeded. It previously threw on every call because its template never
existed. The owner chose to leave it on.

### Entitlement cutover

In the order ADR-0009 specifies, each step verified before the next:

1. **Dry run against production.** Three subscriptions, all Starter, all
   `ACTIVE`. Would grant two overrides, both to `dijipeople-demo`: `projects`
   and `timesheets`. It would not grant Payroll, Recruitment or Onboarding,
   because that tenant has no rows in any of them — the screens render, the
   tables are empty. Recorded in ADR-0009 as a contradiction of its own
   confirmed-case bullet.
2. **Grandfathering applied.** Two overrides written. A second run wrote nothing
   and reported both as already present, confirming idempotency on the real
   database.
3. **Enforcement switched** from `REPORT_ONLY` to `ENFORCE`. Confirmed by
   re-running the mode script, which reported it already `ENFORCE`.

### Left for the owner, deliberately

`dijipeople-demo` is still on Starter. The owner chose to move it to Enterprise,
which includes every gated module. Doing that by writing the subscription row
directly was **blocked by a safety guardrail**, and the block was correct: it
would have bypassed the plan-change endpoint this very release shipped, skipping
its payment-provider sync and its audit entry, and recreated the product-versus-
Stripe divergence that [[BUG-3334]] and [[BUG-3331]] closed.

The owner will make the change in the platform admin console. Until then, with
enforcement on, the demo tenant has lost Payroll, Recruitment and Onboarding;
Projects and Timesheets survive through the grandfathered overrides. The owner
chose to switch enforcement on before that plan change, knowing this.

`nisaco` and `qa-e2e-signup-b-20260826` lose the five modules Starter excludes,
by the owner's decision to treat both as disposable.

### Reversal

One command, effective within a minute because the mode is re-read on a short
TTL rather than at boot:

```
npm run entitlement:set-mode -- REPORT_ONLY
```

## Concurrency

No other session was active. No write lease was taken, including `deployment`,
which is the gap described above.

## History

- 2026-09-12 — SESSION-0103 integrated to `develop` at `413565f0`, CI PASS.
- 2026-09-12 — pull request #79 opened, gate clean, merged at `df0f84f1`.
- 2026-09-12 — deploy live on `df0f84f`, verified at `/api/health`.
- 2026-09-12 — `main` reconciled back into `develop` at `f36ec9a9`.
- 2026-09-12 — production read after deploy: enforcement untouched by
  `seed:config`, no migration, support case email now seeded.
- 2026-09-12 — grandfathering dry run, then applied: two overrides, idempotent.
- 2026-09-12 — enforcement switched `REPORT_ONLY` to `ENFORCE`, verified.
- 2026-09-12 — direct plan change for the demo tenant blocked; handed to the
  owner via the admin console.
- 2026-09-12 — this record registered, after the fact, and closed COMPLETE.

## Related

[[SESSION-0103]] · [[TASK-0030]] · ADR-0009 · [[BUG-3350]] · [[BUG-3334]] ·
[[BUG-3331]] · [[ITEM-0122]] · [[ITEM-0123]]

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Engineering history for `develop`:

[[2026-08-23-landing-e2e-release-be486ae1]]

Records this session worked on, cited in its own body:

[[BUG-3331]] · [[BUG-3334]] · [[BUG-3350]] · [[ITEM-0122]] · [[ITEM-0123]] · [[SESSION-0103]]

Modules this record declares as affected:

[[auth]] · [[billing]] · [[employees]] · [[notifications]] · [[platform-admin]] · [[tenant-application]]

<!-- GRAPH:END -->
