# Runbook: failed deploy and rollback (operational wrapper)

> **Drill status: NOT YET DRILLED.** The hotfix path has a scripted rehearsal (`scripts/hotfix-rehearsal.mjs`); this wrapper has not been exercised.

Authoritative decision logic: [rollback-runbook](../../deployment/rollback-runbook.md). Emergency path: [hotfix](hotfix.md). Mechanics: [deployment-runbook](../../deployment/deployment-runbook.md).

## Detection
Render deploy failed or stuck; `/api/health` `commit` differs from the intended SHA (merging to `main` does not guarantee a deploy); smoke failing. Green CI is not proof of a healthy deploy.

## Triage
1. Which part failed: API (Render), web/admin/landing (Vercel), or migration (`preDeployCommand`)? A mixed state is PARTIAL_FAILURE: stop deploying.
2. Did a migration apply? There are no down-migrations. Additive: code rollback is safe. Destructive: forward-fix or manual recovery only.

## Action
- Code-only or additive: redeploy the last known-good SHA from `release-history/` through the authorized pipeline (owner approval for production). Never force-push `main`; it needs a PR and the exact-SHA `CI required gate`.
- Destructive or data migration: do not redeploy blindly; forward-fix per the rollback runbook and escalate.
- Record the outcome in `release-history/` and mark the original record ROLLED_BACK.

## Verification
`/api/health` commit equals the target; `node scripts/smoke-deployment.mjs` passes; platform health OK; `outboxWorker.enabled` as expected.

## Rollback of the rollback
Redeploy the failed SHA only after a forward fix, with the same verification.
