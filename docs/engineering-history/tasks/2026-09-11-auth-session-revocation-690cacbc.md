# Engineering History — Auth session revocation

| | |
|---|---|
| **Task Title** | Auth session revocation — why a remembered session ended |
| **Task Type** | BUGFIX — investigation and durable records only; no code changed, at the user's direction |
| **Date** | 2026-09-11 |
| **Architect Plan** | NOT_APPLICABLE — an investigation producing records, not an implementation. No change class in [`PLANS.md`](../../../PLANS.md) applies to writing bug records. |
| **Agents Used** | Architect (investigation, production forensics, triage, integration). Backend/API and Frontend read code but wrote none. QA deliberately not used — nothing was implemented to test, and the findings are established by production rows rather than by a test run. Release/DevOps deliberately not used — this task leaves `main` untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/auth-session-revocation` |
| **Base SHA** | `118d22ed5142566f9ea14050fd58a1803c93355f` |
| **Final Task SHA** | `690cacbc3edd420c030a0d20b2a0b2cfb07c9358` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin HEAD:develop`), so the target tip *is* the CI-verified SHA rather than an unverified merge commit above it |
| **Final Target SHA** | `690cacbc3edd420c030a0d20b2a0b2cfb07c9358` — equal to Final Task SHA, verified after the push |

> `scripts/new-engineering-history.mjs` derived its Git table and file list from
> `origin/main`, which at the time was **behind** `origin/develop` by the PR #78
> merge commit. That made the generated diff sweep in SESSION-0099's records as
> if this task had written them. The tables below are the task's own commit, not
> the generator's output.

### Commits

```
690cacbc docs(auth): the session did not expire, a second sign-in revoked it
```

One commit. The branch was amended twice before merge — once to correct two
line-number citations, once to add the remediation inventory rows and the
knowledge note — so three SHAs existed on the remote and only the last was
merged.

### Files Changed

18 file(s) against `origin/develop`. Records and generated indexes only; no
source file was touched.

