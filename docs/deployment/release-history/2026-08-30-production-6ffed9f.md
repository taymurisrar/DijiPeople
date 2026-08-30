# Release — production — `6ffed9f`

| Field | Value |
|---|---|
| **Environment** | production |
| **Date** | 2026-08-30, merged via PR #60 |
| **Release SHA** | `6ffed9fa` |
| **Source Branch** | `develop` (`aa3f6432`) → `main` via PR #60. `main` at `ec1d58da` was a direct ancestor — 16 commits, no divergence. |
| **Components** | **API** (Render `srv-d7js7fqqqhas739v4i7g`) and **tenant web** (Vercel `diji-people-web`). Both rebuilt because both trees changed. Admin and landing were not rebuilt — `git diff ec1d58da..6ffed9fa -- apps/admin apps/landing` is empty. |
| **Migration Status** | NOT_APPLICABLE — no diff under `services/api/prisma/migrations`. Zero migrations in the range. |
| **Configuration Status** | NOT_APPLICABLE — no new environment variable, no `render.yaml` or `turbo.json` change. |
| **Deployment Sequence** | Merge at 17:25 UTC. Render: `build_in_progress` → `pre_deploy_in_progress` → `update_in_progress` → `live` at 17:32:08, about 7 minutes. Vercel built `diji-people-web` to `Ready` in 1m. Neither was triggered by hand; both fired on the merge. |
| **Smoke Test Results** | **PASS.** `smoke-deployment.mjs` against `https://api.dijipeople.com/api`: health, served commit, outbox worker draining, unauthenticated profile refused, CORS accepted, a launched market has a purchasable plan, legal documents published, Stripe webhook secret configured, tenant workspace host resolves. Authenticated checks skipped — no SMOKE_LOGIN credentials in this environment. |
| **Monitoring/Health Results** | `/api/health` reports `6ffed9f`, status ok, outbox worker enabled — confirmed on three consecutive requests. `app.dijipeople.com` and `admin.dijipeople.com` return 307 to login (serving, correctly refusing anonymous); `www.dijipeople.com` returns 200. Render reached `live` at 17:32:08 UTC and health flipped at 17:32:55 — a 47-second lag, so `live` alone is not proof. |
| **Incidents** | None. |
| **Rollback Classification** | NOT_REQUIRED unless the health check fails. No schema change, so rollback is a redeploy of `ec1d58da` with no data implications. |
| **Rollback Result** | NOT_APPLICABLE. |
| **QA Report** | No dedicated run. Every commit in the range passed its own exact-SHA `CI required gate` before integration, and PR #60's gate passed on the merge candidate. |
| **Backlog/Bug References** | [[BUG-2334]], [[BUG-2335]], [[BUG-2384]], [[BUG-2413]], [[ITEM-0116]], [[ITEM-0117]]. |
| **Engineering History** | [[SESSION-0081]], [[SESSION-0083]]. |
| **Final Verdict** | **PASS.** |

## What changed for an operator

| | Before | After |
|---|---|---|
| Tenant record, readiness panel | "Tenant Owner — 1 active Tenant Owner", beside a header reading "Primary Tenant Owner: Unassigned" | **"Owner access — 1 account can administer this workspace"**, so the two facts no longer read as a contradiction |
| Attendance location failure | Reason code erased to a bare error | Carried through to the classifier |
| "Allow approximate IP fallback" setting | Offered, with no provider behind it | Withdrawn |

## What changed for an agent

Not operator-visible, but this is the bulk of the release.

- **The id allocator no longer issues collisions.** `ID_KINDS.plan` scanned
  `docs/qa/test-plans` only, so it returned `PLAN-027` while an ExecPlan already
  held it. It now scans both directories **and** reads ExecPlan frontmatter,
  because the id lives there rather than in the filename.
- **The data model is documented.** 13 entity notes for the spine, a generated
  domain map covering all 318 models, a screen map covering 356 screens, and four
  discovery-tracking notes.
- **The vault graph is connected.** 3,001 record edges plus 1,384 rewritten links;
  `OBSIDIAN_GRAPH_ORPHANS` went from an unmeasurable 0 to a real 0, and blanket
  exemptions fell from 205 to 31.
- **Three new CI checks** guard the generated documentation against drift.

## Risk assessment

Low, and smaller than the commit count suggests. Of 16 commits, **7 files touch
application code** (~304 lines) and the rest are records, knowledge and tooling.
No schema change, no migration, no permission or API contract change.

The two operator-visible API changes had both already been verified in
production behaviour terms before this release: the attendance fixes were
observed live, and the readiness relabel is a display string with a unit case
pinning it.
