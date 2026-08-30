# Engineering History — Close every stale active session and finish their residual work

| | |
|---|---|
| **Task Title** | Close every stale active session and finish their residual work |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-24 |
| **Architect Plan** | [`EXECPLAN-0003`](../../plans/EXECPLAN-0003-forwarded-host-trust-in-tenant-web-routing.md) — for the ITEM-0044 half. The reconciliation half needed no plan: it changes no code and every state it asserts was read from `origin/develop`. |
| **Agents Used** | Architect, Security, Frontend, Backend/API, QA, Reviewer, Integrator. **Not used:** Database (no schema, migration or query change), Release/DevOps (`develop` only; the one env var is optional and already registered), UI/UX (no rendered surface changes). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/session-registry-closeout` |
| **Base SHA** | `004ee66668e2c0f35d287ae287a1bb991967b2cd` |
| **Final Task SHA** | `cbc6f0b25a5d809fb09cbe32788b32dfcf1c0681` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — ref-push integration, so `develop`'s tip IS the verified SHA rather than a merge of it |
| **Final Target SHA** | The commit carrying this completed record — this file's own, docs-only closure commit, ref-pushed to `develop` so the tip equals it. It is described rather than named: a record cannot contain its own SHA, and each attempt to write one changes it. The task's *content* SHA is `e949cad9`, one commit earlier. |

### Commits

```
cbc6f0b2 feat(security): close every stale session, and the one thing they left undone
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            a3e15568 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-session-closeout           cbc6f0b2 [agent/session-registry-closeout]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
```

### Files Changed

42 file(s) against `origin/develop`.

```
A	apps/web/lib/forwarded-host.spec.ts
M	apps/web/proxy.ts
M	docs/architecture/workspace-routing-and-domains.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md
A	docs/backlog/items/ITEM-0092-widget-runtime-contract-test-js-fails-and-no-script-or-ci-jo.md
M	docs/backlog/open.md
M	docs/engineering-history/tasks/2026-08-19-ci-e2e-remediation-3f03571.md
M	docs/environment-variables.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/plans/EXECPLAN-0003-forwarded-host-trust-in-tenant-web-routing.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-TENANT-016-a-forged-forwarded-host-must-not-select-a-tenant-workspace.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-003-tenant-isolation.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0003-dijipeople-global-technical-remediation.md
M	docs/sessions/SESSION-0014-ci-performance-cancellation-rca-and-autonomous-ci-adaptation.md
M	docs/sessions/SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian.md
M	docs/sessions/SESSION-0019-ci-browser-install-latency-and-database-e2e-fixture-contract.md
M	docs/sessions/SESSION-0022-go-live-readiness.md
M	docs/sessions/SESSION-0023-first-production-release.md
A	docs/sessions/SESSION-0047-close-every-stale-active-session-and-finish-their-residual-w.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md
M	docs/tasks/TASK-0010-go-live-readiness.md
M	docs/tasks/active.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
A	packages/config/forwarded-host.js
A	packages/config/forwarded-host.test.js
M	packages/config/index.d.ts
M	packages/config/index.js
M	services/api/src/common/security/proxy-trust.ts
M	services/api/src/main.ts
M	services/api/src/modules/tenant-domains/request-hostname.ts
```

## Conflicts

None — the branch was cut from `origin/develop` at `004ee666` and integrated by
ref-push, so there was no merge to conflict.

Two *potential* conflicts were avoided rather than resolved, and they are the
interesting part of this task. `agent/ci-e2e-remediation` and
`agent/agent-framework-hardening` each carried an unpushed closure commit
(`b7382f00`, `20eec75a`) touching the same session records and generated indexes
this task rewrites. Cherry-picking either would have conflicted on every index
line.

## Conflict Resolutions

For the two stranded commits, the choice was **take the substance, regenerate the
derived files**:

- `docs/engineering-history/tasks/2026-08-19-ci-e2e-remediation-3f03571.md` and
  `docs/sessions/SESSION-0016-…md` were restored verbatim with
  `git checkout <sha> -- <path>`.
- Their edits to `docs/sessions/{active,completed,index}.md` and the Engineering
  Control Center were discarded and regenerated, because those files are
  generated and their versions described a repository state five days stale.

**What choosing the other side would have lost.** Cherry-picking the commits
whole would have reinstated stale generated indexes, which the record validators
would then have failed — and resolving that by hand risks losing the half that
actually matters. Skipping the commits entirely would have lost real evidence:
`b7382f00` carries CI run `32308844551`, the first run in which `Database e2e`
concluded success **as a required job** after being report-only for its entire
existence. That fact exists nowhere else. It is recovered here.

One line inside the recovered file had to change. It discussed a REG id written
as a wikilink — and wrote it as one, which the current validator rejects (REG ids
have no per-id note). The prose is about the mistake, so the sentence was kept
and the brackets removed rather than the sentence deleted.

## QA

| | |
|---|---|
| **QA Report** | No run file. Coverage is the new scenario [`QA-TENANT-016`](../../qa/scenarios/QA-TENANT-016-a-forged-forwarded-host-must-not-select-a-tenant-workspace.md), verdict **PASS**, automated. |
| **Bug IDs** | None created. None closed — every bug this task's sessions touched was already terminal. |
| **Backlog Items** | **ITEM-0044** closed (`READY` → `DONE`). **ITEM-0092** created (`READY`, `PLAN_REQUIRED`). **ITEM-0026**, **ITEM-0027**, **ITEM-0034** deliberately left `READY` — see the TASK-0005 closure. |

## CI

| | |
|---|---|
| **CI Run ID** | `32747885644` on `e949cad9` — every line of code and record this task changed. The docs-only closure commit is verified by its own run on the branch before integration. Both preceded by `32746141086` on `cbc6f0b2`, **FAILED**. |
| **CI Result** | **PASS** — all fifteen jobs success, `CI required gate` included |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`origin/develop` is byte-identical to a SHA CI verified, because ref-push keeps
the tip equal rather than merging into it. There is no second tree to re-prove.

Two runs matter and they are not interchangeable. `32747885644` on `e949cad9`
carries the job results below: it verified every line of code and record this
task changed. The closure commit that adds this file is verified by its own run,
green before integration. Quoting only the latter would attach the task's
evidence to a commit that changed one Markdown file.

```
Framework validation   3633 checks            success
Typecheck              8/8 workspaces         success
Lint (check only)      0 errors               success
API tests              219 suites / 1740      success
Web tests              23 suites / 449        success
Database e2e                                  success
Browser e2e                                   success
CI required gate                              success
```

Locally against the same SHA: all four record validators current
(240 backlog records, 18 tasks, 46 sessions, 21 plans / 181 scenarios), and
`packages/config/forwarded-host.test.js` 14/14.

### The first run is part of the evidence

`32746141086` failed on one check of 3630 — a broken relative link in this
session's own record — while every other required job succeeded. It is recorded
rather than quietly superseded, because *why* it was not caught locally became
ITEM-0093: the link check iterates `git ls-files`, so a record that has not been
staged is invisible to it. `validate:framework` reported **passed, 3629 checks**
on a tree containing the error.

The correction adopted for the rest of this task, and the one worth carrying
forward: **stage before validating.** Doing so moved the count 3631 → 3633.

## Release / Deployment Impact

Not deployed by this task. `ROLLBACK_CLASS: CODE_ONLY` — reverting the commit
restores previous behaviour with no data, schema or configuration state to unwind.

It reaches production on the next ordinary release of `apps/web`. The deployed
behaviour does not change when it does: Vercel sets `VERCEL=1`, which the shared
rule infers as one trusted hop, so the forwarded host still wins there. What
changes is that the app no longer *depends* on that being true.

## Knowledge Capture

- **REG-243** in `docs/qa/regressions/index.md` — the forged-forwarded-host
  regression and the test that stops it returning.
- **QA-TENANT-016** — the reusable scenario, linked to REG-243 and ITEM-0044.
- **EXECPLAN-0003** — why the trust rule moved to `packages/config` rather than
  being copied into `apps/web`.
- `docs/architecture/workspace-routing-and-domains.md` — the "Host header is only
  trusted behind a declared proxy" section now names both surfaces in a table.
  It previously stated the rule as a property of the whole system while being
  true only of the API, and cited an API-only spec as its cover. That is the
  `doc-code-drift` shape, and the correction is annotated as such rather than
  silently edited.
- `docs/environment-variables.md` — `TRUST_PROXY_HEADERS` gains its second
  consumer and its unset/unrecognised behaviour.

The durable lesson, recorded in REG-243's Note: a test suite that proves a
resolver correct proves nothing about whether the middleware calls it, when the
middleware cannot be imported by the suite. The call site has to be asserted from
source, and that assertion has to be mutation-tested or it is decoration.

## Obsidian Sync

`SKIPPED_NO_LOCAL_CONFIG` — no local vault configuration is present in this
worktree, so `sync-obsidian.mjs` has nowhere to publish. The Git-tracked half of
knowledge capture above is complete and is what the vault would be generated
from; `node scripts/generate-dashboards.mjs` ran and rewrote both dashboards.

## Cleanup

Recorded at integration. The `node_modules` junctions
created early in this task were removed with `cmd /c rmdir` (never `rm -rf`,
which would delete the junction target's contents) and the primary checkout's
`node_modules` was verified intact at 989 entries before a real `npm ci` was run
in this worktree instead.

The user's primary checkout was dirty at two paths before this task started —
`apps/landing/next-env.d.ts`, `services/api/prisma/seed-legal.ts` — and was
verified byte-identical to that baseline afterwards: same two paths, same branch,
same HEAD. Nothing there was staged, reverted or committed.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ITEM-0026]] · [[ITEM-0027]] · [[ITEM-0034]] · [[ITEM-0044]] · [[ITEM-0092]] · [[ITEM-0093]] · [[PLAN-003]] · [[QA-TENANT-016]] · [[SESSION-0003]] · [[SESSION-0014]] · [[SESSION-0016]] · [[SESSION-0019]] · [[SESSION-0022]] · [[SESSION-0023]] · [[SESSION-0047]] · [[TASK-0005]] · [[TASK-0010]]

<!-- GRAPH:END -->
