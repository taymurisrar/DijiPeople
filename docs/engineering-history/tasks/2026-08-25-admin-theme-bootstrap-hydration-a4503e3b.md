# Engineering History — Admin theme bootstrap hydration mismatch

| | |
|---|---|
| **Task Title** | Admin theme bootstrap hydration mismatch |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-25 |
| **Architect Plan** | NOT_APPLICABLE — no change class in [`PLANS.md`](../../../PLANS.md) applies. No schema change, no migration, no auth or permission surface, no new module. The code change is where one existing element is rendered inside one root layout. |
| **Agents Used** | Architect (routing, triage, disposition), Frontend (the layout change and the spec), QA (browser reproduction, REG-251, QA-PLATFORM-022), Reviewer (self-review against the Security checklist — no security surface touched), Integrator (branch, worktree, CI verdict, ref-push to `develop`), Knowledge & Graph (pattern occurrence, module knowledge, `apps/admin/AGENTS.md` rule), Product & Backlog Steward (BUG-1261, indexes, remediation inventory). Not used: Backend/API, Database, Security, Integration, Release/DevOps — nothing server-side, no schema, no secret or permission surface, and this targets `develop` and deploys nothing. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-theme-bootstrap-hydration` |
| **Base SHA** | `42435d59d40bcbc6cd9a9dc7bc546459bc6ad79f` — the value the generator wrote here was `a4503e3b`, because it resolved `origin/develop` *after* the ref-push had already moved it. Corrected by hand; a base SHA equal to the head SHA describes no work. |
| **Final Task SHA** | `a4503e3b3d1b2037d7e6db0f000189d718df61ec` |
| **Target Branch** | `develop` — ordinary task, so `main` stays untouched (`MAIN_CHANGE_STATUS = UNTOUCHED`, baseline `b94c1321`). |
| **Merge Commit** | None — integrated by ref-push, `git push origin agent/admin-theme-bootstrap-hydration:develop`, so `develop` fast-forwards to the exact SHA CI verified. A merge commit would be a SHA no CI run has seen. |
| **Final Target SHA** | `a4503e3b3d1b2037d7e6db0f000189d718df61ec` — identical to the final task SHA. |

### Commits

```
a4503e3b fix(admin): move the theme bootstrap out of head, where extensions live
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            393d3e46 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-hydration            a4503e3b [agent/admin-theme-bootstrap-hydration]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/DijiPeople-dlp2                       b8018b76 [agent/dlp-go-live]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-landing-e2e-qa                     42435d59 [agent/landing-e2e-qa]
```

Two other sessions moved during this task — `DijiPeople-dlp2` advanced and
`wt-landing-e2e-qa` appeared — which is the expected condition here, not an
anomaly. Neither touches `apps/admin`; `session.mjs check` classified this work
`SAFE_PARALLEL` before it started and no lease was needed.

### Files Changed

21 file(s) against `42435d59`.

```
 apps/admin/AGENTS.md                                 |   9 +
 apps/admin/app/layout.tsx                            |  38 ++--
 apps/admin/lib/console-theme-bootstrap.spec.ts       |  33 +++-
 docs/backlog/completed.md                            |   1 +
 docs/backlog/index.md                                |   7 +-
 docs/bugs/BUG-1261-…-runs-in-head-where-react-hy.md  | 199 +++++++++++++++++++
 docs/knowledge/dashboards/DijiPeople Engineering…    |   5 +-
 docs/knowledge/dashboards/Engineering Control Ce…    |   6 +-
 docs/knowledge/modules/platform-admin.md             |   9 +
 docs/qa/coverage-matrix.md                           |   2 +-
 docs/qa/known-bug-patterns/divergent-duplicate-g…   |  29 +++
 docs/qa/regressions/index.md                         |  17 +-
 docs/qa/scenarios/QA-PLATFORM-015-…-first-.md        |   6 +-
 docs/qa/scenarios/QA-PLATFORM-022-…-writes.md        |  97 ++++++++++
 docs/qa/scenarios/index.md                           |   3 +-
 docs/qa/test-plans/PLAN-019-platform-admin.md        |   2 +-
 docs/qa/test-plans/index.md                          |   4 +-
 docs/sessions/SESSION-0055-…-hydration-mismatch-i.md |  44 +++++
 docs/sessions/active.md                              |   4 +-
 docs/sessions/index.md                               |   6 +-
 docs/tasks/remediation/TASK-0005-inventory.json      |  44 ++++-
 21 files changed, 533 insertions(+), 32 deletions(-)
