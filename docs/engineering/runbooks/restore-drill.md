# Runbook: restore drill (database)

> **Drill status: NOT YET DRILLED. No restore has ever been performed or verified from this repository's evidence.** Production backup posture is an open owner decision: [[ITEM-0131]]. Neon history retention is documented as 6 hours (`docs/deployment/platform-access.md`), so point-in-time restore reaches back six hours only and is not a backup.

## Purpose
Prove, before an emergency, that data can be recovered, how long it takes, and how much is lost.

## Prerequisites (owner)
- Written approval and a time window.
- Neon access (project-scoped key; it can create and delete branches, so use it with care).
- The restore target is a new Neon branch or throwaway database, never the production branch.

## Steps (proposed, untested)
1. Record the start time, the target recovery point (inside retention) and expected row counts for key tables.
2. Create a restore branch from production at that timestamp through the Neon console or API (a write to provider state: owner approval).
3. Point a local or isolated API at the branch (`DATABASE_URL`, `DIRECT_DATABASE_URL`); run `npm run prisma:migrate:status`.
4. Compare counts, spot-check records, run a read-only login for one tenant.
5. Record elapsed time (RTO) and data age (RPO). Delete the restore branch only after owner confirmation.

## Verification
Counts and sampled records match; migration status clean; findings written in a dated note.

## Rollback
The drill does not change production. Promoting a restore in a real incident is a separate owner-approved production change; keep the old branch until verified.

## Not yet established
No measured RTO/RPO, no dump stored outside Neon, no evidence that recovery older than six hours is possible.
