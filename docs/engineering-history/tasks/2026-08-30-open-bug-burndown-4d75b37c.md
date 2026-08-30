# Engineering History — Open bug burndown

| | |
|---|---|
| **Task Title** | Open bug burndown |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-30 |
| **Architect Plan** | [`docs/plans/EXECPLAN-0028-plan-entitlement-enforcement.md`](../../plans/EXECPLAN-0028-plan-entitlement-enforcement.md) — written for BUG-1952, the only item in scope that required one under `PLANS.md`. The other 49 records were bug fixes within existing architecture. |
| **Agents Used** | Ten parallel implementation streams, one worktree each: organization, attendance, tenant-settings, leave/approvals, web accessibility & presentation, admin/billing, runtime routing, plan entitlements, audit, and a tail stream (export/import, schema drift, desktop updater). Integration, conflict resolution, the regression register fold, QA scenario generation and the release were done by the coordinating session, not delegated — every cross-stream defect in this record was found at integration, which is precisely where no single stream could have seen it. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` @ `1c711dff` (later merged `c22889ab`) |
| **Task Branch** | `agent/open-bug-burndown` |
| **Base SHA** | `1c711dff` |
| **Final Task SHA** | `4d75b37c5a0360da58aab86d9ab1e90b6b1981ed` |
| **Target Branch** | `develop`, then `main` |
| **Merge Commit** | `855b59418b4b7d18c0b61d4d540ba66282207c76` (PR #58) |
| **Final Target SHA** | `855b5941` on `main`; `4d75b37c` on `develop` |

> The generator computed this section against `origin/main` *after* the merge
> had already landed, so it reported a branch with no commits and no changed
> files. Corrected by hand against the pre-merge `main` at `41a4c532`.

### Commits

128 commits against `main` @ `41a4c532`.

### Files Changed

436 file(s), +27,785 / −4,001. 57 of them are bug records.

## Conflicts

Five, all **semantic overlap between concurrently-fixed defects** rather than
textual collisions, and two of the five did not present as conflicts at all.

1. `apps/web/app/components/runtime/module-quick-create-panel.tsx` — leave vs
   runtime. Leave wrapped saving in a validating `handleSave` (BUG-1965);
   runtime extracted the local `formValues` helper to an importable
   `filterToFormFields` so BUG-2012 could be tested.
2. `apps/web/app/components/runtime/module-related-subgrid.tsx` — leave vs
   runtime, then again webux vs the integration branch. Each side had added a
   different import; later, webux still carried `buildSubgridQuickCreate`
   inline while HEAD had it extracted.
3. `apps/web/app/(authenticated)/_components/attendance-policy-card.tsx` —
   **merged clean and did not compile.** Attendance added a request `payload`
   (BUG-1978); webux added a response `payload`. Two additions at different
   offsets to git; a redeclared block-scoped variable to TypeScript.
4. **Two `main` landmarks** — no conflict marker anywhere. Runtime added
   not-found states carrying their own `<main>` (BUG-2004, BUG-2014); webux
   made the authenticated layout the single owner (BUG-1951).
5. `layout.tsx` and `dashboard-topbar.tsx` — this branch vs `develop`'s own
   "Top menu changes" (`c22889ab`), which restyled the same `h1` BUG-1950 had
   changed to make each page announce itself.

## Conflict Resolutions

1. Kept `handleSave` and pointed it at `filterToFormFields`. The two helpers
   were compared line by line first and are identical — the import *is* the
   local function, extracted. **Taking leave's side would have left a call to
   `formValues`, which the merge itself had deleted**; taking runtime's would
   have dropped the validation gate and reopened BUG-1965.
2. Kept both imports, having confirmed both are used. On the later collision,
   took the extracted version — **but carried across the `singularize(...)`
   call that only webux's inline copy had. Taking HEAD wholesale would have
   reverted BUG-1964 while its record still read FIXED.**
3. Renamed the response one to `responseBody`. Losing either would have lost a
   fix; the naming collision was incidental to both.
4. Both pages became `div`s: the layout owns the landmark. **Choosing the other
   way — leaving the pages their own `main` — would have given two landmarks to
   exactly the pages a screen-reader user is most likely to arrive at from a
   broken link.** BUG-1951's own guard caught this, which is what it is for.
5. Kept `develop`'s styling with BUG-1950's resolved values, and restored
   `contextLabel`, which this branch's hunk had removed while it was still used
   two lines below. **Taking `develop`'s side would have compiled, looked like a
   clean merge, and silently put all 232 authenticated routes back to
   announcing themselves as "Dashboard" — with BUG-1950's record still reading
   FIXED.** That is the single most consequential decision in this task.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record. Verification was by regression suite and mutation test per fix, not by a live QA run — the live tenant app was deliberately not driven, because a failed in-page fetch there raises a blocking modal and writes a row to the production client error log. 46 reusable scenarios were created instead, so the guards this task added are schedulable rather than one-off. |
| **Bug IDs** | **Fixed (47):** BUG-1543, 1548, 1551, 1668, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1962, 1963, 1964, 1965, 1969, 1970, 1974, 1976, 1977, 1978, 1979, 1981, 1986, 2003, 2004, 2005, 2006, 2008, 2009, 2010, 2012, 2013, 2014, 2016, 2017, 2026, 2043, 2044, 2046, 2091, 2206. **Verified (6, previously FIXED but never retested):** BUG-1961, 1967, 1968, 2011, 2015, 2045. **Still open:** BUG-0084 (BLOCKED — needs production duplicate check first), BUG-1980 (partial; remainder belongs to EXECPLAN-0027), BUG-1960 (DEFERRED — does not reproduce against source, but its own retest section requires a live check nobody ran), BUG-1966 (FIXED, not VERIFIED, for the same reason). |
| **Backlog Items** | [[ITEM-0115]] created and triaged as a product decision — `seed:config` provisions four departments with no business unit on every tenant on every deploy, which is the writer BUG-1957 could not name. |

## CI

| | |
|---|---|
| **CI Run ID** | `33285568127` |
| **CI Result** | PASS on `4d75b37c` — all 15 checks, including `CI required gate`, Build, Browser e2e, Database migration gate and Database e2e. |

Two earlier runs failed, both in the same class and both worth recording:
`33282046338` (component index stale — `validate:framework` is one *step* of
that job, not the job) and `33283219567` (`npx eslint` in check-only mode, where
`npm run lint`'s `--fix` had been masking 32 new warnings against a
`--max-warnings=789` ratchet). A local pass is not a CI pass, and the two ways
that is true here are now both written down.

## Post-Merge Validation

Against the merged result, before the push:

- `npm run validate:framework` — 4627 checks passed
- `npm --workspace api run test` — 277 suites, 2337 tests
- `npm --workspace web run test` — 54 suites, 1153 tests
- API and web `check-types` — clean
- `npx eslint "{src,test}/**/*.ts" --max-warnings=789` (services/api) — exit 0, 780 warnings
- `npx eslint` (apps/web) — 0 errors

Against production after the deploy:

- `/api/health` reports `855b594`, first observed 2026-08-30 01:46:48 UTC
- `npm run smoke:deployment` — all checks pass, including outbox worker
  draining, unauthenticated rejection on a protected route, CORS, purchasable
  plans and published legal documents

## Release / Deployment Impact

**Deployed to production.** Merged 01:39 UTC, live at 01:46:48 UTC — roughly
seven minutes, verified at `/api/health` rather than assumed from the merge.

Rollback class: **revert-safe with one exception.** The migration
`20260829150000_department_name_uniqueness_scoped_to_active_rows` replaces a
full unique index on `Department (tenantId, name)` with a partial one over
active rows. It cannot fail forward — the old index is still in force when the
new one is created, so a subset of a unique set is unique — but its rollback is
**not symmetric**: once a tenant has taken back a name freed by this change,
recreating the full index fails until those rows are renamed.

**One thing ships deliberately inert.** Plan entitlement enforcement (BUG-1952)
is live in `REPORT_ONLY`: it logs refusals and allows every request. Moving it
to `ENFORCE` will cut off tenants currently using modules they have not bought.
That is a commercial decision and was left to the platform owner rather than
taken as a side effect of a bug sweep.

## Knowledge Capture

No new `docs/knowledge/` file. The durable lessons from this task are recorded
where they will actually be read: in the regression register entries REG-310 to
REG-359, each of which carries its root cause, its mutation-test evidence and a
Note saying what a future reader should not repeat.

Two are worth naming here because they are about *integration* rather than about
any one defect, and no single register entry owns them:

- **A clean merge is not a correct merge.** Three of the five conflicts in this
  task produced no marker: one failed only under `tsc`, one only under an
  accessibility guard, and one would have compiled, passed every test, and
  silently reverted a fix whose record said FIXED.
- **Parallel agents must commit each fix with its record.** Holding code and
  writing records last meant three interruptions left 5 of 50 records marked
  done while the code for most of them already existed. After switching to
  one-commit-per-bug, the same fleet went from 5/50 to 33/50 in a single cycle.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` was **not** run — this session has no local
vault configuration. `node scripts/generate-dashboards.mjs` did run, rewriting
the Engineering Dashboard, the Product Dashboard and the Engineering Control
Center, all of which are Git-tracked and are in the merge.

## Cleanup

Eleven worktrees were created for this task (`wt-bugfix-main` plus ten
`wt-bf-*`) and are removed via `scripts/remove-worktree.mjs`, which unlinks the
`node_modules` junctions before deleting and verifies the primary checkout
afterwards — `git worktree remove` follows those junctions and has previously
deleted thousands of tracked files from the user's own checkout.

The primary checkout was never written to by any stream and ended clean.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0084]] · [[BUG-1543]] · [[BUG-1950]] · [[BUG-1951]] · [[BUG-1952]] · [[BUG-1957]] · [[BUG-1960]] · [[BUG-1961]] · [[BUG-1964]] · [[BUG-1965]] · [[BUG-1966]] · [[BUG-1978]] · [[BUG-1980]] · [[BUG-2004]] · [[BUG-2012]] · [[BUG-2014]] · [[EXECPLAN-0027]] · [[ITEM-0115]]

<!-- GRAPH:END -->
