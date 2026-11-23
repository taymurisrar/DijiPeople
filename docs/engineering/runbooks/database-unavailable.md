# Runbook: database unavailable / Neon quota

> **Drill status: NOT YET DRILLED.** Written from source and existing docs on 2026-11-23; no step here has been exercised.

Provider facts below come from `docs/deployment/platform-access.md` and were not re-verified today: Postgres 17, pooler disabled, scale-to-zero disabled, history retention 6 hours. Poller load on Neon is tracked in [[ITEM-0237]].

## Detection
- Platform health `database` component (`platform-health.service.ts`): `DOWN` on error, `UNKNOWN` on a 3s probe timeout, `DEGRADED` at 500ms or more. Pull only; no alert.
- API logs: Prisma connection errors (P1001, P1002), or P2022 (unapplied migration).
- A deploy failing at `preDeployCommand` with connection or quota errors.

## Triage
1. Separate three causes: Neon outage or quota (provider console, or read-only REST calls), a wrong or rotated `DATABASE_URL` / `DIRECT_DATABASE_URL`, or schema drift (P2022; check with `npm run db:preflight` against a local database, never production).
2. Quota: look for data-transfer or compute exhaustion in the Neon console. Steady poller traffic (outbox every 5s, DataJob worker) contributes.
3. Confirm scope: `/api/health` 200 while platform health reports database DOWN.

## Action
- Quota: a plan change is a recurring cost, so escalate to the owner. Do not self-approve.
- Wrong credential: [credential-rotation-cutover](credential-rotation-cutover.md).
- Suspected data loss: stop writes, run nothing destructive, see [restore-drill](restore-drill.md). Never `migrate reset` or `db push` on a shared database.

## Verification
Platform health database `OK`; outbox drains ([outbox-datajob-backlog](outbox-datajob-backlog.md)); smoke passes; one real login works.

## Rollback
Restore the previous configuration value if a change was made. Provider-side changes (plan, branches) are not reversible from this repo and are owner-only.
