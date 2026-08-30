# Engineering History — Landing E2E QA, local and production

| | |
|---|---|
| **Task Title** | End-to-end browser QA of the public landing site, on local and production |
| **Task Type** | QA |
| **Date** | 2026-08-25 |
| **Architect Plan** | NOT_APPLICABLE — a QA run against existing behaviour. No code was changed, so there was nothing for an ExecPlan to sequence. Two of the bugs it found do need plans; those are recorded as `PLAN_REQUIRED` on the records themselves. |
| **Agents Used** | Architect (scope, triage), QA (the run itself), Integrator (rebases, ref-push). Deliberately **not** used: Backend/API, Frontend, Database, Security, UI/UX — none was needed, because nothing was implemented. Release/DevOps was not used because this task does not deploy. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/landing-e2e-qa` |
| **Base SHA** | `42435d59` at branch creation; rebased twice, finally onto `8d88ecb6` |
| **Final Task SHA** | `2e2ef16ad76973e3b496b977c63b30f6730bcf0f` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by fast-forward ref-push, so `develop` equals the CI-verified SHA exactly rather than a merge commit CI never saw. |
| **Final Target SHA** | `2e2ef16a` (`8d88ecb6..2e2ef16a` on `develop`) |

> The generator derived this section against `origin/main` and therefore listed
> 86 files and 25 commits belonging to TASK-0020, TASK-0023 and BUG-1261 — other
> sessions' work that was already on `develop`. It has been corrected to this
> task's own contribution. `main` is untouched (`MAIN_CHANGE_STATUS = UNTOUCHED`,
> baseline `b94c1321`), as it must be for an ordinary task.

### Commits

```
3b1b8c74 qa(landing): drive the public site end to end on local and production
228f5881 qa(landing): regenerate indexes after rebase onto develop
2e2ef16a qa(landing): regenerate session indexes after second rebase
```

### Files Changed

15 files, all documentation and generated indexes. **No product code.**

```
A  docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
A  docs/bugs/BUG-1302-annual-per-seat-price-is-labelled-per-month-on-the-checkout-.md
A  docs/bugs/BUG-1303-the-dp-chk-01-checkout-unavailable-link-writes-a-diagnostic-.md
A  docs/bugs/BUG-1304-production-subscribe-wizard-offers-only-eight-countries-beca.md
A  docs/bugs/BUG-1305-priority-country-sortorder-collides-with-alphabetical-sortor.md
A  docs/bugs/BUG-1306-the-production-footer-publishes-a-reserved-fictional-us-phon.md
A  docs/bugs/BUG-1307-a-raw-monthly-enum-value-appears-in-customer-facing-timeshee.md
A  docs/backlog/items/ITEM-0100-apps-landing-env-examples-omit-next-public-web-root-domain-a.md
A  docs/qa/known-bug-patterns/two-writers-one-field.md
A  docs/qa/scenarios/QA-LANDING-017-…-names-the-period-it-actually-cov.md
A  docs/qa/scenarios/QA-LANDING-018-…-never-displaces-a-partner-referra.md
A  docs/sessions/SESSION-0056-end-to-end-browser-qa-of-the-public-landing-site-on-local-an.md
M  docs/bugs/BUG-0898-…  (re-measured, not duplicated)
M  generated indexes — backlog, sessions, QA, dashboards, remediation inventory
A  docs/engineering-history/tasks/2026-08-25-landing-e2e-qa-2e2ef16a.md  (this file)
```

## Conflicts

Two rebases were needed, because `develop` moved under this branch twice while
CI was running — TASK-0023 and BUG-1261 integrated in the same window. Both
rebases conflicted, and every conflict was of the same type: **generated-index
collision**.

- First rebase (`42435d59` → `5f556842`), 7 files: `docs/backlog/deferred.md`,
  `docs/backlog/index.md`, both dashboards, `docs/sessions/active.md`,
  `docs/sessions/index.md`, `docs/tasks/remediation/TASK-0005-inventory.json`.
- Second rebase (`5f556842` → `8d88ecb6`), overlapping subset, including
  `docs/sessions/index.md` again.

No conflict touched a hand-written record. No conflict touched product code —
there was none to touch.

## Conflict Resolutions

Every conflicted file was resolved by taking `origin/develop`'s side wholesale
(`git checkout origin/develop -- <file>`) and then **re-running the generator**
that owns it, rather than by merging the two sides by hand.

That is the only correct resolution for this file class, and choosing the other
side — or hand-merging — would have lost real work. These indexes are a
projection of every record on the branch. My side contained my seven new records
but not TASK-0023's; develop's side contained TASK-0023's but not mine. Hand-
merging the hunks would have produced a file that looked plausible, matched
neither branch's record set, and then failed `validate-framework` — or worse,
passed it while silently dropping a row. Taking either side and regenerating is
the only path that yields an index derived from the *union*, which is what an
index is supposed to be.

The generators re-run after each rebase: `rebuild-backlog`, `rebuild-sessions`,
`rebuild-qa`, `generate-dashboards`, `remediation:sync`. `validate-framework`
was then run before each push — 3818 checks passing at the final SHA.

Cost of getting this wrong is why it is written down: an index committed without
its generator is the failure this repository already has a rule against, and it
fails CI's Framework validation rather than anything local.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md`](../../qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md) — **PASS WITH RISKS** |
| **Bug IDs** | Created: `BUG-1302` (HIGH, FIX_NOW), `BUG-1303` (HIGH, FIX_NOW), `BUG-1304` (MEDIUM, PLAN_REQUIRED), `BUG-1305` (MEDIUM, PLAN_REQUIRED), `BUG-1306` (LOW, PRODUCT_DECISION), `BUG-1307` (LOW, PRODUCT_DECISION). Updated: `BUG-0898` — re-measured against production rather than duplicated. Closed: none. |
| **Backlog Items** | Created: `ITEM-0100` (INFRA, DEFER). |