```

Three of those are source; the rest are records and the indexes they regenerate.

A second commit follows on `develop` and is not counted above, because it could
not exist earlier: this record, the completed session record, [[ITEM-0099]], and
the corrected `apps/web` comment. Seven fields here — the merge outcome, the
final target SHA, the CI verdict on the merged SHA, post-merge validation, the
Obsidian result and the cleanup — are facts about the merge, so a history record
written before it would have had to guess at them.

## What was wrong

A user report: every full load of the admin console logged React's
"A tree hydrated but some attributes of the server rendered HTML didn't match the
client properties", pointing at `app/layout.tsx:66` — our own inline theme
bootstrap.

The diff React printed contained the answer and it was easy to read past. The
server side was ours (`__html: "(function(){try{…"`, `id="admin-theme-bootstrap"`);
the client side was `src="chrome-extension://lgblnfidahcdcjddiepkckcfdhpknnjh/content/popups-script.js"`.
React had not found our script changed. It had hydrated our script element onto
a **different node entirely** — one a browser extension inserted at the top of
`<head>` before React loaded.

React's own message lists "a browser extension installed which messes with the
HTML" among its causes, and stopping there would have been wrong in the other
direction: the app puts an inline `<script>` in a container it does not own and
cannot police, which is a placement decision, and placement decisions are ours.

## What was done

`apps/admin/app/layout.tsx` — the bootstrap is now the first child of `<body>`,
and the layout renders no `<head>` element at all. The script stays inline and
blocking, because it resolves `prefers-color-scheme` before the first paint and
anything deferred runs after the paint it exists to precede — [[BUG-0495]]
settled that and none of it changed. The first child of `<body>` still precedes
the paint, because nothing below it has been parsed when it runs.

`<body>` gained `suppressHydrationWarning`. Extensions stamp their own attributes
there too — Grammarly, password managers, translation tools — that is not a
mismatch this app can prevent, and a warning nobody can act on is a warning they
learn to ignore.

`apps/admin/lib/console-theme-bootstrap.spec.ts` — the placement is now asserted:
no `<head>` element, the script matched as the first thing inside `<body>`, and
its id ahead of `{children}`; plus the body suppression. Ten cases, all passing;
two of them fail when the script is put back into `<head>`.

## The part worth keeping

`apps/web` had already met this. Its layout has carried, since before this
console's bootstrap was written:

> Placed as the first child of `<body>`, not in `<head>`: Next owns `<head>` in
> the App Router, and browser extensions inject their own scripts there, which
> React then tries to reconcile against ours and reports as a hydration
> mismatch.

That paragraph is correct, well-written, and constrained exactly one file.
`apps/admin`'s bootstrap was written afterwards, by someone who had either not
read it or not thought it applied, and put the script in `<head>`.

This is the second time the platform-admin module knowledge has recorded that
shape — [[BUG-0008-session-expired-sign-in-again-returned-405]] already says
"**`apps/web` already handled it correctly and hid the gap** — the two apps
diverge silently, which is the standing lesson here." So the lesson is not new
and the recording of it was not enough. What is new is where it now lives:

- a spec that **fails**, in the app that has to follow the rule;
- a bullet in `apps/admin/AGENTS.md`, which is instruction rather than prose;
- an occurrence under [`divergent-duplicate-guard`](../../qa/known-bug-patterns/divergent-duplicate-guard.md),
  extended to cover duplicated *decisions* and not only duplicated *rules*.

**A rule that exists only as a comment reaches exactly the file it is written
in.** The two apps deliberately do not share a root layout, so consolidation —
the fix the three earlier occurrences of that pattern got — is not available
here. A test is.

While closing this out, the same sweep found the counterpart drift in `apps/web`
itself: the doc comment on its `THEME_BOOTSTRAP_SCRIPT` still said the script
"has to execute synchronously in `<head>`", twenty lines below the placement
comment quoted above saying it must not be there. Corrected, because that
sentence is precisely what would send the next author to move the tag back.

## Conflicts

None. The branch was cut from `origin/develop` at `42435d59`, `develop` had not
moved when the work finished, and the integration was a fast-forward.

## Conflict Resolutions

None — see above. Nothing was chosen over anything else because nothing
competed.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record. Verification was a browser reproduction executed during the fix and written into [[QA-PLATFORM-022]] and REG-251 rather than a separate run — a run record for a single scenario with no other scope would duplicate them. |
| **Bug IDs** | [[BUG-1261]] — created from the user report, root-caused, fixed and closed `VERIFIED` in this task. |
| **Backlog Items** | [[ITEM-0099]] — created while verifying the Obsidian sync, and triaged DEFER the same day. Not this task's defect and not this task's record to edit; see Obsidian Sync below. |

The reproduction is the part worth naming. A real browser extension is not
available to CI or to a scripted check, but what the extension *does* is one DOM
insertion at `document_start`, and that is reproducible:

```js
await page.addInitScript(() => {
  const s = document.createElement("script");
  s.src = "chrome-extension://lgblnfidahcdcjddiepkckcfdhpknnjh/content/popups-script.js";
  document.head.insertBefore(s, document.head.firstChild);
});
```

Run against `next dev --webpack` on port 3102, with the layout toggled between
the two placements on the **same running server**, so nothing but the placement
differed:

- script in `<head>` → the reported hydration error, `parentElement` `HEAD`;
- script first in `<body>` → no hydration message, `parentElement` `BODY`;
- in both, `document.head.firstElementChild` is the extension's script — the
  injection was present either way, which is what makes it a control and not a
  demonstration.

With `dp-admin-theme=dark`, the fixed layout resolves `data-admin-scheme="dark"`,
`data-admin-theme="dark"` and paints `rgb(11, 18, 32)`. The fix does not cost
what [[BUG-0495]] bought, which was the only real risk in moving it.

One expected side effect is recorded in [[QA-PLATFORM-022]] so a future run does
not report it as a regression: an inline `<script>` inside a React component
draws an `info`-level Next advisory that scripts rendered on the client are never
executed. It is correct and harmless — this script runs during document parse,
and client-side navigation is `ConsolePreferencesApplier`'s job — and it replaced
a console `error` with an `info`.

## CI

| | |
|---|---|
| **CI Run ID** | `32877520941` |
| **CI Result** | PASS — `SUCCESS CI (32877520941)`, read on `a4503e3b`, the exact SHA that was pushed to `develop`. All fourteen jobs behind `CI required gate` succeeded. |

## Post-Merge Validation

`develop` fast-forwarded to `a4503e3b`, so the merged SHA and the CI-verified SHA
are the same object and run `32877520941` is a verdict on the integrated result,
not only on the branch. Re-confirmed after the push:

- `git rev-parse origin/develop` → `a4503e3b3d1b2037d7e6db0f000189d718df61ec`
- `npm --workspace admin run test` — 30 suites, 241 tests, pass
- `npm --workspace admin run check-types` — pass
- `npm --workspace web run test` — 23 suites, 449 tests, pass
- `npm run validate:framework` — 3776 checks, pass
- `npm run qa:check`, `npm run backlog:check`, `npm run sessions:check` — pass
- `npm --workspace admin run lint` — 0 errors; 2 warnings, both pre-existing and
  in files this task did not touch (`runtime-module-list.tsx`, `auth-cookies.ts`)
- `npx prettier --check` on both changed source files — clean

`npm run db:preflight` was **not run** and is `NOT_REQUIRED`: no query, model,
migration or generated client is involved, and the change cannot reach the
database.

## Release / Deployment Impact

None — not deployed. This targets `develop`; `main` is untouched and no
environment changes. When it does reach production with the next release, the
rollback class is trivial: one element moves back, and the console's behaviour is
identical either way because the script has already executed by the time React
runs.

## Knowledge Capture

- `docs/knowledge/modules/platform-admin.md` — [[BUG-1261]] added under "Where it
  has actually broken", named as the second occurrence of the standing lesson
  already recorded there.
- `docs/qa/known-bug-patterns/divergent-duplicate-guard.md` — REG-251 added to
  Occurrences, with a section on what it extends: the first three occurrences
  duplicated a *rule*, this one duplicates a *decision*, and the pattern's usual
  fix (consolidate) is unavailable when two apps deliberately own separate root
  layouts.
- `apps/admin/AGENTS.md` — a UI requirement making the placement an instruction
  rather than a comment.
- REG-251 in the regression register; REG-198's scenario line corrected, since it
  asserted the script runs in `<head>` and that is no longer true.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran — 31 note(s) written on the first pass and 7
on the second, no manual note touched. `npm run knowledge:verify` reads the vault
back and, at the end, reports `OBSIDIAN_SYNC_STATUS = PASS`: every mapped note
exists, carries substance, matches its source, and every generated wikilink
resolves. 755 generated notes, zero on every counter.

It reported `FAILED` first, and how that was handled is the part worth recording.
The failure was two reports of one wikilink — `TASK-0020` linked
a double-bracketed `EXECPLAN-nnnn`, and `sync-obsidian.mjs` does not map `docs/plans/` into the
vault, so the note that link named was never written. Every other counter was
already zero.

It was **pre-existing**: `git show 42435d59:docs/tasks/TASK-0020-…` already
contains it, and `42435d59` is the commit this branch was cut from. CI had passed
on it, because the check reads a vault that does not exist on a runner — so this
is a check that only ever runs locally, and it was red for every local task from
the moment `42435d59` landed.

Three things were done rather than one. The finding became a record ([[ITEM-0099]])
instead of a sentence in this report. The two wikilinks were corrected to relative
markdown links, because ExecPlans are not published to the vault and a wikilink to
one is wrong by the system's current design — the same reason a REG id is not a
wikilink. And the larger question the fix does *not* answer — whether `docs/plans/`
should be in the vault at all — stays open and DEFERRED in [[ITEM-0099]], because
that is a scope decision and not a link repair.

TASK-0020 is DONE, so no live work was edited. Nothing here was silent: it is in
the record, in this section, and in the closure commit message.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-admin-hydration` removed and the
local branch deleted after integration; `origin/agent/admin-theme-bootstrap-hydration`
left in place. `node_modules` in that worktree were NTFS junctions to the primary
checkout's, never copies, so removing it took nothing else with it. The primary
checkout ends with the one path it started with — `apps/landing/next-env.d.ts`,
recorded as the `--primary-baseline` before this task created its branch.
