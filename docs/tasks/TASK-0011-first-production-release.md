---
TASK_ID: TASK-0011
aliases: [TASK-0011]
TITLE: First production release
TYPE: RELEASE
SIZE: MEDIUM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-20
AFFECTED_MODULES: [all]
AGENTS: [Architect, Release/DevOps, Integrator]
DEPENDENCIES: origin/develop 97b4cc5; TASK-0010
CURRENT_PACKAGE:
NEXT_READY_WORK_PACKAGE: WP-02
COMPLETED_PACKAGES: [WP-01, WP-02]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0011 — First production release

## Objective

Move `main` from `b90f33e` to the head of `develop`, which triggers DijiPeople's
**first production deployment**. A reader knows this is finished when `main`
carries the release, the deployment succeeded, and a record in
`docs/deployment/release-history/` says what actually happened rather than what
was expected to.

This is a `RELEASE` task and it exists as a separate one deliberately. TASK-0010
was the readiness work and targets `develop`; only a `RELEASE`, `DEPLOY` or
`HOTFIX_PRODUCTION` session may target `main`, and reclassifying an ordinary task
to make integration simpler is exactly what the branch model forbids.

## What ships

183 commits and **17 migrations** that `main` has never seen, including the whole
self-service purchase path, identity and multi-tenant membership, the legal
document surface, the transactional outbox, and the commercial price schedule.

Verified by TASK-0010 against throwaway databases built from the full chain:

- 217 migrations apply from empty; re-applying is a clean no-op.
- **Zero destructive statements** across the 17 — no `DROP TABLE`, `DROP COLUMN`,
  `DROP TYPE`, `SET NOT NULL` or type narrowing.
- `npm run release` — the literal `preDeployCommand` — runs end to end and is
  idempotent.
- The identity backfill was tested against **populated** data, not just an empty
  database, and its `RAISE EXCEPTION` guard was mutation-tested.

Rollback classification: **`ROLLBACK_SAFE`**, with the identity backfill
`FORWARD_FIX_PREFERRED`. What makes the code rollback safe is TASK-0009's
decision to hold the contract phase — `User.identityId` is still nullable, so an
older build ignores a column it does not know about.

What this task achieves, and how a reader knows it is finished. One paragraph.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | PR `develop` -> `main`, exact-SHA CI verdict, merge | DONE | TASK-0010 | Integrator | develop | 77fd2d7 | PASS | — | PASS | MERGED 270cde7 |
| WP-02 | Deployment outcome and the release-history record | DONE | WP-01 | Release/DevOps | main | 6ed7a44 | PASS | — | PASS | RECORDED |

## WP-01 — merged

PR [#33](https://github.com/taymurisrar/DijiPeople/pull/33), merged
2026-08-20 16:40:55Z. `main`: `b90f33e` -> **`270cde7`**.

**The merge changed no file.** `main` was a strict ancestor of `develop`, so the
merge commit's tree is byte-identical to the CI-verified SHA:

```
77fd2d7 tree  e027ec20edf0b264e7cce915dd3131fc6c55fe36
270cde7 tree  e027ec20edf0b264e7cce915dd3131fc6c55fe36
```

That is what makes `POST_MERGE_VALIDATION_STATUS` a fact rather than a hope: the
evidence gathered on `77fd2d7` applies to production content unchanged, and
`git diff origin/develop origin/main` is empty.

### The gate passed in two seconds, and that was checked rather than trusted

The PR's `CI required gate` concluded `pass` in 2s with all twelve underlying
jobs `skipping`. That is the shape of a gate that checks nothing, so it was
verified before merging:

```
reason: run 32391856771 (agent/go-live-readiness) shows all 12 required
        jobs green on this exact SHA
RESOLVE_RESULT: success   REUSE: true   EVIDENCE_RUN_ID: 32391856771
```

`ci.yml` implements exact-SHA evidence reuse deliberately, and defends the two
ways it could be gamed: the resolver is *"a precondition, not evidence — if it
did not itself succeed we know nothing about this SHA and must not conclude"*,
and the check is job-level rather than run-level because *"skipped is rejected
as firmly as failure"*. The workflow file is part of the SHA, so a matching SHA
cannot have been validated by a different pipeline.

CI on `main` at `270cde7` then concluded `success` independently.

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 |  |  | HIGH \| MEDIUM \| LOW |  |

## Owner Decisions

| ID | Question | Answer |
|---|---|---|
| OD-01 | Merge to `main` while Stripe presentment for PKR and QAR is still unconfirmed? | **Merge.** Raised twice and reaffirmed. Recorded rather than argued again — and it is a defensible call: no price is synced to Stripe, so nothing is purchasable in any currency until somebody deliberately opens the commercial surface. The deployment carries no pricing risk. |

### The one thing that can fail this deployment

`preDeployCommand` runs `seed:admin`, which **exits 1** without
`PLATFORM_SUPER_ADMIN_EMAIL` and `PLATFORM_SUPER_ADMIN_PASSWORD` in the Render
dashboard. `render.yaml` declares them; declaring is not setting.

That is [[BUG-0085]], found by running the real command against a virgin
database, and it is the difference between a first deploy that works and one
that aborts before serving anything. If it aborts, set the variables and
redeploy — nothing is corrupted, because the failure happens before the process
starts.

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

None.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS. `main` at `b90f33e`, `develop` at `97b4cc5`,
primary worktree CLEAN, 0 unexplained dirty files.

PRE_TASK_REPO_HEALTH and POST_TASK_REPO_HEALTH, with MAIN_SYNC_STATUS at each.
See `node scripts/repo-health.mjs`.

## History

- 2026-08-24 — **WP-02 closed.** "Deployment outcome pending" had stood for four
  days while eight releases shipped, because the release-history record it was
  waiting on was never written — `docs/deployment/release-history/` held nothing
  but its README.

  Written now as
  [`2026-08-24-production-6ed7a44.md`](../deployment/release-history/2026-08-24-production-6ed7a44.md),
  from evidence gathered against the live system rather than reconstructed:
  `scripts/smoke-deployment.mjs` passes every check it can run unauthenticated,
  `/api/health` serves `6ed7a44` (= `origin/main`), and the deploy log shows the
  full `preDeployCommand` chain completing with 219 migrations applied and all
  ten legal documents published.

  **The record documents deployed state, not the act of deploying**, and says so
  in its own first paragraph. Nobody watched releases #38–#44 with the template
  open, and the folder's README is explicit that inventing per-release detail
  after the fact would put fiction in the one place that has to be trustworthy.
  Those seven are listed from Git as a visible gap instead.

  Verdict: **PASS with a named exception** — the platform is deployed and
  healthy; self-service purchase does not work end to end, for configuration
  reasons tracked as [[BUG-0989]] and [[BUG-0903]].
- 2026-08-20 — merged. `main` = 270cde7, tree identical to the verified 77fd2d7,
  CI green on main. Deployment outcome pending.
- 2026-08-20 — created at the owner's instruction to merge `develop` into `main`.
  Separate from TASK-0010 because only a RELEASE may target the production
  branch.

- 2026-08-20 — created at `17020ac`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0085]], [[BUG-0903]], [[BUG-0989]]

<!-- GRAPH:END -->
