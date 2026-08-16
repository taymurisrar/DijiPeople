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
| **Final Task SHA** | `5b602be01edb77d2c1892eb10d1741bf6b244adc` |
| **Target Branch** | `main` |
| **Merge Commit** | see Merge below |
| **Final Target SHA** | see Merge below |

### Commits

```
5b602be fix: stop production builds emitting localhost cross-app URLs
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                344a832 [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0   7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-url-integrity  5b602be [agent/production-url-integrity]
```

A separate worktree was used because `main` is permanently checked out in the
primary checkout, which also carries unrelated in-flight `gateway/obj` changes.
Three `apps/agent-desktop/src/renderer/*.js` files appeared modified during the
run with **line-ending-only** diffs (LF→CRLF, no content change) — a Windows
checkout artifact, not this task's work. They were restored with
`git checkout --` and are absent from the commit.

### Files Changed

28 file(s) against `origin/main` — 1372 insertions, 63 deletions.

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

Two findings arose during the run beyond the reported defect:

- **F1** — the first implementation of `resolveAppUrls` demanded `API_ORIGIN`,
  which a browser-facing deployment has no reason to set, so a *correctly*
  configured landing build failed. Every unit test passed at that moment; it was
  caught only by running the real production build. Fixed within the run and
  pinned by a named regression test.
- **F2** — `buildWorkspaceUrl` retains an internal loopback fallback. Deferred
  rather than fixed: the guard would sit inside hostname resolution (the code
  deciding which tenant a request belongs to, and the subject of BUG-0017), and
  `resolvePlatformEnvironment` treats bare `NODE_ENV=production` as production,
  which the CI build job sets. Unreachable from production code because both
  call sites now pass a `developmentOrigin` resolved through `getAppOrigin`.

## CI

| | |
|---|---|
| **CI Run ID** | `31919063832` |
| **CI Result** | see Merge below — read on `5b602be`, the exact SHA merged |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Recorded in the final report against the merged SHA.

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

Recorded in the final report.

## Cleanup

Recorded in the final report.
