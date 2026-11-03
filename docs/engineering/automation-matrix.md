# Automation matrix — what is automated and what still needs a human

`A` automated and blocking · `H` blocked at tool time by a hook · `P` partial / advisory · `M` manual (reason given). Source of truth for enforcement kind is `policy-catalogue.json`.

| Control | Status | Mechanism | Remaining human action |
|---|---|---|---|
| Every controller classified; lifecycle ops declared | A | `check-api-completeness` (CI `governance.yml`, `preflight`) | Decide `notApplicable` reasons; review 12 baselined gaps |
| Route guards present | A | same, zero baseline | — |
| Route authorization contract declared | A | same + `api-authorization-inventory`; 178 legacy routes in a dated, owned register (P2/P3) — no route is unexplained | Work the register by due date; convert service-enforced routes to a declared contract |
| Destructive verbs on sensitive/read-only | A | same | Approve `allow` exceptions via ADR |
| Response/property-level leakage, import/export templates | M | `dp-security-reviewer` review | No static detector yet (R-4) |
| OpenAPI contract & backward-compat diff | **not built** | — | R-1: commit a generated OpenAPI baseline, diff in CI |
| Module creation goes through the provisioner | A | `check-module-completeness` | — |
| Provisioning atomic / idempotent / customisation-safe | A | `module-provisioning*.spec.ts` | Run against real Postgres in e2e (R-5) |
| Existing tenants' modules back-filled | A (explicit) | `POST /customization/modules/reconcile`: dry run by default; apply needs the retyped slug (+ owner authorization ref on production); per-module transaction; never at startup/seed (gated) | **Owner decides when, per workspace** |
| Status / ownership views, kind-driven commands | A | module kinds; real-Postgres e2e | List-page re-fetch per view (F-1) |
| Package import provisions defaults | A | `provisionImportedModules`, create-only; ALM suite 19/19 | — |
| Real-PostgreSQL provisioning proof | A | `test/module-provisioning.e2e-spec.ts` (20 tests) runs in the `e2e` job's database | — |
| Associated/related views, per-module RBAC | not built | — | Needs a runtime subgrid and a product decision (R-3) |
| Tenant isolation | A | `wiring-invariants.spec.ts`, e2e isolation suites (pre-existing) | Review for new query sites |
| Dangerous git/DB/deploy commands | H | `guard-bash.mjs` (26 tests) | Owner changes the rule list via ADR |
| CI failure classification | A | `ci-doctor`, `ci-failure-report.yml` | Act on the diagnosis |
| Retry-into-green prevented | A | classifier tests; policy | — |
| Node/npm version drift | A | shared setup action pins + verifies before `npm ci`; `preflight` locally | — |
| Branch staleness | P | `preflight` (local only) | — |
| Hotfix plan, gates, rollback, artifact manifest | A (dry-run) | `hotfix.mjs` + tests | **Owner approval; deploy; backport** (always human) |
| Hotfix rehearsal (fake target) | A | `hotfix-rehearsal.mjs` + 6 tests | — |
| Hotfix actually exercised against production | M | not done by design | First real P0/P1 will validate the runbook; **owner approval and the deploy stay human** |
| Live agent/hook behaviour | A (manual harness) | verified with the real `claude.exe` 2.1.314: agents/skills discovered, SessionStart output, 4 dangerous commands blocked, safe commands allowed | Re-run after changing hooks; workspace-trust caveat in README |
| Agent/skill/rule validity, duplicate policies | A | `governance.test.mjs` | — |
| Lessons reviewed before becoming rules | A + H | `lessons.mjs check` requires `reviewedBy` | A person reviews |
| Code review summaries on PRs | P | `/dp-review` skill produces findings | Posting to GitHub needs a write-scoped token (not granted) |
| Independent QA | A (structural) | QA/security agents have no Edit tool | The QA run itself |
| Stale/duplicate rule sweep | A | governance test + `lessons.mjs stale` | Periodic: schedule `lessons stale` weekly |
| Performance: N+1, duplicate requests, latency | M | `dp-performance-engineer` | No detector (R-6) |
| Documentation counts | A | `derive-doc-facts.mjs` markers in AGENTS.md | — |
| Dependabot targets develop, no duplicate PRs | A (config) | `dependabot.yml` + test | Re-base/close the nine existing PRs (they target main) |
| Advisory gate | A (pre-existing) | `check-production-advisories` — **currently red on develop**: 1 critical (`next`) + 19 undispositioned | **Owner: land the dependency fixes** |
| Dependency/licence monitoring | P | `check-production-advisories` (pre-existing) | Licence scan not present |

## Roadmap, ranked (impact ÷ effort)

| Id | Item | Impact | Effort |
|---|---|---|---|
| R-2 | Pin npm 11 via composite setup action; `fetch-depth: 0` in `validate`; add `dependabot.yml` | High (kills a recurring class, removes 15× duplication) | S |
| R-5 | Run the provisioning behaviour against real Postgres in the e2e job | High | S |
| R-1 | OpenAPI baseline + breaking-change diff in CI | High | M |
| R-7 | Roll `reconcileModuleComponents` out to existing tenants (script, dry-run first) | Medium | S |
| R-3 | Custom-module status/owner system columns → Active/Inactive/My views; per-module RBAC (product decision) | Medium-High | L |
| R-4 | Static detector for sensitive columns in selects/exports | Medium | M |
| R-6 | Query-count assertion helper for list endpoints | Medium | M |
