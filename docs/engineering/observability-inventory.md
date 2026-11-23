# Observability inventory (WP7)

> Derived from source on branch `agent/wp7-sre-runbooks`, 2026-11-23. Nothing here was exercised against production; "monitored" means a signal exists in code, not that anyone is alerted. Register context: [enterprise-hardening-register.md](enterprise-hardening-register.md). Runbooks: see [runbooks/](runbooks/) (api-down, database-unavailable, outbox-datajob-backlog, failed-deploy-rollback, credential-rotation-cutover, restore-drill).

## What exists

| Signal | Where | What it tells you | Who sees it |
|---|---|---|---|
| `GET /api` and `GET /api/health` | `services/api/src/app.controller.ts`, `app.service.ts`, `config/env.validation.ts` (`getRuntimeHealthPayload`) | Process answers; deployed `commit`/`commitShort`; `outboxWorker.enabled`; `entitlementEnforcement`. **Runs no database probe.** | Public. Render `healthCheckPath: /api` (`render.yaml`). Smoke scripts |
| `GET /api/platform/monitoring/health` | `platform-monitoring/platform-health.controller.ts`, `platform-health.service.ts` | Components api, database (`SELECT 1`, 3s timeout, DEGRADED at 500ms), backgroundProcessing (outbox only), notificationQueue, authentication, storage, email; overall = worst | Platform user with `monitoring.read`; pull only |
| `GET /api/platform/storage/readiness` | `platform-monitoring/storage-readiness.controller.ts` | Object storage readiness | Platform user with `monitoring.read` |
| Outbox thresholds | `platform-health.service.ts` constants | DEGRADED at >=200 pending, oldest pending >=15 min, or any FAILED in last hour | Via the health endpoint above |
| Error logs / incidents | `error-logs`, `platform-monitoring` modules; `HttpExceptionFilter` writes `ErrorLog` | Request failures, incidents queue | Admin app; DB access for raw rows |
| Outbox worker | `outbox/outbox-worker.service.ts` (poll 5s, batch 25, `OUTBOX_WORKER_ENABLED` must be `true` on exactly one service), `outbox-dispatcher.service.ts` (5 min claim lease, backoff 10s..3600s) | Delivery of platform events | Logs only; enabled flag in `/api/health` |
| DataJob worker | `data-management/data-job-worker.service.ts`, `data-job-recovery.service.ts` (lease recovery, legacy-stale 60 min) | Import/export jobs | Logs only |
| `scripts/smoke-deployment.mjs`, `smoke-login.mjs`, `admin-runtime-smoke.mjs` | repo `scripts/` | Post-deploy checks; need `SMOKE_*` env | Operator, manual |
| `scripts/webhook-delivery-health.mjs` | repo `scripts/` | Stripe webhook deliveries arriving/failing (`OK`/`WARN`/`BLOCK`) | Operator, manual |
| Release records | `docs/deployment/release-history/` | Which SHA was deployed | Human |

## What does not exist (verified by absence in source or docs)

- No alert routing of any kind: no pager, Slack, email or uptime monitor wired to the health endpoints. Tracked broadly in [[ITEM-0009]].
- Render's health check is liveness only (`/api` never touches the database), so a DB outage does not fail the check and does not trigger a restart.
- `backgroundProcessing` covers `OutboxEvent` only; the DataJob queue has no health component (see gap items below).
- No automated backup or restore verification; Neon history window is 6 hours ([[ITEM-0131]], `docs/deployment/platform-access.md`).
- No external error tracker; `ErrorLog` in the database is the signal.

## Note on a stale statement

`docs/deployment/incident-response.md` section 5 says the health endpoint is hardcoded `ok` and exposes no SHA. The code now returns the commit and worker/entitlement state, but still no dependency probe. That section was corrected in this change.
