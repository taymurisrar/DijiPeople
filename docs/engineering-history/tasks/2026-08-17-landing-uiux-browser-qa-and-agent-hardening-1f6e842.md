# Engineering History — Landing UI/UX browser QA and UI/UX agent hardening

| | |
|---|---|
| **Task Title** | Quick landing UI/UX + browser QA pass, and hardening of the UI/UX agent |
| **Task Type** | UI/UX + QA + FRAMEWORK |
| **Date** | 2026-08-17 |
| **Architect Plan** | NOT_APPLICABLE — `MEDIUM` audit task under [`.agent/context/task-router.md`](../../../.agent/context/task-router.md). No change class in [`PLANS.md`](../../../PLANS.md) applies: no schema, migration, auth or permission change, and no product code touched. |
| **Agents Used** | **UI/UX (lead)**, QA, Frontend (context only, no implementation), Reviewer, Integrator, Release/DevOps. **Database, Backend/API and Integration deliberately not used** — no API, model or boundary was changed. BUG-0065 is an API defect but was only *recorded*, not fixed. |

> **A note on the generated version of this file.** `new-engineering-history.mjs`
> derived its Git section from `origin/main`, which is far behind `develop`, and
> so attributed 1551 changed files and dozens of other sessions' commits to this
> task. It was rewritten by hand against the real base. The script defaulting to
> `origin/main` for a task that targets `develop` is worth fixing; it is recorded
> in Follow-up rather than silently worked around.

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/landing-uiux-qa` |
| **Base SHA** | `a0ceb3f` |
| **Final Task SHA** | `1f6e842` |
| **Target Branch** | `develop` |
| **Merge Commit** | see Integration below |
| **Final Target SHA** | see Integration below |

### Commits

```
1f6e842 fix(framework): make UI/UX participation visible and gated — BUG-0061..0066
```

One commit, 21 files, +2139 / -52. No product code: every path is under
`.agent/`, `docs/` or `scripts/`.

### Changed files

| Area | Files |
|---|---|
| Agent instructions | `.agent/agents/ui-ux.md` (rewritten), `.agent/agents/architect.md` |
| Framework contracts | `.agent/context/agent-handoffs.md`, `.agent/context/task-completion-contract.md` |
| Validation | `scripts/validate-framework.mjs` (+217) |
| New records | `BUG-0061`…`BUG-0066`, `ITEM-0051`, one QA run |
| Updated records | `ITEM-0046` (re-confirmed with new evidence, not duplicated) |
| Generated | backlog indexes, three dashboards, `TASK-0005-inventory.json` |

## Conflicts

`develop` advanced from `f58ee1d` to `a0ceb3f` mid-task — a second session
landed `fix(web): stop route proxies deciding…` while this one was running.
Rebasing produced five conflicts, all in **generated or shared-inventory**
files, none in hand-written prose:

| File | Type |
|---|---|
| `docs/backlog/index.md` | generated index |
| `docs/backlog/open.md` | generated index |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | generated |
| `docs/knowledge/dashboards/DijiPeople Product Dashboard.md` | generated |
| `docs/tasks/remediation/TASK-0005-inventory.json` | shared hand-maintained inventory |

## Conflict Resolutions

Both classes were resolved by **taking `origin/develop` and re-deriving on top**,
never by hand-merging:

- **Generated indexes and dashboards** — took the upstream copy, then re-ran
  `rebuild-backlog.mjs` and `generate-dashboards.mjs`. Hand-merging a generated
  file produces a state no generator would emit, which then fails the next
  validation for reasons nobody can trace.
- **`TASK-0005-inventory.json`** — took upstream's 109 records (upstream had
  added one during the task) and re-applied this task's seven rows
  programmatically, recomputing the summary counts from the merged set rather
  than editing them by hand.

**What would have made it harder:** if the other session had also added rows to
`TASK-0005-inventory.json`, the re-apply would have had to reconcile two
hand-maintained edits to one JSON array. That file has no generator and the
validator requires one row per canonical record, so every task that files a
record must edit it — a shared-write bottleneck between sessions. Recorded in
Follow-up.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md`](../../qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md) — verdict **FAIL** (on the audited surface; this task changed no code) |
| **Bug IDs** | `BUG-0061` (HIGH), `BUG-0062` (HIGH), `BUG-0063` (HIGH), `BUG-0064` (HIGH), `BUG-0065` (MEDIUM), `BUG-0066` (MEDIUM) — all created, none closed |
| **Backlog Items** | `ITEM-0051` created (grouped MEDIUM/LOW findings, `DEFER`); `ITEM-0046` updated with axe evidence |

15 scenarios over 14 routes at three viewports; 9 failed. Evidence came from a
Chromium harness capturing HTTP status, console output, failed requests,
axe-core violations, landmark and heading structure, overflow, tap-target size
and form attributes across 42 route-viewport combinations with 42 screenshots,
plus 15 interaction probes.

## CI

| | |
|---|---|
| **CI Run ID** | see Integration below |
| **CI Result** | see Integration below |

## Post-Merge Validation

Recorded at integration time. Locally, pre-merge: `validate-framework.mjs`
2459/2459 checks; landing jest 49/49; landing `check-types` clean.

The 14 new framework checks were **mutation-tested** — 11 mutations, each
deleting one guarded behaviour; 11 caught, 0 leaked. That step exists because a
check asserting a file merely *mentions* a token keeps passing after the
behaviour it guards is deleted.

## Release / Deployment Impact

None. No product code, no schema, no environment variable, no dependency.
`MAIN_CHANGE_STATUS = UNTOUCHED`. Rollback class: revert the single commit;
nothing deployed depends on it.

## Knowledge Capture

The durable output is the records themselves — six bug records, one backlog
item, one QA run — plus the framework contracts, which are this knowledge in
executable form. The lesson worth carrying beyond them:

**A specialist role whose participation cannot be distinguished from its absence
is not a gate.** UI/UX had a role file, was named in the required-agent matrix,
and was invoked — and still produced nothing the user ever saw, because it had
no status field, no acceptance row and no output schema. The fix was not more
process; it was making the role's output *structurally* visible and its verdict
*capable of failing*.

The secondary lesson is narrower and concrete: **when two comparable surfaces
disagree, the better one is the specification.** Four of the six bugs are cases
where this repository already does the right thing one route away — `/contact`
gets form accessibility right where `/request-demo` does not; `/plans` gets the
unavailable-region empty state right where `/subscribe` does not.

## Obsidian Sync

Recorded at integration time.

## Cleanup

Recorded at integration time.

## Follow-up

- `scripts/new-engineering-history.mjs` derives its base from `origin/main` even
  for a task targeting `develop`, producing a record that misattributes every
  commit between the two. Worth a small fix: take the base from the session
  record, or default to the target branch.
- `docs/tasks/remediation/TASK-0005-inventory.json` has no generator, yet
  `validate-framework.mjs` requires one row per canonical record. Every task
  that files a bug must hand-edit a shared JSON array belonging to another
  task's program, which is a cross-session write conflict waiting to happen.
  Either generate it, or scope the validation to TASK-0005's own records.
- The landing site has no regression coverage at all. Scenarios S4 (overflow),
  S6 (skip link), S7 (mobile menu) and S15 (axe) from the QA run are the
  highest-value durable seeds.
