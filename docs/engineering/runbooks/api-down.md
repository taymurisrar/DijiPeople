# Runbook: API down or unhealthy

> **Drill status: NOT YET DRILLED.** Written from source and existing docs on 2026-11-23; no step here has been exercised against production or staging.

Related: [incident-response](../../deployment/incident-response.md), [observability inventory](../observability-inventory.md), [[ITEM-0009]].

## Detection
- Nobody is paged today (no alert routing). Detection is a user report, a failing smoke run, or the Render dashboard status.
- `GET /api/health` fails or times out. It returns `status: ok` with no dependency probe, so a 200 does not prove the API is usable.
- Authenticated: `GET /api/platform/monitoring/health` (platform user with `monitoring.read`).

## Triage
1. Process (no response) or dependency (200 on `/api/health` but requests fail)? If the latter, see [database-unavailable](database-unavailable.md).
2. Compare `commit` in `/api/health` with the newest record in `docs/deployment/release-history/`. A mismatch means a deploy is in flight or failed.
3. Read the Render service events and logs (read-only access per `docs/deployment/platform-access.md`). Look for env-validation boot failure (`packages/config`), `preDeployCommand` failure (`npm --workspace api run release`), or P1002 on the migration connection.
4. Check `outboxWorker.enabled` in the health payload: exactly one service must have it true.

## Action
- Boot or config failure: correct the variable on the service. Changing service configuration redeploys it, so treat it as a deploy and get owner approval. Consult `docs/environment-variables.md`; do not guess values.
- Bad release: [failed-deploy-rollback](failed-deploy-rollback.md).
- Dependency down: the matching runbook.
- P0/P1: also follow [hotfix](hotfix.md) approval rules.

## Verification
`/api/health` shows the expected commit; `node scripts/smoke-deployment.mjs` (with `SMOKE_*` env) passes; platform health overall `OK`.

## Rollback
Redeploy the previous good SHA from `release-history/`. Code only; the schema is not rolled back (see the rollback runbook).
