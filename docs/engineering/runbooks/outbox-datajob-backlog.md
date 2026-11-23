# Runbook: outbox / DataJob backlog

> **Drill status: NOT YET DRILLED.** Written from source on 2026-11-23; no step here has been exercised.

## Detection
- Platform health `backgroundProcessing`: DEGRADED at 200 or more PENDING/RETRY_SCHEDULED, oldest pending 15 minutes or more, or any FAILED in the last hour. This covers the outbox only.
- DataJob backlog has no health signal. Look at the data-management screens or at `DataJob` rows stuck QUEUED/PROCESSING.
- Customer symptoms: paid but no workspace (`PROVISIONING_REQUESTED` undelivered); exports never finish.

## Triage
1. `/api/health` field `outboxWorker.enabled`. If false on the intended service, that is the cause (the BUG-0904 pattern: `OUTBOX_WORKER_ENABLED` must be `true` on exactly one service).
2. Backoff schedule in `outbox-dispatcher.service.ts` is 10s, 30s, 120s, 300s, 900s, 1800s, 3600s; a crashed worker's claim frees after the 5 minute lease by design.
3. DataJob: `DATA_JOB_WORKER_ENABLED` must not be false. `data-job-recovery.service.ts` reclaims expired leases, treats legacy no-lease jobs as stale after 60 minutes without update, and fails (not loops) a job recovered repeatedly.
4. Rule out a slow database first: [database-unavailable](database-unavailable.md).

## Action
- Enable the worker flag on the intended service. A configuration change redeploys the service; get owner approval.
- Do not hand-edit outbox or job rows in production without owner approval and a saved copy of the rows.
- Poll interval and batch size (`OUTBOX_WORKER_POLL_INTERVAL_MS`, `OUTBOX_WORKER_BATCH_SIZE`) trade latency against Neon load; change only with the owner ([[ITEM-0237]]).

## Verification
Pending count and oldest-pending age fall; `backgroundProcessing` returns OK; a test provisioning or export completes.

## Rollback
Revert the configuration change. Delivered events cannot be un-delivered; confirm consumers are idempotent before any replay.
