# Engineering History — Release attendance location capture

| | |
|---|---|
| **Task Title** | Release attendance location capture |
| **Task Type** | INFRA — release/promotion. No code was written by this task. |
| **Date** | 2026-08-30 |
| **Architect Plan** | NOT_APPLICABLE — a promotion of an already-reviewed, already-CI-verified tree. No change class in `PLANS.md` applies; the delta was checked for migrations and contained none. |
| **Agents Used** | Architect, Integrator, Release/DevOps. QA re-ran the acceptance check against production after rollout. Backend/API, Frontend and Database deliberately not used — a release that writes code is not a release. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/attendance-location-capture` |
| **Base SHA** | `855b59418b4b7d18c0b61d4d540ba66282207c76` (production before) |
| **Final Task SHA** | `51ca3045761f3f5982cb125e501b4c3a7705e400` (the released tree) |
| **Target Branch** | `main` |
| **Merge Commit** | `ec1d58da7001a9eea9eda3470237caecfa9a1f37` — PR #59, 11:51 UTC |
| **Final Target SHA** | `ec1d58da7001a9eea9eda3470237caecfa9a1f37` |

> The generator recorded Base SHA and Final Task SHA as `ec1d58da` because it ran
> **after** the branch was fast-forwarded onto the merge commit, at which point
> the branch and `main` were identical and the diff was empty. The table above
> restores the values that describe the release: `855b5941` is what production
> ran before, `51ca3045` is the tree that was promoted. The generator was not
> wrong about the repository; it was asked the question too late.

### Commits

Five commits promoted (`origin/main..51ca3045`, measured before the merge):

```
51ca3045 docs(attendance): close out the location-capture task with its history and pattern
c5c7c13f fix(attendance): restore location capture and stop erasing refusal reason codes
f77c0abb chore(dashboards): regenerate after the session record closed
c52daada merge: back-merge main after the release
b15547d6 docs(history): the open-bug burndown, start to finish
```

### Files Changed

Nine code files, all from the attendance task (`git diff --stat origin/main
origin/develop -- apps services packages`):

```
apps/admin/next.config.ts                                         11 +-
apps/web/lib/runtime/modules/attendance-location-payload.spec.ts  70 ++++
apps/web/lib/runtime/modules/standard-module-data.adapter.ts      14 +-
apps/web/next.config.ts                                           12 +-
packages/config/index.d.ts                                         7 +
packages/config/security-headers.js                               44 ++-
packages/config/security-headers.test.js                          54 ++++
services/api/src/common/errors/attendance-reason-codes.spec.ts   144 ++++
services/api/src/common/errors/error-catalog.ts                  124 ++++
```

The remaining files in the PR are documentation: bug records, QA scenarios,
regression register entries, the engineering history for `c5c7c13f`, and
generated indexes and dashboards.

## Conflicts

None. `origin/main` was an ancestor of `origin/develop`, verified with
`git merge-base --is-ancestor` before opening the PR, and `develop` was re-read
immediately before the merge and confirmed still at `51ca3045`.

That last check is not ceremony. SESSION-0074 watched `develop` move three times
under an open release PR, once cancelling the PR's CI run, so that the tree the
owner approved was not the tree that shipped. Here it had not moved, and the PR
body described exactly what merged.

## Conflict Resolutions

None — no conflicts.

One deliberate choice a diff cannot show: **merge commit, not squash or rebase.**
Squash would have collapsed five commits into one and destroyed the boundary
between the fix and its documentation; rebase would have rewritten the SHAs, so
the commit CI actually verified would no longer exist by that name. The merge
method preserves `51ca3045` as a real parent of `ec1d58da`, which is what makes
the CI verdict in this record checkable by anyone later.

The cost is that `main` then held a commit `develop` lacked. That was settled by
fast-forwarding `develop` to `ec1d58da` rather than creating a second merge
commit — legitimate here precisely because `develop` was an ancestor of the merge
commit. Both branches are now identical and cannot drift.

## QA

| | |
|---|---|
| **QA Report** | No new run record. This release's acceptance check is the post-rollout production verification below, and the reusable scenario is QA-ATTENDANCE-002, written during the fix. Verdict: **PASS** on the released behaviour. |
| **Bug IDs** | Reached production: BUG-2331 (HIGH), BUG-2332 (HIGH), BUG-2333 (MEDIUM). Deliberately **not** in this release: BUG-2334 (FIX_NOW, open) and BUG-2335 (PRODUCT_DECISION, open). |
| **Backlog Items** | None created, advanced or closed. |

## CI

| | |
|---|---|
| **CI Run ID** | `33309430395` (`pull_request` on PR #59). Runs `33307994271` and `33307987316` (`push`) also passed on the same SHA. |
| **CI Result** | PASS — `CI required gate` **success** on `51ca3045`, the exact SHA merged, alongside `Database migration gate`, Build, Browser e2e, Database e2e, Typecheck, Lint, Runtime schema, Framework validation and the API/Web/Admin/Landing/Desktop test jobs. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

The push-event run had already returned the gate green when the PR was opened.
The PR-event run was waited for anyway rather than merging on the earlier
verdict — same SHA, so the outcome was not in doubt, but merging to production
while a run is in flight makes the record ambiguous about which verdict
authorised it.

## Post-Merge Validation

Validated against **production**, not against the merged tree, because the defect
was a response header and no test suite can observe one:

```
Permissions-Policy, after rollout
  dijipeople-demo.ws.dijipeople.com   geolocation=(self)   was ()
  app.dijipeople.com                  geolocation=(self)   was ()
  admin.dijipeople.com                geolocation=(self)   was ()
  www.dijipeople.com                  geolocation=()       unchanged, as intended
