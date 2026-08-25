# Engineering History — Agent UI perception

| | |
|---|---|
| **Task Title** | Agent UI perception: browser control, component knowledge, UI review skill |
| **Task Type** | FRAMEWORK (recorded as FEATURE on [[TASK-0022]]; it ships capability, but every file it touches is agent infrastructure) |
| **Date** | 2026-08-25 |
| **Architect Plan** | [`docs/tasks/TASK-0022-…`](../../tasks/TASK-0022-agent-ui-perception-browser-control-component-knowledge-ui-r.md) — four work packages. No ExecPlan under `PLANS.md`: no schema change, no destructive migration, no auth or permission change |
| **Agents Used** | Architect (routing, decomposition, ITEM-0098 triage), Knowledge & Graph (WP-01, WP-02), UI/UX (WP-01 doc-comment, WP-04), QA + Release/DevOps (WP-03), Integrator (merge). **Deliberately not used:** Database (no schema surface), Security (no auth path changed — the one security-relevant decision, refusing non-local origins in `save-auth.mjs`, is recorded below), Backend/API (no service touched) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/agent-ui-perception` |
| **Base SHA** | `2d6097241c5cba12e010cec235ecdd6b1eb32f0d` |
| **Final Task SHA** | `c4035dbb35cdbfadb7d321ef6e6692602850f80c` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `develop` was still at the base SHA when the verdict returned, so the integration was `git push origin c4035dbb:refs/heads/develop` |
| **Final Target SHA** | `c4035dbb35cdbfadb7d321ef6e6692602850f80c` — identical to the CI-verified SHA, which is the point of the ref-push |

> The generator filled this section against `origin/main`, because that is its
> default base. Corrected here: this is an ordinary task, it targeted `develop`,
> and `main` was never touched. `MAIN_CHANGE_STATUS = UNTOUCHED`.

### Commits

```
0e224a69 feat(framework): component knowledge an agent can actually retrieve
c4035dbb feat(framework): give agents a browser they can drive, and a procedure for it
```

### Files Changed

**28 file(s) against the task's own base**, `2d609724`.

> The generated list showed 33 against `origin/main`. The extra five —
> a release record, SESSION-0049, TASK-0021 and two others — belong to tasks
> already merged into `develop` and are not this task's work. Counting a
> diff against the wrong base is how a record overstates what a change did.

```
A  .agent/context/component-index.md          generated component index
A  .agent/skills/ui-review.md                 the review procedure
A  .mcp.json                                  Playwright MCP server
A  docs/development/browser-control.md        setup and honest limits
A  e2e/tools/save-auth.mjs                    session capture, local-only
A  scripts/generate-component-index.mjs       the harvester
A  scripts/lib/knowledge-terms.mjs            term normalisation
A  scripts/knowledge-terms.test.mjs           its mutation tests
A  docs/backlog/items/ITEM-0098-…             undocumented-export measurement
A  docs/tasks/TASK-0022-…                     the plan
A  docs/sessions/SESSION-0051-…               the session
M  scripts/retrieve-knowledge.mjs             scoring now spelling-aware
M  .agent/agents/ui-ux.md                     Stage 2 points at the skill
M  .agent/skills/README.md                    stale "blocked" row corrected
M  .github/workflows/ci.yml                   two checks added to Framework validation
M  apps/admin/…/module-action-bar.tsx         doc-comment added (comment only)
M  docs/development/browser-e2e.md            cross-link to the sibling doc
M  e2e/.gitignore                             .auth/ excluded
M  package.json                               components:*, test:knowledge-terms, browser:auth
   … plus 9 regenerated index and dashboard files
