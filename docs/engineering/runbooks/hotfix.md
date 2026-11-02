# Emergency hotfix runbook (P0 / P1)

Faster than a feature, never looser on evidence. Tooling: `scripts/hotfix.mjs` (plans and verifies; it has **no** push, merge or deploy code path). Skill: `/dp-hotfix`. Policies HOT-001…006.

| Severity | Meaning | Path |
|---|---|---|
| **P0** | security compromise, destructive data corruption, severe outage | emergency |
| **P1** | critical customer workflow failure, major security/access issue | emergency |
| P2 / P3 | everything else | normal develop → release; owner may escalate |

## Steps

1. **Record** the incident: severity, title, time, who. (`hotfix.mjs plan` writes the record with `--out`.)
2. **Find the deployed SHA** from release metadata (`/api/health`, deployment dashboard) — never assume it equals `origin/main` (HOT-002). `--prod-url` fetches it; if unverifiable the plan warns and you do not ship.
3. **Reproduce** with sanitized evidence in an isolated environment — not against production data.
4. **Smallest safe action** — containment (feature flag, disabling a route, config) before a patch if faster.
5. **Branch** `hotfix/<slug>` from the deployed baseline. Focused change only.
6. **Gates** — the plan lists them from the changed paths. `lint`, `build` and the authorization regression are never skippable (HOT-003). Add the regression test for the bug.
7. **Artifact & changelog** — `dry-run` prints the range, file manifest and hash; rebuild twice to confirm determinism.
8. **Migration check** — any migration must be expand-only and compatible with the old code still serving during rollout; destructive = refused (HOT-004).
9. **Pre-prod validation** — Vercel preview for web/admin; Render preview/staging only if the service provides one (verify, don't assume canary or multi-instance rollout exists).
10. **Rollback** — in the plan: redeploy the previous release; DB rollback is by compatibility, not down-migration.
11. **STOP — owner approval.** The plan shows `PENDING_OWNER`; only a person sets it (HOT-005).
12. **Deploy** with the existing authorized pipeline. Merging to `main` is the deploy trigger; `main` is protected (PR + exact-SHA `CI required gate`).
13. **Verify** `/api/health` reports the new commit, smoke, the key workflow, error monitoring.
14. **Backport** to `develop` (HOT-006) and close the incident record; `/dp-learn` if the cause was a repeatable mistake.

## Dry run (no deployment)

```bash
node scripts/hotfix.mjs dry-run --severity P1 --title "Contract approval regression" --base origin/main --out incident.json
```

A dry run was executed on 2026-11-03; see `baseline-2026-11-03.md`.

## Hard stops

No automatic production deployment · no destructive migration · no unreviewed merge to main · no security bypass · no silent environment change · no `--no-verify`.
