# Automation matrix — what is automated and what still needs a human

`A` automated and blocking · `H` blocked at tool time by a hook · `P` partial / advisory · `M` manual (reason given). Source of truth for enforcement kind is `policy-catalogue.json`.

| Control | Status | Mechanism | Remaining human action |
|---|---|---|---|
| Every controller classified; lifecycle ops declared | A | `check-api-completeness` (CI `governance.yml`, `preflight`) | Decide `notApplicable` reasons; review 12 baselined gaps |
| Route guards present | A | same, zero baseline | — |
| Route permission declared | A (ratchet) | same; 299 legacy routes baselined | Review each baselined route (many use inline platform/partner checks), then prune |
| Destructive verbs on sensitive/read-only | A | same | Approve `allow` exceptions via ADR |
| Response/property-level leakage, import/export templates | M | `dp-security-reviewer` review | No static detector yet (R-4) |
| OpenAPI contract & backward-compat diff | **not built** | — | R-1: commit a generated OpenAPI baseline, diff in CI |
| Module creation goes through the provisioner | A | `check-module-completeness` | — |
| Provisioning atomic / idempotent / customisation-safe | A | `module-provisioning*.spec.ts` | Run against real Postgres in e2e (R-5) |
| Existing tenants' modules back-filled | P | `reconcileModuleComponents` exists; **no endpoint/job calls it** | Decide rollout: one-off script vs admin action (owner) |
| Status/owner/associated views, per-module RBAC | not built | — | Product/schema decision (R-3) |
| Tenant isolation | A | `wiring-invariants.spec.ts`, e2e isolation suites (pre-existing) | Review for new query sites |
| Dangerous git/DB/deploy commands | H | `guard-bash.mjs` (26 tests) | Owner changes the rule list via ADR |
| CI failure classification | A | `ci-doctor`, `ci-failure-report.yml` | Act on the diagnosis |
| Retry-into-green prevented | A | classifier tests; policy | — |
| Node/npm version drift | P | `preflight` (local only) | R-2a pins npm 11 in CI |
| Branch staleness | P | `preflight` (local only) | — |
| Hotfix plan, gates, rollback, artifact manifest | A (dry-run) | `hotfix.mjs` + tests | **Owner approval; deploy; backport** (always human) |
| Hotfix actually exercised against production | M | not done — no deployment was performed | First real P0/P1 will validate the runbook |
| Agent/skill/rule validity, duplicate policies | A | `governance.test.mjs` | — |
| Lessons reviewed before becoming rules | A + H | `lessons.mjs check` requires `reviewedBy` | A person reviews |
| Code review summaries on PRs | P | `/dp-review` skill produces findings | Posting to GitHub needs a write-scoped token (not granted) |
| Independent QA | A (structural) | QA/security agents have no Edit tool | The QA run itself |
| Stale/duplicate rule sweep | A | governance test + `lessons.mjs stale` | Periodic: schedule `lessons stale` weekly |
| Performance: N+1, duplicate requests, latency | M | `dp-performance-engineer` | No detector (R-6) |
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
