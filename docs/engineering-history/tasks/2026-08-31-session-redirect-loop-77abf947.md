# Engineering History — Session redirect loop

| | |
|---|---|
| **Task Title** | Session redirect loop |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-31 |
| **Architect Plan** | NOT_APPLICABLE — four scoped defect fixes, each with an established root cause and a regression test. No new capability, no migration, no cross-module design. |
| **Agents Used** | Architect, Backend/API, Frontend, Security, QA, Reviewer, Integrator, Release/DevOps, Knowledge & Graph. Database was not needed — no schema change. UI/UX was not needed — no visual change beyond a number becoming correct. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/session-redirect-loop` |
| **Base SHA** | `77abf947ceacbbff9a5f1db8ba7cf7ac4a8d9152` |
| **Final Task SHA** | `77abf947ceacbbff9a5f1db8ba7cf7ac4a8d9152` |
| **Target Branch** | `main` |
| **Merge Commit** | `6d17e931ba46aac50194cc455eeb3846a8840af8` (PR #66) |
| **Final Target SHA** | `6d17e931ba46aac50194cc455eeb3846a8840af8` — tree byte-identical to the CI-verified `77abf947` |

### Commits

```
(none — the branch has no commits beyond its base)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-redirect                   77abf947 [agent/session-redirect-loop]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

0 file(s) against `origin/main`.

```
(no differences against the base)
```

## Conflicts

None. The branch was cut from `origin/develop` at `4a7c0d4a` and integrated by
ref-push while still a fast-forward, so there was nothing to reconcile.

## Conflict Resolutions

None required.

One decision belongs here even though it was not a merge conflict. `main` is a
merge commit no CI run ever saw by SHA, so the SHA proves nothing about what
deployed. It was verified by comparing `main`'s **tree** against the CI-verified
commit's — identical. Trusting the SHA instead would mean deploying a commit no
gate had examined.

## QA

| | |
|---|---|
| **QA Report** | No separate run: every defect here was found *during* post-deploy validation of the previous release and is recorded in its bug record and in the two deployment reports. |
| **Bug IDs** | Fixed: BUG-2683, BUG-2623, BUG-2662, BUG-2693. BUG-2662 was created and deferred earlier the same day, then fixed here at the owner's direction. |
| **Backlog Items** | None. Four regressions promoted: REG-386 … REG-389. Four QA scenarios: QA-REPORTING-007 … 010. |

## CI

| | |
|---|---|
| **CI Run ID** | `33370158317` (pull_request, `77abf947`). An earlier push run failed on Lint and is recorded below rather than hidden. |
| **CI Result** | PASS on `77abf947`, read on the exact SHA merged. FAILED on `5933b60e` (Lint — two prettier errors). |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merged tree is byte-identical to the verified tree, so the branch suites
describe the merged result exactly. What was measured **against production**:

| Check | Result |
|---|---|
| Deployed commit at `/api/health` | `6d17e931…` |
| Expired session on a protected page | lands on `/login?next=%2F` — no `ERR_TOO_MANY_REDIRECTS` |
| Headcount at 7 / 30 / 243 days | 12 / 12 / 12 — was 70 / 323 |
| Scheduled report delivery | re-armed for 09:00 UTC; result recorded in the deployment report |
| Owned-record scope | **not verifiable from an owner account** — see the deployment report |

Branch suites at the merged tree: API 6,343 across 299 suites, web 1,530 across
68, framework 4,902 checks, lint 0 errors, both typechecks clean.

## Release / Deployment Impact

Deployed to **production** as `6d17e931` under the owner's standing
authorisation. Rollback class `CODE_ONLY` — no migration.

Record: [2026-08-31-production-6d17e93](../../deployment/release-history/2026-08-31-production-6d17e93.md).

Separately, and not part of this branch: the workforce snapshot backfill was run
for the demo tenant as a Render one-off job — 364 days, 3,996 rows, 12 kept as
OBSERVED, 0 failures.

## Knowledge Capture

No new `docs/knowledge/` file. The durable lessons are in the four regression
Note fields, which is where a future agent reading about a module actually finds
them, and in the deployment report's account of the Lint failure.

The one worth repeating here: **three of these four defects were contracts
asserted from one side only** — template against dispatcher, helper default
against schema, middleware presence-check against API validity. Each half was
individually correct and individually tested.

## Obsidian Sync

