# Deployment Runbook

Owner: Release/DevOps. Architecture: `.agent/context/deployment-runtime.md`.

## 1. Select the release SHA
Record branch, SHA and the commit range since the last release. Confirm it is
pushed — a local-only SHA is not reproducible.

## 2. Verify gates
Work [`readiness-checklist.md`](readiness-checklist.md) in full. Record the
readiness level. Stop at `BLOCKED` or `NOT_READY`.

## 3. Build
```bash
npm ci
DATABASE_URL="<target or placeholder for codegen>" npm run prisma:generate
npm run typecheck
npm --workspace api run test
npm run build
```
`npm run build` runs `--concurrency=1` and is slow — budget for it.

## 4. Database plan
Determine whether this release contains migrations:
```bash
git diff --name-only <lastRelease>..<releaseSha> -- services/api/prisma/migrations/
```
If it does: read the generated SQL, identify destructive operations and locks,
classify rollback, confirm the backup, and **verify `DATABASE_URL` targets the
intended database**.

Remember: on Render, `preDeployCommand` runs
`prisma migrate deploy && seed:config && seed:verify && seed:admin`
**automatically**. Migration is not a separate manual step — which also means a
bad migration blocks the deploy at that point.

## 5. Deployment order
```
database (automatic, preDeploy) → API → frontends
```
If a frontend depends on a new API contract, the API must be compatible first.
Prefer additive API changes. For field removal, use expand → migrate → contract.

## 6. Deploy
**API (Render):** push to the deployment branch, or trigger a deploy of the
recorded SHA. `preDeployCommand` runs migrations and seeds, then
`startCommand` starts the new process.

**Frontends:** configured outside the repository. Trigger per the platform
dashboard.

If agent credentials are unavailable, report
`DEPLOYMENT_EXECUTION = BLOCKED_BY_ACCESS`, hand over this plan, and **do not
claim a deployment occurred**.

## 7. Health checks
```bash
curl -fsS https://<api-host>/api
```
Expect `{ app, status, environment, version, apiBaseUrl, timestamp }`.

⚠️ `status` is hardcoded `ok` and tests no dependency. **A 200 here does not
mean the system is healthy** — proceed to smoke tests before believing it.

## 8. Smoke tests
[`smoke-tests.md`](smoke-tests.md), or `npm run smoke:deployment` with
`SMOKE_API_BASE_URL` and credentials set.

## 9. Logs and monitoring
Check startup logs for the three boot gates. Watch `ErrorLog` for a spike in new
fingerprints, and check `PlatformEvent` for failed provisioning or billing
events.

## 10. Release decision
`SUCCESS` · `SUCCESS WITH RISKS` · `FAILED` · `ROLLED_BACK`.

## 11. Rollback criteria
Trigger [`rollback-runbook.md`](rollback-runbook.md) when: health checks fail
after the grace period, a smoke test fails on a critical path, error rate rises
sharply, or a migration fails mid-flight.

## 12. Record
Write `release-history/YYYY-MM-DD-<environment>-<sha>.md`, add a deployment QA
run under `docs/qa/runs/`, run knowledge capture, and sync Obsidian if
configured.
