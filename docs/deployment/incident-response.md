# Incident Response

For a deployment that has gone wrong. For a planned undo, see
[`rollback-runbook.md`](rollback-runbook.md).

## 1. Stabilise before diagnosing

Decide quickly whether to roll back. A five-minute rollback beats a thirty-minute
diagnosis while users are affected — **unless** the change is
`DATABASE_DESTRUCTIVE`, where rolling back code makes things worse.

## 2. Establish component state

Do not assume the deployment reached every component.

```bash
curl -fsS https://<api-host>/api
npm run prisma:migrate:status
```

If components disagree, this is `PARTIAL_FAILURE` — follow the rollback runbook
rather than continuing to deploy.

## 3. Classify

`APP_FAILURE` · `CONFIG_FAILURE` · `DEPENDENCY_FAILURE` · `MIGRATION_FAILURE` ·
`INTEGRATION_FAILURE`

## 4. Gather evidence before changing anything

- **Startup logs** — the three boot gates report precisely which variable failed
- **`ErrorLog`** — new fingerprints since deployment, with `traceId` and
  `occurrenceCount`
- **`PlatformEvent`** — failed provisioning or billing operations
- **Response headers** — `X-Trace-Id` ties a user report to a stored log

## 5. Known observability limits

Be aware of what you cannot see:

- The health endpoint returns a **hardcoded `ok`** and tests no dependency — it
  cannot tell you the database is down.
- **No deployed SHA is exposed**, so the running system cannot confirm which
  commit is live. Use `release-history/`.
- There is **no error-tracking platform**; `ErrorLog` in the database is the
  primary signal, and reading it requires database access.
- CI exists and the required aggregate covers eleven listed jobs, but relevant
  report-only/fail-open jobs can still contain red test evidence behind a green
  conclusion. Inspect database E2E, security-invariant and browser artifacts;
  see [`../development/ci.md`](../development/ci.md) and [[BUG-0049]].

## 6. Recover

Roll back or forward-fix per the rollback class. Verify with health checks
**and** smoke tests — recovery is a deployment.

## 7. Afterwards

Record the incident in the release record. If a gate would have caught it, add
that gate to `readiness-checklist.md` or `smoke-tests.md`. If it was a code
defect, run the QA bug learning loop.

The question is never "who deployed it" — it is **"which gate was missing"**.
