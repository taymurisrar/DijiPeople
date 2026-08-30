# Engineering History — Web app documentation

| | |
|---|---|
| **Task Title** | Deep documentation of `apps/web`, the tenant product |
| **Task Type** | KNOWLEDGE (LARGE) — TASK-0003 |
| **Date** | 2026-08-17 |
| **Architect Plan** | `docs/tasks/TASK-0003-deep-documentation-of-apps-web-the-tenant-product.md`. No separate ExecPlan: no product code, schema or contract changed |
| **Agents Used** | Architect (lead, routing + triage), Frontend (structure/runtime), Reviewer + Backend/API (auth/tenant/proxy/security), UI/UX (settings/branding/a11y), QA + Release/DevOps (testing/CI/env/deployment), Integrator, Knowledge Capture. **Not used:** Database (no schema in scope), Integration (no external boundary in scope) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/knowledge-web-app-documentation` |
| **Base SHA** | `1af3690d8ebe99a14d58d11b6c067286c000c019` |
| **Final Task SHA** | `556bf4007127a297092604af0ca0dbead10eae71` |
| **Target Branch** | `main` |
| **Pull Request** | [#28](https://github.com/taymurisrar/DijiPeople/pull/28) — MERGED |
| **Merge Commit** | `714632dbc85f5583afdd80c79c9b90c3e3aaa6f0` |
| **Final Target SHA** | `714632dbc85f5583afdd80c79c9b90c3e3aaa6f0` |

### Commits

```
556bf40 merge origin/main and renumber colliding record ids (second occurrence)
8a2ba4d docs(knowledge): record the generator-ordering lesson from this branch's CI failure
367aa6b docs: regenerate dashboards stale from the engineering history record
5822c31 docs(knowledge): document apps/web, the tenant product
```

`5822c31` is the body of the work. The three that follow are each a recovery,
and each is worth reading as one:

- `367aa6b` — `Framework validation` failed because the dashboards were
  regenerated *before* the engineering-history record was written, and they count
  those records. Invisible locally because validation was already red on an
  unrelated foreign deletion.
- `8a2ba4d` — the lesson from that, written into the implementation record.
- `556bf40` — `main` advanced during CI and took `BUG-0038` and `ITEM-0033`.

### Worktrees

No task worktree — documentation-only, and `docs/development/git-worktrees.md`
reserves worktrees for genuinely concurrent work. Branch cut in the primary
checkout.

### Files Changed

50 files against `origin/main` — 21 new, 29 modified. Every changed path is
markdown under `docs/`, plus `apps/web/AGENTS.md`, `apps/web/README.md` and
`apps/admin/README.md`. **No product source file was modified.**

**One path was deliberately excluded from every commit:**
`.obsidian-sync.example.json` shows as an unstaged deletion in the working tree.
It **pre-exists this task and belongs to someone else**, so it was never staged —
`git add` was used with explicit paths rather than `-A` for exactly this reason.
Its consequence is recorded under Post-Merge Validation.

## Conflicts

Two rounds, both caused by `main` advancing while this branch sat in CI.

| Files | Type | What each side intended |
|---|---|---|
| `docs/backlog/index.md`, `open.md`, Engineering Dashboard | `GENERATED_ARTIFACT` | Both sides regenerated the same indexes from different record sets |
| `BUG-0038`, `ITEM-0033` | `CONTRACT` (id namespace) | Not a text conflict — both branches independently allocated the same next free ids |

**The id collision is the second occurrence in two tasks.** `new-bug.mjs` and
`new-backlog-item.mjs` allocate from the highest existing id, which makes
collisions impossible between sequential agents and does nothing about concurrent
branches. TASK-0002 hit it once; this task hit it again on the same day. It is no
longer bad luck.

## Conflict Resolutions

**Generated artefacts — regenerated, never hand-merged.** `rebuild-backlog`,
`generate-dashboards` and `rebuild-tasks` were run against the union of both
record sets. Choosing either side by hand produces an index that disagrees with
the records it indexes, which is the one failure these files exist to prevent.

**Id collision — this branch renumbered, not `main`'s.** `main`'s records were
already merged and published to the vault; renumbering them would have broken
links that already exist. This branch was still unmerged and therefore the cheap
side to move: `BUG-0038..0045 → BUG-0039..0046` and
`ITEM-0033..0036 → ITEM-0034..0037`, renamed **descending** so no rename
clobbered its successor.

**What would have been lost by choosing the other side:** `main` owns its own
`BUG-0038` (plan dropdown 405s) and `ITEM-0033` (agent-desktop test runner).
They were excluded by **explicit file selection, not by pattern** — a
find-and-replace across `docs/` would have silently repointed two records this
branch never touched, exactly as it would have in TASK-0002.

Verified after: 716 framework checks, every `BUG`/`ITEM` wikilink in `docs/`
and `.agent/` resolves, 83 records with 0 awaiting triage.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md` — **PASS**, eleven material findings, all triaged |
| **Bug IDs** | Created: BUG-0039 … BUG-0046. BUG-0044 fixed in this task |
| **Backlog Items** | Created: ITEM-0034 … ITEM-0037 |