```

## Conflicts

None. `origin/develop` was still at `2d609724` when the verdict returned — the
same SHA the branch was cut from — so the integration was a fast-forward.

Checked rather than assumed: `git rev-list --count 2d609724..origin/develop`
returned 0 immediately before the push.

## Conflict Resolutions

Not applicable — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | None. No QA run record was created: this task ships an agent capability, not a product surface, and the only product file it touches is a comment. The capability's own first real use is the QA of it, and `ui-review.md` is marked unproven in the skills README for that reason |
| **Bug IDs** | None created, none closed |
| **Backlog Items** | [[ITEM-0098]] created — 753 of 846 shared frontend exports carry no doc-comment. Triaged by the Architect the same day: `DEFER`, document-on-touch, explicitly not a bulk authoring sweep |

## CI

| | |
|---|---|
| **CI Run ID** | `32831998225` |
| **CI Result** | PASS — `REMOTE_CI_STATUS = PASS for c4035db` |

Read on the exact SHA that was merged. The poll hit six consecutive HTTP 502s
from the GitHub API before succeeding; `await-ci.mjs` retried through them and
returned a real verdict rather than a timeout, which is the behaviour that
distinguishes it from polling by hand.

## Post-Merge Validation

Run against the merged SHA in the task worktree, which is byte-identical to
`origin/develop` at `c4035dbb`:

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | PASS — 3738 checks |
| `node --test scripts/knowledge-terms.test.mjs` | PASS — 8/8 |
| `node scripts/generate-component-index.mjs --check` | PASS — index current, 93 documented exports |
| `npm --workspace admin run check-types` | PASS |
| `npm --workspace admin run lint` | PASS — 0 errors, 2 warnings, both pre-existing in files this task did not touch (`runtime-module-list.tsx:923`, `auth-cookies.ts:69`) |
| `npm --workspace e2e run check-types` | PASS |

Two verifications worth recording because they are the kind usually skipped:

- **The MCP configuration was verified by speaking MCP to it**, not by reading
  it. The committed `.mcp.json` starts the server and lists 24 tools. A config
  that parses is not a config that works.
- **Both new checks were mutation-tested.** `generate-component-index --check`
  fails on a mutated output *and* on a mutated source doc-comment; the
  knowledge-terms spec fails 1 case when max becomes sum and 3 when the
  space-join is dropped. A check that only passes is not evidence.

## Release / Deployment Impact

None — not deployed. Nothing in this task reaches a runtime: no API, no app
bundle, no schema, no environment variable. `.mcp.json` and `.agent/` are read
by developer tooling only, and the single `apps/admin` change is a comment.

`DEPLOYMENT_STATUS = NOT_REQUIRED` (no runtime surface changed).
`MAIN_CHANGE_STATUS = UNTOUCHED`.

## Knowledge Capture

- [`docs/knowledge/framework/agent-ui-perception-2026-08-25.md`](../../knowledge/framework/agent-ui-perception-2026-08-25.md)
  — category `framework`. Records the three findings worth carrying: that the
  component knowledge was present and only unretrievable; that a generated
  index must report what it omits; and that browser control without retrieval
  produces description rather than review.

The fourth finding is recorded in the skills README rather than here, because
it is a correction to a standing document: **a "blocked pending tooling" entry
is an environment fact wearing a decision's clothes, and environment facts
expire.** That row had been false for months.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran: **122 notes written, 618 already current,
6 skipped as empty.** This task's own notes — the framework knowledge note,
[[TASK-0022]], [[ITEM-0098]] and SESSION-0051 — all published and verified
clean.

`knowledge:verify` then reported **`OBSIDIAN_SYNC_STATUS = FAILED` on three
problems, none of them this task's**, checked against the task diff rather than
assumed:

| Problem | Owner |
|---|---|
| `08 - Releases/…/2026-08-24-production-6ed7a44.md` — wikilink `[[merging-main-does-not-guarantee-deploy]]` resolves to no vault note | A release record from a prior task. The target is an *agent memory* slug, not a repository note, so the link could never have resolved |
| `ITEM-0091` — GRAPH_ORPHAN, no inbound or outbound wikilink | Last written by `004ee666`, on the in-flight branch `agent/release-landing-e2e` |
| `00 - Home/Generated/Tasks/blocked.md` — STALE_GENERATED_NODE | A generated index whose source is empty of substance |

**Left untouched deliberately.** Two belong to another session's live work, and
`ORPHAN_GENERATED_NODE`-class findings in this vault are routinely cross-branch
records rather than damage — deleting them destroys work in flight. Fixing
another task's record to make this task's verification read green would be the
worst available trade.

Capped per the script's own instruction:
**`OBSIDIAN_SYNC_STATUS = COMPLETE_WITH_DOCUMENTATION_WARNING`.**

## Cleanup

- Task worktree `D:/My Work/hrm-dijipeople/DijiPeople-agent-ui-perception`
  removed, and its junctioned `node_modules` removed with `cmd /c rmdir`
  (never `rm -rf`, which would delete the primary's dependency tree through
  the link).
- Local branch `agent/agent-ui-perception` deleted; `origin/agent-ui-perception`
  retained, since it carries the SHA the CI verdict names.
- Session SESSION-0051 closed, `STATUS: COMPLETE` set on the record by hand —
  `session.mjs finish` does not write it, and a stale ACTIVE record fails the
  next session that takes the same branch.
- Primary checkout left exactly as found: `apps/landing/next-env.d.ts` and
  `services/api/prisma/seed-legal.ts` were dirty before this task started and
  are neither staged, reverted nor committed. They are the user's.