```

Then functionally, on the unmodified production attendance page with every
investigative intervention removed and all permissions cleared — the state a
first-time employee is in:

```
allowsFeature('geolocation')   true     (was false)
permission state, first visit  prompt   (was denied)
getCurrentPosition, granted    24.7136, 46.6753 @ 15 m
```

`prompt` is the browser stating it will show the dialog. `denied` under an empty
allowlist was the browser stating it never could. That single transition is the
whole release.

Landing is the check most likely to be skipped and the one most worth keeping:
the fix made geolocation opt-in per app, so an app that did **not** opt in must
still receive the empty allowlist. It does.

BUG-2332 was verified separately, after the Render deploy went live at 11:58:21
UTC — the two fixes ship on different pipelines and the web one was live five
minutes before the API one, so checking both at once would have measured the old
API. A real refused check-in on production now returns:

```
errorCode             WORK_MODE_DISALLOWS_REMOTE   (was VALIDATION_FAILED)
statusCode            422
technical dialog       not shown                    (was ERROR VALIDATION_FAILED
                                                     + reference id + Download log)
on screen             "Remote check-in is not available for you"
                      + the work-site sentence + Dismiss
```

That is the classifier in `attendance-outcome.ts` running for the first time.

The session was logged out mid-verification by the API instance swap, which is
worth noting for the next person: a redeploy invalidates live sessions, so a
post-deploy check that reuses a pre-deploy login silently lands on the login page
and looks like a missing button rather than an expired session.

## Release / Deployment Impact

**Deployed to production.** Both pipelines auto-deployed on the push to `main`;
neither needed triggering by hand, which matters because the standing agreement
on the Vercel and Render credentials is status-and-logs only.

| Surface | Pipeline | Result |
|---|---|---|
| `diji-people-web`, `diji-people-admin`, `diji-people-landing` | Vercel | Deployed `ec1d58d` from `main`; headers verified live |
| `dijipeople-api` (`srv-d7js7fqqqhas739v4i7g`) | Render | Deployed `ec1d58d`; `pre_deploy` ran `release:api` |

**No migrations were applied.** `Database migration gate` was green and the
delta contains no migration directory — checked rather than assumed, because
`release:api` runs `prisma:migrate:deploy` on every deploy and would have applied
one silently had it existed.

Rollback class: **trivial and independent.** No schema change, no migration, no
API contract change, no permission change. The header is one value; the twelve
error-catalog entries are purely additive and cannot alter an existing code path.
Reverting restores the prior (broken) behaviour with no state to unwind.

Verified by commit hash **and** by behaviour. A hash alone would have been
insufficient here: BUG-2331 shipped inside a build whose commit hash was
perfectly correct.

## Knowledge Capture

Nothing new — recorded as a deliberate outcome rather than an omission. The
durable lessons from this work were captured by the task that produced it
(`2026-08-30-attendance-location-capture-c5c7c13f`): the
`reason-code-erased-below-the-classifier` bug pattern, and BUG-2331's account of
`doc-code-drift` expressed in a response header rather than a document.

One operational observation is new, and lives here because it is a release fact
rather than an engineering one: **auto-deploy fired on both pipelines for this
merge.** The standing caution that a merge to `main` can sit undeployed came from
a real 48-minute stall, so the absence of a stall is worth recording as an
observation — not promoted to a rule, because one clean rollout does not retire
a caution earned by a real incident.

## Obsidian Sync

Ran at closeout; results recorded in the session record and below.

The two pre-existing `GRAPH_ORPHAN` ExecPlans sharing the id `EXECPLAN-0028`
remain outstanding. They were proven to predate this work, belong to other
sessions, and were not touched — the evidence is in the previous history record.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/dijipeople-attendance-loc` and branch
`agent/attendance-location-capture` are **retained**. BUG-2334 is dispositioned
FIX_NOW in the same files and is the natural next task.

`node_modules` there are junctions to the primary checkout, so removal must go
through `node scripts/remove-worktree.mjs` — never `git worktree remove` or a
recursive delete, both of which follow junctions and have previously emptied
thousands of tracked files out of the user's primary checkout.

The user's primary checkout was not touched by this release and remains at its
own baseline. It still holds one untracked file,
`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`,
which now **collides with a file of the same path committed on `main`**, and
whose local copy differs from the committed one. It was deliberately left alone:
it is the user's uncommitted work, reconciling it is theirs to do, and it is the
reason their local `develop` cannot fast-forward.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-2331]] · [[BUG-2332]] · [[BUG-2333]] · [[BUG-2334]] · [[BUG-2335]] · [[QA-ATTENDANCE-002]] · [[SESSION-0074]]

<!-- GRAPH:END -->
