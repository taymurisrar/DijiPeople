# Engineering History — Release: promoting the checkout fixes to production, and what deployed

| | |
|---|---|
| **Task Title** | Release: promoting the checkout fixes to production, and what deployed |
| **Task Type** | INFRA |
| **Date** | 2026-08-23 |
| **Architect Plan** | NOT_APPLICABLE — a promotion of an already-verified SHA. No code was written in this session. |
| **Agents Used** | Architect (release classification), Integrator (PR and merge), Release/DevOps (deployment observation). QA re-ran the browser suite against production after the frontends went live. |

## Git

| | |
|---|---|
| **Base Branch** | `main` |
| **Task Branch** | `develop` (promoted directly; a release needs no feature branch) |
| **Base SHA** | `1dd74a25d2cf6179658a3e69e74df096ced79653` |
| **Final Task SHA** | `3960dde555f23f2a71a8ab32b75eba1079663a3f` (`develop`) |
| **Target Branch** | `main` |
| **Merge Commit** | `be486ae1` — a merge commit via PR [#41](https://github.com/taymurisrar/DijiPeople/pull/41), matching how `1dd74a25` was merged. `main` is protected with `enforce_admins`, so a direct push is impossible and a PR is the only route. |
| **Final Target SHA** | `be486ae1` (`origin/main`) |

### Commits promoted

Eleven commits, `1dd74a25..3960dde5`:

```text
78ece817 fix(commerce): a paid customer gets the workspace they paid for
539d99ce test(landing): cover the public surface, and stop a soft 404 being indexed
789eeaca test(e2e): make the paid-customer journey a test, and give the inventory a generator
cbf9090e docs(qa): the go-live run, and a disposition for every finding it produced
1fe662c1 fix(test): assert the pricing rule instead of recomputing the implementation
832ce2b0 test(e2e): a responsive sweep, and defer the history record until it can be true
a92fef5e Merge remote-tracking branch 'origin/develop' into agent/landing-e2e-go-live
3960dde5 docs(history): SESSION-0044 complete — integrated at a92fef5e
```

plus `ae7d2046`, `17e67f8b` and `7b7d0858` from the concurrent
`agent/site-ux-and-admin-fixes` session.

No migrations, no schema change, no lockfile change.

## Conflicts

None. `develop` was a fast-forward descendant of `main`, and the PR reported
`MERGEABLE` / `CLEAN`.

## Conflict Resolutions

Not applicable — see above.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-23-landing-go-live-e2e-789eeac.md`](../../qa/runs/2026-08-23-landing-go-live-e2e-789eeac.md) |
| **Bug IDs** | Shipped to `main`: BUG-0900, BUG-0901, BUG-0902, BUG-0907. **Only BUG-0907 actually reached production** — the other three are API-side and the API did not deploy. |
| **Backlog Items** | None created. |

## CI

| | |
|---|---|
| **CI Run ID** | [32634163128](https://github.com/taymurisrar/DijiPeople/actions/runs/32634163128) on `3960dde5` — the exact SHA merged |
| **CI Result** | PASS — 15 of 15 checks, `CI required gate: success`. Reused on `develop` by [32634726760](https://github.com/taymurisrar/DijiPeople/actions/runs/32634726760) and re-run on the PR, where **Browser e2e also passed** — worth noting because that job is fail-open and its green is evidence rather than a gate. |

## Post-Merge Validation

The browser suite was pointed at production once the frontends were live:

```text
E2E_LANDING_URL=https://www.dijipeople.com E2E_API_URL=https://api.dijipeople.com/api \
  npx playwright test landing-public-surface landing-public-forms
→ 53 passed, 3 skipped, 0 failed  (3.8 min)
```

The three skips are the positive form cases, gated off for a production target
unless `E2E_ALLOW_PROD_WRITES=yes` is set deliberately — the suite will not seed
a live CRM by accident.

Spot checks on the live site:

- `/subscribe` serves the current copy ("Set up your workspace") rather than the
  pre-refactor text it had served for fifteen hours.
- `/legal/not-a-document` returns **404**. It returned `200` with a permanently
  stuck loading shell before. [[BUG-0907]] confirmed fixed in production.
- `/api/health` → `ok`, `commitShort: ef57b2a` — the API is healthy and is *not*
  running this release.

## Release / Deployment Impact

**`MAIN_CHANGE_STATUS = CHANGED`**, correctly — this is a RELEASE. For any other
task type it would be a failed task.

| Target | Result | Commit |
|---|---|---|
| `www.dijipeople.com` | READY | `be486ae1` |
| `app.dijipeople.com` | READY | `be486ae1` |
| `admin.dijipeople.com` | READY | `be486ae1` |
| `api.dijipeople.com` | **`pre_deploy_failed`** | still `ef57b2a` |

### The API failure was predicted, and is non-destructive

[[BUG-0899]]. `render.yaml`'s `preDeployCommand` runs `npm run release`, ending
in `legal:publish --confirm`, which exits 2 because `seed-legal` writes ten
documents declaring themselves drafts and the publisher correctly refuses them.
The deploy log at 11:17:33:

```text
npm error Lifecycle script `legal:publish` failed with error:
npm error code 2
==> Pre-deploy has failed
==> Exited with status 2
```

Render aborts and leaves the previous instance serving, which is the designed
behaviour and why merging was safe. This is the **second consecutive release**
to die here; `1dd74a25` did the same at 00:15.

The consequence is a version skew that should be understood rather than assumed
benign: **production now runs new frontends against a fourteen-commit-old API.**
The suite run above is the evidence that the skew is not breaking the public
surface — every route, every link, the security headers, the crawler contract
and both negative form paths pass against the live pair. It is not evidence
about the authenticated apps, which were not exercised.

### A deployment gap that closed itself

`landing` and `admin` had not produced a *single deployment record* since
`35f263c6` (2026-08-22 19:59), missing both `ef57b2a6` and `1dd74a25`, while
`web` deployed both from byte-identical project settings — same repo, same
credential, same `ignoreCommand`, same production branch. This release triggered
all three normally within seconds of the merge.

So the gap was transient, not a misconfiguration, and an earlier reading of it
as a settings fault was wrong. It remains unexplained and is worth watching on
the next release: two consecutive missed deploys is how a frontend silently
falls behind its API.

Rollback class: low for the frontends (revert the merge, Vercel redeploys the
previous commit); not applicable for the API, which never moved.

## Knowledge Capture

Nothing new was learned about the code — this session wrote none. What it
established is operational and lives in the session record and this file: that
the pre-deploy gate fails identically on every release, that a failed pre-deploy
is genuinely non-destructive, and that the Vercel gap was transient.

The go-live sequence this release does not change is in the QA run's Follow-up
section, and the four blockers are [[BUG-0898]], [[BUG-0899]], [[BUG-0903]] and
[[BUG-0904]]. Order matters: `stripeEnvironment` is baked into each plan price
at sync time, so Stripe must be switched to live *before* the prices are synced,
or all thirty-six become unsellable again.

## Obsidian Sync

Ran as part of the finalisation; `knowledge:verify` reports
`OBSIDIAN_SYNC_STATUS = PASS`.

## Cleanup

- Release branch `agent/release-landing-e2e` carried only the session record;
  merged into `develop` with the documentation commit.
- Local `main` fast-forwarded to `be486ae1` to match the remote. The primary
  checkout stayed on `develop` throughout and was never switched.
- No worktree created for this session — it reused the existing
  `wt-landing-e2e`.
- The user's dev servers on `:3000` and `:4000` were left running and untouched.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0898]] · [[BUG-0899]] · [[BUG-0900]] · [[BUG-0901]] · [[BUG-0902]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-0907]] · [[SESSION-0044]]

<!-- GRAPH:END -->
