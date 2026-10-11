# Engineering History — DP platform remediation (12 workstreams)

| | |
|---|---|
| **Task Title** | DP platform remediation — onboarding, payment, agreements, activation, ownership, timelines, lookups, teams, support lifecycle, Safepay |
| **Task Type** | FEATURE |
| **Date** | 2026-10-11 |
| **Architect Plan** | NOT_APPLICABLE — the single additive migration is not a destructive change under PLANS.md. The plan, decisions D1–D4 and the root-cause matrix are in `docs/engineering/dp-remediation-progress.md`. |
| **Agents Used** | Architect (this session). Four read-only investigation agents (root causes WS01–WS12). Implementation agents per workstream: WS01+02, WS03, WS04+08, WS05, WS06, WS07, WS09+11, WS10, WS12. One records agent (bug, REG and QA records). Not used: a separate Reviewer or Security agent; the Architect reviewed the diff and the security checklist directly. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/dp-platform-remediation` |
| **Base SHA** | `4489a3c6` |
| **Final Task SHA** | `889f94c7cc2c7c15be7685d177cff832f0d03d3d` |
| **Target Branch** | `develop`, then `main` via release PR #104 (owner decision D2) |
| **Merge Commit** | `dc10b3714f453dd2d3977eb9e9126c98ea216242` (PR #104 into `main`); `develop` was fast-forwarded to `889f94c7` first |
| **Final Target SHA** | `main` = `dc10b371`; `develop` = `889f94c7`, followed by this closeout commit |

### Commits

```
889f94c7 docs(generated): component index, data model and screen map for the DP remediation
d5e35295 docs(records): BUG-4052..4061 + BUG-3895 fixed, REG-667..677, QA scenarios for the DP remediation
51c80beb feat: DP platform remediation — onboarding, payment, agreements, teams, ownership, support lifecycle, Safepay choice
```

### Worktrees

`D:/My Work/hrm-dijipeople/dijipeople-dp-remediation` (this task, a real
`npm ci` install). A temporary `dp-lintbase` worktree was used for a per-file
lint baseline; it was removed through `scripts/remove-worktree.mjs`, and the
primary checkout was verified intact.

### Files Changed

171 files against `4489a3c6`: API modules (billing, outbox, contracts,
support-cases, platform-users, super-admin, platform-events, platform-runtime,
auth, error-logs, leads, tenants), one migration, the admin, web and landing
apps, records and generated documentation.

## Conflicts

None. `develop` had not moved since the task branched, so integration was a
fast-forward. `main` received the release through a PR merge commit.

## Conflict Resolutions

None — there were no conflicts.

## QA

| | |
|---|---|
| **QA Report** | Evidence is in `docs/engineering/dp-remediation-progress.md` under Verification. A browser pass of the subscribe wizard ran at desktop and mobile widths; a new database-backed e2e suite is `services/api/test/dp-remediation-workflows.e2e-spec.ts` (6/6). |
| **Bug IDs** | Created and FIXED: BUG-4052, BUG-4053, BUG-4054, BUG-4055, BUG-4056, BUG-4057, BUG-4058, BUG-4059, BUG-4060, BUG-4061. Closed: BUG-3895. Unchanged: BUG-3888. |
| **Backlog Items** | None created. The pre-existing step-label crowding at 390 px is noted in the progress record, not filed. |

## CI

| | |
|---|---|
| **CI Run ID** | 38147733646 (push), plus 38148343585 and 38148397594 (PR #104) |
| **CI Result** | PASS — all three runs on the exact merged head `889f94c7` |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merge commit `dc10b371` changes no file relative to `889f94c7`, so the
CI-verified tree is the deployed tree. In production after the deploy:

- `GET /api/health` reports `commitShort dc10b37`, status `ok`, outbox worker
  enabled.
- `/api/platform-teams`, `/api/super-admin/assignment-rules`,
  `/api/contracts/template-eligibility` and `POST /api/support-cases/:id/escalate`
  are mapped and answer 401 unauthenticated.
- `/api/public/plans` returns 200 with `paymentProviders` on 18 of 18 prices.
- The `www` /subscribe and /subscribe/success pages, the `app`
  /activate-account page and the `admin` /login page all return 200.
- All three Vercel apps are READY at `dc10b371`.

## Release / Deployment Impact

Deployed to production:

- Render deploy `dep-db5q89c9v7es739brchg`, live at 2026-10-11T15:06:44Z.
- The Render pre-deploy `release` script ran `prisma migrate deploy`, applying
  the additive migration `20261011090000_platform_teams_assignment_rules_case_relations`.
  It then ran `seed:config`, which seeds the four support teams create-only,
  and `seed:verify`. A failure in either would have marked the deploy
  `pre_deploy_failed`.
- Vercel: web, admin and landing.

Rollback class: code roll-back is safe. The migration only adds tables, enums
and nullable columns, so the previous release runs against the new schema
unchanged. No data was backfilled (owner decision D4).

Manual follow-up: subscribe the production Stripe webhook endpoint to
`checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed`.

## Knowledge Capture

- `docs/knowledge/modules/billing.md`: payment confirmation and provider choice
  (architecture).
- `docs/knowledge/modules/contracts-and-agreements.md`: source eligibility and
  the authorized signer (business rule).
- `docs/knowledge/modules/super-admin.md`: record assignment rules
  (architecture).
- New note `docs/knowledge/modules/support-cases.md`: lifecycle, teams,
  relations and merge semantics (module).

## Obsidian Sync

`node scripts/sync-obsidian.mjs` runs after this record is committed and
pushed, so the vault receives committed notes only. The outcome is reported
in the task's final summary.

## Cleanup

The worktree is kept until the closeout commit reaches `develop`. Removal goes
through `scripts/remove-worktree.mjs` (never `git worktree remove`), after
which the local branch is deleted. The throwaway database
`dijipeople_dpremed_test` is dropped at the same time.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3888]] · [[BUG-3895]] · [[BUG-4052]] · [[BUG-4053]] · [[BUG-4054]] · [[BUG-4055]] · [[BUG-4056]] · [[BUG-4057]] · [[BUG-4058]] · [[BUG-4059]] · [[BUG-4060]] · [[BUG-4061]]

<!-- GRAPH:END -->