Ran after the records were final; verified with `knowledge:verify`.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-redirect` removed through
`scripts/remove-worktree.mjs`, never `git worktree remove` — that command
follows the `node_modules` junction and has previously deleted thousands of
tracked files out of the primary checkout.

The primary checkout was left at its recorded baseline: one pre-existing
untracked file belonging to the user, never touched.

## What Was Asked

Four follow-up questions after the Reports & Analytics release, answered by the owner: verify scheduled email delivery to a real inbox, backfill workforce history for the demo tenant, fix the expired-session redirect loop, and audit every caller of `buildScopedAccessWhere` before deciding what to do about BUG-2623.

## What Actually Happened

Three of the four answers turned into defect reports, because answering them honestly meant *operating* the deployed product rather than testing it.

**Scheduling a real report proved the feature had never worked.** It ran on time, executed under the owner's access, produced the file — then failed with `Missing email template variables: tenantName.` I had written the template declaring that variable and using it in the subject line, and never passed it from the dispatcher. The renderer treats a declared-but-absent variable as a hard failure, so it stopped the email rather than blanking a field: 100% failure, every tenant, since the feature shipped.

**Backfilling the workforce history made a wrong number visible.** "Historical headcount" read 323 for a company of twelve, because `workforce_history` holds one row per employee per day and the metric was a plain `count`. It had always been wrong; the table had been empty for every tenant, so the tile showed an empty state and the number had never been on screen. It appeared within minutes of the backfill giving it data.

**Auditing BUG-2623 found it live outside reporting.** Exactly one model of 312 has an `ownerTeamId` column, and the shared helper defaulted the field *on* for everyone. Data-management exports of `Employee`, `LeaveRequest` and `AttendanceEntry`, and generic `employees` reads, threw for any SELF/USER/TEAM caller belonging to a team.

**The redirect loop had a mechanism, not a mystery.** `hasSessionCookie` is cookie presence. An access token stays structurally valid for hours after the session row dies, so the middleware waves the request through, the page 401s and redirects to `/login?next=…`, the middleware sees the same stale cookies and sends it back to `/`, and the browser gives up.

## Key Decisions

**Assert the contract, not a list.** The scheduled-delivery test reads `availableVariables` off the catalog seed and requires every key in what the worker dispatched. A hand-written list would drift from the template exactly as the dispatcher already had.

**Make the phantom field opt-in rather than patching each caller.** Inverting the default means forgetting it yields a *narrower* result set instead of a thrown query. One caller — the model that genuinely has the column — already named it explicitly, so nothing had to change there.

**Do not clear cookies in the login bounce.** It is a plain GET, and signing someone out because one request returned 401 would be a worse failure than the loop. Clearing belongs to `redirectToLogout`, which knows the refresh itself failed.

**Pin the latest date that exists, not the period's end.** The snapshot job captures *yesterday*, so a period ending today has an empty final day; pinning it would report a headcount of zero every morning.

**Run the backfill as a Render one-off job.** The production database credential never left the platform. Reading it locally had been refused by the environment's permission policy earlier in the day, and that refusal was left standing rather than worked around.

## What Went Wrong Along The Way

**A test that passed on the broken tree.** The first caveat-uniqueness test compared a normalised 60-character prefix, and the pair that shipped diverged at the fourth word. It only surfaced because the fix was deliberately reverted to confirm the test failed — and it did not. Replaced with word-set overlap.

**CI's Lint gate went red on a second push.** The four workspaces were linted, then more work was added to the same branch and pushed without re-linting. The memory note already said "after the *last* edit"; being right about it did not prevent it. The correction recorded is a single pre-push block rather than a habit applied by judgement.

**A junctioned `node_modules` produced 14 false suite failures.** It was missing `pdf-parse`, which develop's `package.json` declares. A real `npm ci` plus `prisma generate` was needed before the suite result meant anything — the same class of trap as the prettier one.

**A bug id was written before the allocator assigned one.** BUG-2685 appeared in three comments; the allocated id was BUG-2693. Corrected, and it is the reason the allocator exists.

## Validation

| | |
|---|---|
| API tests | 6,343 across 299 suites |
| Web tests | 1,530 across 68 suites |
| Framework validation | 4,902 checks |
| Lint | 0 errors across all four workspaces |
| Typechecks | clean, both workspaces |

Each fix proven to fail without it: 3 of 4, 4 of 7, 4 of 6, and 4 of 4 cases.

## What A Future Agent Should Know

**A feature can pass every gate and still be unable to do the one thing it exists for.** Scheduled reports produced correct files, recorded their own failures honestly, surfaced the reason on screen, and had never sent an email. Nothing short of scheduling one and waiting would have found it.

**Making a screen reachable is what exposes its bugs.** The headcount defect was unobservable behind an empty state and appeared minutes after the surface got data. Backfilling was not just a data task.

**A default on a shared helper is a claim about every model.** `ownerTeamId` was true of 1 model in 312.

**Test the seam.** Three of these four were contracts asserted from one side only — template against dispatcher, helper default against schema, middleware presence-check against API validity. Each half was individually correct and individually tested.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-2623]] · [[BUG-2662]] · [[BUG-2683]] · [[BUG-2693]] · [[QA-REPORTING-007]]

<!-- GRAPH:END -->