Four parallel read-only audits were run, split by concern. **Their headline
claims were re-verified independently before becoming records, and three did not
survive unchanged** — a `proxy.ts` line count, a "zero `Tab` handlers" claim
(nine exist; none in a modal, so the conclusion held and the evidence did not),
and a catch-all encoding count (17, not 14). One of my own measurements was also
wrong and was corrected in the same run. All three corrections are recorded in
the QA run rather than quietly absorbed.

## CI

| | |
|---|---|
| **CI Run ID** | `31976933163` |
| **CI Result** | **PASS** — `CI required gate` green on `556bf40` |

## Post-Merge Validation

Run against the merged SHA `714632d`:

```
node scripts/validate-framework.mjs        PASS — 716 checks
node scripts/rebuild-backlog.mjs --check   PASS — 83 records, 0 structural errors
node scripts/rebuild-tasks.mjs --check     PASS — 3 tasks
node scripts/generate-dashboards.mjs --check  PASS — current
node scripts/repo-health.mjs               PASS — MAIN_SYNC_STATUS SYNCED
```

No test suite was re-run: the merged diff touches no executable file.

**Resolved during the run.** For most of this task `validate-framework.mjs`
failed locally on `required path present: .obsidian-sync.example.json`, because
that tracked file was deleted-but-unstaged by the repository owner. It was
verified present in the committed tree, so CI was never affected.

That red check then hid a real one: when the dashboards went stale, the local
count moved from 1 failure to 2 and looked unchanged, so only CI caught it
(`367aa6b`). **A validation that is already failing for a known reason has
stopped being a signal** — the durable form of that lesson is in the
implementation record.

The owner subsequently committed the deletion to local `main`. It is preserved on
`preserve/obsidian-sync-example-deletion` and local `main` now matches
`origin/main`, where validation passes cleanly at 716 checks. See Cleanup.

## Release / Deployment Impact

**None — not deployed.** No product code, schema, migration, environment
variable or contract changed. `DEPLOYMENT_STATUS = NOT_REQUIRED`.
`DEPLOYMENT_DRIFT_STATUS = UNKNOWN` — the repository still cannot read a
deployed SHA ([[ITEM-0010]]).

## Knowledge Capture

Implementation record:
`docs/knowledge/implementations/2026-08-17-web-app-documentation.md`.

New: `docs/knowledge/architecture/web-architecture.md`.
Updated in place: `docs/knowledge/modules/tenant-application.md`,
`docs/knowledge/modules/README.md`.
Documentation corrected: `apps/web/AGENTS.md`, `apps/web/README.md`,
`apps/admin/README.md`.

`FEEDBACK_PROMOTION_STATUS = NOT_REQUIRED` — the user requested the task and made
no correction during it.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran after the merge against
`D:/My Work/hrm-dijipeople/DijiPeople-Vault`. **25 files written — 17 created,
8 updated; 182 already current, 5 withheld** by the empty-note policy. Vault grew
to **229** notes.

**Verified on disk, not from the exit code.** `web-architecture.md` (1,101
words), `tenant-application.md` (698), the implementation record (984) and the
QA run (1,235) all exist at their expected vault paths and are byte-identical to
source. All 8 new bug notes and all 4 new item notes are present. **66 wikilinks
in the two apps/web notes resolve against the vault's actual note and alias set.**

That check is done this way because in TASK-0002 it found six records with no
`aliases:` line, whose short-form links were dead in Obsidian while the sync
reported success.

## Cleanup

No task worktree was created; nothing to remove. Local and remote
`agent/knowledge-web-app-documentation` deleted after verifying it was fully
merged with no unique commits.

**One thing deliberately not cleaned:** local `main` carried an unpushed commit
`4ad266d "Delete .obsidian-sync.example.json"`, authored by the repository owner,
which this task never staged. It was **preserved on
`preserve/obsidian-sync-example-deletion`** before local `main` was reset to
`origin/main`, so nothing was discarded.

It is left for the owner to decide because pushing it would **fail the required
`Framework validation` job**: `validate-framework.mjs` on `origin/main` still
requires that path and the file is present there. Either the requirement goes in
the same commit, or the deletion is reverted.

`STALE_WORKTREES = 1` — `dijipeople-bugs` on `agent/bug-closure-stabilization`,
another agent's merged worktree. Reported, not removed; it is not this task's.
</content>

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0038]] · [[BUG-0039]] · [[BUG-0044]] · [[BUG-0046]] · [[ITEM-0010]] · [[ITEM-0033]] · [[ITEM-0034]] · [[ITEM-0037]] · [[TASK-0002]] · [[TASK-0003]]

<!-- GRAPH:END -->