27 scenarios were run. 20 passed, 5 failed, 2 were blocked. The two blocked
scenarios are recorded as blocked rather than quietly dropped: the authorised
production test-card purchase (no plan is sellable in the visitor's market) and
local provisioning after payment (the Stripe CLI key is expired and
re-authenticating needs an interactive login this session could not perform).

## CI

| | |
|---|---|
| **CI Run ID** | `32884048763` |
| **CI Result** | PASS — `CI required gate: completed / success`, read on `2e2ef16a`, the exact SHA pushed to `develop` |

An earlier run (`32882626949`) passed on `431607b8`, but that SHA was superseded
by the second rebase. Its verdict was **not** reused; the gate was re-read on
the SHA that actually integrated.

## Post-Merge Validation

`develop` was fetched after the ref-push and its tip confirmed to equal
`2e2ef16a` — the SHA CI passed. Because the integration was a fast-forward, the
merged tree is byte-identical to the CI-verified tree, so the branch verdict
*is* the integrated verdict; there is no merge commit containing code CI never
saw.

`validate-framework.mjs` — 3818 checks, passing — was run against the working
tree at `2e2ef16a` before the push.

Not re-run against the merged SHA: `npm run lint`, `typecheck`, `build`, or any
workspace test suite. This task changed no product code and no build input, so
they would exercise nothing this task touched. Framework validation is the gate
that covers what did change.

## Release / Deployment Impact

None — not deployed. `main` is untouched and this task did not target it.

Two production observations belong here even though this task did not cause
them, because they affect any release decision made next:

- The production API (`api.dijipeople.com`) serves `2609275` and is **16 commits
  behind `main`**. Frontends are current; the API is not.
- Production Stripe is still in `TEST` mode ([[BUG-0903]]), and 34 of 36 prices
  remain unsynced ([[BUG-0898]]).

## Knowledge Capture

- **New bug pattern** — [`docs/qa/known-bug-patterns/two-writers-one-field.md`](../../qa/known-bug-patterns/two-writers-one-field.md).
  Two of this run's findings turned out to be the same shape in unrelated
  modules: one field carrying two meanings, written by two writers that do not
  know about each other, with no reserved space between them. `Country.sortOrder`
  (an alphabetical index colliding with a priority rank) and `?ref=` (a partner
  attribution channel colliding with a support diagnostic). Both fail silently
  and in the safe-looking direction. The pattern names how to catch it: ask who
  else *writes* the field, and test the overlap rather than each meaning.
- **Two promoted QA scenarios** — `QA-LANDING-017` (the estimate names the period
  it covers) and `QA-LANDING-018` (a diagnostic code never displaces a partner
  code). Both are recorded `LAST_RESULT: FAIL` rather than `NOT_RUN`, because
  they have been run and the defects they guard are open.
- No module knowledge file was updated. Nothing was learned about how a module
  *works* that `docs/knowledge/modules/` did not already record — what was
  learned is about a class of defect, which is why it went to the pattern
  library instead.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` then `knowledge:verify` — see the Cleanup
section for the recorded outcome; both were run as part of finalization.

## Cleanup

- Local dev servers (API `:4000`, landing `:3000`) stopped.
- `apps/landing/.env.local` removed — created by this run from the checked-in
  example, did not exist beforehand.
- `services/api/.env` verified **byte-identical** to a pre-task backup. It was
  backed up before any attempt to configure the Stripe webhook, and the attempt
  was abandoned when the CLI key proved expired, so nothing was written.
- Screenshot and snapshot artifacts (`*.png`, `.playwright-mcp/`) removed from
  the primary checkout.
- Primary worktree left `DIRTY_USER_OWNED` with exactly one path,
  `apps/landing/next-env.d.ts` — a Next.js-regenerated file that was already
  modified at session start and is owned by the generator, not by this task.
  `UNEXPLAINED_DIRTY_FILES = 0`.
- Two records were created in **production** by design and both should be
  deleted: a lead from `qa.e2e.20260825@example.com` and partner inquiry
  `PIN-20260825-A52C3788`. They are listed in the QA run's Known Limitations so
  they are not forgotten.
- Task worktree and branch: see the session record.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0898]] · [[BUG-0903]] · [[BUG-1261]] · [[BUG-1302]] · [[BUG-1303]] · [[BUG-1304]] · [[BUG-1305]] · [[BUG-1306]] · [[BUG-1307]] · [[ITEM-0100]] · [[QA-LANDING-017]] · [[QA-LANDING-018]] · [[SESSION-0056]] · [[TASK-0005]] · [[TASK-0020]] · [[TASK-0023]]

<!-- GRAPH:END -->