```
A	docs/bugs/BUG-3355-a-second-sign-in-silently-destroys-the-first-session-and-the.md
A	docs/bugs/BUG-3356-a-revoked-or-expired-session-is-reported-to-the-user-as-auth.md
A	docs/bugs/BUG-3357-remember-me-is-overridden-by-the-web-middleware-which-pins-t.md
A	docs/bugs/BUG-3358-a-server-component-render-rotates-the-refresh-token-and-cann.md
A	docs/bugs/BUG-3359-refresh-rotation-has-no-grace-window-and-the-web-middleware-.md
A	docs/bugs/BUG-3360-every-session-row-records-the-user-agent-as-node-and-the-clo.md
A	docs/backlog/items/ITEM-0162-session-timeout-configuration-lives-in-two-places-that-disag.md
A	docs/sessions/SESSION-0100-investigate-access-token-expiry-and-session-revocation-on-th.md
M	docs/knowledge/modules/auth.md
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## What the task actually found

A user reported being signed out of `dijipeople-demo.ws.dijipeople.com` at
`2026-09-11T21:24:24.431Z`, reference `web_3a6adaf7-dc57-49fb-84f4-33cf363dbbb7`,
shortly after signing in with **Remember me** ticked. The modal read
`AUTH_TOKEN_MISSING` — "Access token is required."

Nothing had expired. Production rows show three `web` sign-ins as that user on
the same day — 09:14:28Z, 17:23:52Z, 18:08:33Z — each revoking its predecessor's
refresh token in the same millisecond, and a sign-out at 18:09:54Z after which no
live token existed. The failure the user saw came from a browser still holding
cookies for a session revoked **three hours and fourteen minutes earlier**, by a
second sign-in that the earlier Playwright session (SESSION-0099) performed as
the same account.

The revocation is a single-active-session policy that is on by default for every
tenant that has never configured security — and the demo tenant has **zero**
`TenantSetting` rows in category `security`, so every auth value in play is a
hardcoded default nobody chose. Remember me cannot survive it: it lengthens the
refresh token's TTL and this was a revocation.

Five further defects came out of reviewing the surrounding flows. The one that
made the diagnosis hard is [[BUG-3356]]: when the web layer cannot authenticate a
server-side call it sends the call anyway with no Authorization header, so every
dead session is reported as a *missing* token — and `AUTH_TOKEN_MISSING` sits on
the expected-protocol-outcome allowlist, so the failure left no server-side row
at all. The user's report was the only record that it happened.

## Conflicts

None. The branch was cut from `origin/develop` at `118d22e` and integrated by
ref-push with `origin/develop` unchanged since, so the push was a fast-forward.

## Conflict Resolutions

None — see above.

## QA

| | |
|---|---|
| **QA Report** | None. No QA run: nothing was implemented, and every finding is established by production audit, session and error-log rows rather than by test execution. The reproduction steps in each record are written for the QA run that will verify the eventual fixes. |
| **Bug IDs** | Created [[BUG-3355]], [[BUG-3356]], [[BUG-3357]], [[BUG-3358]], [[BUG-3359]], [[BUG-3360]]. None closed. |
| **Backlog Items** | Created [[ITEM-0162]]. |

All seven were triaged before completion — `awaiting triage 0`. [[BUG-3355]] is
`PRODUCT_DECISION` (whether concurrent sessions are allowed by default is the
owner's call, not the Architect's), [[BUG-3359]] is `PLAN_REQUIRED` (a rotation
grace window may need a schema column), the rest are `FIX_NOW`.

## CI

| | |
|---|---|
| **CI Run ID** | `34654618406` — read on `690cacbc`, the exact SHA pushed to `develop` |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

An earlier SHA on this branch, `191a1b0c`, **failed** the gate on Framework
validation: the remediation inventory carried 589 rows against 596 canonical
records, because `sync-remediation-inventory.mjs` had not been run after the
seven new records. That failure should have been caught locally and was not —
the local check had been run as `validate-framework.mjs | tail -25`, and the
pipe reported `tail`'s exit code rather than the validator's. The repository
already carries that lesson; it was relearned here.

## Post-Merge Validation

The integration was a fast-forward ref-push, so `origin/develop` **is**
`690cacbc` — byte-identical to the SHA CI passed. The merged result and the
validated branch are the same tree, and that was verified after the push rather
than assumed:

```
origin/develop = 690cacbc3edd420c030a0d20b2a0b2cfb07c9358
task HEAD      = 690cacbc3edd420c030a0d20b2a0b2cfb07c9358
origin/main    = 85c31d9d194c722f0a2617ca691b607b02be07a6   (unchanged)
```

Run locally against that tree before the push, each reported individually
rather than through a pipe:

| Check | Result |
|---|---|
| `validate-framework.mjs` | PASS — 5426 checks, 1 non-blocking warning (`adr-0004`, pre-existing) |
| `rebuild-backlog.mjs --check` | PASS |
| `rebuild-sessions.mjs --check` | PASS |
| `rebuild-tasks.mjs --check` | PASS |
| `rebuild-qa.mjs --check` | PASS |
| `generate-dashboards.mjs --check` | PASS |
| `generate-record-graph.mjs --check` | PASS |
| `generate-component-index.mjs --check` | PASS |
| `generate-data-model.mjs --check` | PASS |
| `generate-screen-map.mjs --check` | PASS |
| `knowledge-terms`, `task-sha-ref`, `index-drift`, `main-change-policy` tests | PASS |

No workspace test, lint, typecheck or build was run, and none was relevant: the
commit changes only Markdown records, generated indexes and one JSON inventory.
The full CI gate ran all fifteen required jobs on this SHA regardless, and
passed.

One pre-existing check fails locally and did not fail on CI:
`DEVELOP_CONTAINS_MAIN`. See Release / Deployment Impact.

## Release / Deployment Impact

None — not deployed. `main` was untouched; `MAIN_CHANGE_STATUS = UNTOUCHED`.
Records carry no runtime behaviour, so there is nothing to roll back and no
release record.

Noted but deliberately not acted on: `origin/main` is one commit ahead of
`origin/develop` (the PR #78 merge commit), which `validate-framework.mjs`
reports as `DEVELOP_CONTAINS_MAIN`. It predates this task's base commit and
`agent/reconcile-main-into-develop` already exists for it. Reconciling it here
would have been an unrelated change to a shared branch.

## Knowledge Capture

`docs/knowledge/modules/auth.md` gained two sections, both under **module
knowledge**:

- *Signing in ends your other session, by default, everywhere* — the
  `allowMultipleActiveSessions` default, why an unconfigured tenant is
  single-session, and the database signature that identifies it: two rows whose
  `revokedAt` and `createdAt` agree to the millisecond, with an
  `AUTH_LOGIN_SUCCEEDED` audit row naming the session that did it.
- *Remember me is about the refresh token, and three things outrank it* — so the
  next person asked this question does not have to re-derive it.

The note's evidence list and `Related` line were extended to reach the six new
bug records and [[ITEM-0162]].

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran and wrote **32 notes**; 1410 were already
current, 6 skipped as empty, and no manual note was touched. Changed
`Generated/` folders: `07 - Bugs/Generated/` (the six bug records),
`00 - Home/Generated/Backlog/items/` ([[ITEM-0162]]), plus the regenerated
dashboards and session indexes. All seven of this task's records were confirmed
present in the vault by listing them.

`sync-obsidian.mjs --verify` **fails**, and the task is therefore capped at
**COMPLETE_WITH_DOCUMENTATION_WARNING** rather than reported clean. 36 notes are
`GRAPH_ORPHAN`. **None of them is this task's.** Every one is a pre-existing
record from the technical audit and the monitoring triage — `ITEM-0137`
through `ITEM-0151`, and the `BUG-31xx` range — written by other sessions and
orphaned before this task began. The six bug records and one item created here
all carry wikilinks and verified clean.

Deliberately not fixed. Those notes belong to other branches' in-flight work,
and editing or deleting them from here would damage it. The script's own policy
applies: a documentation-automation failure never rolls back healthy work and
never hides either.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dp-auth-session` removed through
`scripts/remove-worktree.mjs`, never `git worktree remove` — the latter follows
the `node_modules` junction this worktree carries and deletes through it into
the user's primary checkout. The junction is dropped with `cmd rmdir` first.

Remote branch `agent/auth-session-revocation` deleted after the ref-push, since
`develop` now carries the commit and the branch holds nothing else.

The user's primary checkout at `D:/My Work/hrm-dijipeople/DijiPeople` was
recorded clean before this task started and was never written to: all work
happened in the task worktree. `PRIMARY_WORKTREE_STATUS = CLEAN`.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3355]] · [[BUG-3356]] · [[BUG-3357]] · [[BUG-3358]] · [[BUG-3359]] · [[BUG-3360]] · [[ITEM-0137]] · [[ITEM-0151]] · [[ITEM-0162]] · [[SESSION-0099]] · [[SESSION-0100]] · [[TASK-0005]]

<!-- GRAPH:END -->
