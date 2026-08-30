# Engineering History — Production url integrity

| | |
|---|---|
| **Task Title** | Production url integrity |
| **Task Type** | BUGFIX (with INFRA hardening) |
| **Date** | 2026-08-16 |
| **Architect Plan** | NOT_APPLICABLE — no ExecPlan written. Under `PLANS.md` this is a localised defect fix with no schema, permission, contract or new-module impact. It does change a shared abstraction (`packages/config`) and touches 28 files, which sits at the boundary; the reasoning, alternatives and rejected options are recorded in BUG-0026 and ITEM-0017 instead, and the change is additive and covered by named regression tests. |
| **Agents Used** | Architect (discovery, root cause, triage), Integration (fix), QA (verification). **Deliberately not used:** Database — no schema change; UI/UX — no visual change beyond a corrected href; Release/DevOps — nothing deployed by this task. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/production-url-integrity` |
| **Base SHA** | `344a83245d9e71184f19d50fc416003a86866020` |
| **Final Task SHA** | `22f8e28962d2aa65f2ac0530c57051496df7b08d` |
| **Target Branch** | `main` |
| **Merge Commit** | `3b779382796ba042d5eb3efc8a60bea8d67e9cea` (PR #8, `--no-ff`) |
| **Final Target SHA** | `3b779382796ba042d5eb3efc8a60bea8d67e9cea` |

### Commits

```
22f8e28 fix: resolve app URLs lazily so validation is the only requirement
9f326e6 docs: resolve the engineering history record for this task
5b602be fix: stop production builds emitting localhost cross-app URLs
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                344a832 [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0   7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-url-integrity  22f8e28 [agent/production-url-integrity]
```

A separate worktree was used because `main` is permanently checked out in the
primary checkout, which also carries unrelated in-flight `gateway/obj` changes.
Three `apps/agent-desktop/src/renderer/*.js` files appeared modified during the
run with **line-ending-only** diffs (LF→CRLF, no content change) — a Windows
checkout artifact, not this task's work. They were restored with
`git checkout --` and are absent from the commit.

### Files Changed

28 file(s) against `origin/main` — 1573 insertions, 70 deletions.

```
.github/workflows/ci.yml
package.json
packages/config/index.js
packages/config/index.d.ts
packages/config/app-urls.test.js                       (new)
scripts/check-no-hardcoded-urls.mjs                    (new)
apps/landing/lib/env.ts
apps/landing/app/_components/site-shell.tsx
apps/landing/.env.production.example
apps/admin/lib/env.ts
apps/admin/lib/tenant-url.ts
apps/web/lib/tenant-resolution.ts
apps/web/proxy.ts
apps/web/app/(public)/partner-login/page.tsx
apps/web/app/(public)/partner-login/partner-login-form.tsx
services/api/src/common/config/tenant-url.config.ts
services/api/src/common/config/tenant-url.config.spec.ts
services/api/src/modules/tenant-domains/tenant-domain.service.ts
docs/  (bug, backlog item, QA run, bug pattern, regression register,
        environment variables, backlog indexes, dashboard, this record)
```

## Conflicts

None. The branch was cut from `origin/main` at `344a832` and merged without
divergence.

## Conflict Resolutions

None — see above.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-production-url-integrity-344a832.md`](../../qa/runs/2026-08-16-production-url-integrity-344a832.md) — **PASS** |
| **Bug IDs** | `BUG-0026` created and closed (`FIXED`, disposition `FIX_NOW`) |
| **Backlog Items** | `ITEM-0017` created (`DEFER`, with reasoning and acceptance criteria) |

Four findings arose during the run beyond the reported defect. Three of them —
F1, F3 and F4 — were **introduced by this change**, and all three share one
lesson: a validator that demands *more* than the deployment needs fails exactly
as loudly as one that demands too little, and each passed every unit test that
existed when it was written. Only building the app for real, with and without,
distinguished them.

- **F1** — the first `resolveAppUrls` demanded `API_ORIGIN`, which a
  browser-facing deployment has no reason to set, so a *correctly* configured
  landing build failed. Fixed within the run.
- **F3** — `resolveAppUrls` resolved eagerly, so reading `.web` also required
  `.admin`, which `REQUIRED_APP_URLS` deliberately does not require for landing.
  A valid build passed validation and then threw at module evaluation, from a
  different place than the validator. Now lazy.
- **F4** — `validateDeploymentEnv` computed `allowedCorsOrigins` eagerly in its
  return value, and deriving it needs all three frontend origins. Fixing F3 was
  not sufficient on its own; the build still failed. Now lazy. Found by
  re-running the build after F3 rather than assuming F3 had settled it.
- **F2** — `buildWorkspaceUrl` retains an internal loopback fallback. Deferred
  rather than fixed: the guard would sit inside hostname resolution (the code
  deciding which tenant a request belongs to, and the subject of BUG-0017), and
  `resolvePlatformEnvironment` treats bare `NODE_ENV=production` as production,
  which the CI build job sets. Unreachable from production code because both
  call sites now pass a `developmentOrigin` resolved through `getAppOrigin`.

## CI

| | |
|---|---|
| **CI Run ID** | `31919569661` (task branch, on `22f8e28`) · `31919938952` (post-merge, on `3b77938`) |
| **CI Result** | **PASS** — `CI required gate` succeeded on `22f8e28`, the exact SHA merged. Run `31919569661`. The one failing job, `Lint services/api`, is **report-only and pre-existing**: its errors are in `auth.service.spec.ts`, `sanitize-error-log.ts` and contract specs, none of which this task touched. `npx eslint` over the three API files this task did change exits 0. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the **merged** SHA `3b77938`, not the task branch:

| Command | Result |
|---|---|
| Post-merge CI on `main` (run `31919938952`) | **PASS** — `CI required gate` success |
| `node scripts/validate-framework.mjs` | **PASS** — 503 checks |
| `npm run backlog:check` | **PASS** — 43 records, 0 structural errors |
| `npm run typecheck` | **PASS** — 8/8 workspaces |
| `npm run test:app-urls` | **PASS** — 16 |
| `npm run test:platform-domains` | **PASS** — 13 |
| `npm run check:no-hardcoded-urls` | **PASS** |
| `npm --workspace api run test -- --testPathPatterns "tenant-url.config.spec|tenant-domain"` | **PASS** — 4 suites, 52 tests |

## Release / Deployment Impact

**Not deployed by this task.** `ROLLBACK_CLASS = CODE_ONLY` — no migration, no
data change, no external contract change.

**Action required before the next production deploy of any frontend.** The
stricter validation makes the canonical app URLs mandatory in production, so a
Vercel/Render project missing one will now **fail its build** instead of shipping
a dead link. That is the intended behaviour, but it surfaces as a failed deploy.
The required variables per deployment are tabulated in
[`docs/environment-variables.md`](../../environment-variables.md).

Deployments outside Vercel and Render must additionally set `APP_ENV=production`,
or the checks stay disarmed — `isProductionLike()` does not treat bare
`NODE_ENV=production` as production, deliberately, so local builds and CI keep
working.

## Knowledge Capture

- [`docs/qa/known-bug-patterns/silent-config-fallback.md`](../../qa/known-bug-patterns/silent-config-fallback.md)
  (new) — the generalisable failure mode: a configuration read ending in a
  development-shaped literal, why Next.js build-time inlining makes it
  unrecoverable at runtime, and the two-test requirement (validation **and**
  source scan) since a literal is invisible to environment validation.
- [`docs/qa/regressions/index.md`](../../qa/regressions/index.md) — `REG-016`.
- [`docs/environment-variables.md`](../../environment-variables.md) — the
  canonical app URL contract and what counts as production.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran against the merged state — 104 files written, 30 already current, 5 skipped as empty, 0 mappings with no source. `.obsidian-sync.local.json` lives only in the primary checkout (it is gitignored); it was copied into the task worktree for the run and removed afterwards.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-url-integrity` removed after the
merge, verified clean first. Branch `agent/production-url-integrity` retained on
the remote — PR #8 references it, and it is fully merged.

The primary checkout at `D:/My Work/hrm-dijipeople/DijiPeople` was **not**
updated. Its `main` is behind `origin/main` and its working tree carries
unrelated in-flight `gateway/**/obj` changes that are not this task's to touch.
`git pull` there is the owner's call.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0017]] · [[BUG-0026]] · [[ITEM-0017]]

<!-- GRAPH:END -->
