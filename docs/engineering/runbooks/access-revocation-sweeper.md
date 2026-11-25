# Runbook: employee access revocation (terminate and the sweeper)

> **Drill status: EXERCISED AGAINST AN ISOLATED DATABASE ONLY** (2026-11-25, `services/api/test/employee-access-revocation.e2e-spec.ts`). Not drilled on staging or production.

Related: [[BUG-4774]], [environment variables](../../environment-variables.md), [DP-MASTER manifest](../../programs/dp-master/r1-release-manifest.md).

## What guarantees what

| Moment | Mechanism | What it does |
|---|---|---|
| Terminate dated now or earlier | `EmployeesService.terminate` | One transaction under a row lock on the employee: status and date, user `DISABLED`, every web and agent refresh token revoked, audit row. All or nothing. |
| Terminate dated in the future | same command | Commits status, date and an audit row (`FUTURE_DATED_REVOCATION_SCHEDULED`). Access continues. |
| The effective date arrives | `AuthAccessService.loadAccessContext` | Login, token refresh and `/auth/me` refuse on the date itself, even with the sweeper stopped. The per-request guard deliberately does not read the employee (it would add a statement to every request and break the 25-statement budget in `auth-query-budget.e2e-spec.ts`). |
| Within a minute after | `AccessRevocationSweeperWorker` (every 60 s) | Disables the user, revokes tokens, writes `EMPLOYEE_ACCESS_REVOKED` (no human actor). From then the guard refuses every request. |

The tenant owner is never disabled or locked out by any of these.

## Detection

- Audit: `EMPLOYEE_TERMINATED` with `accessRevocationNote`, and `EMPLOYEE_ACCESS_REVOKED` rows written by the sweeper.
- API log: `Access revocation sweep: revoked N, failed M.` appears only when a tick did something. `Access revocation failed for employee <id>` names a row that could not be revoked.
- Start-up: `Access revocation sweeper DISABLED ...` means `ACCESS_REVOCATION_SWEEPER_ENABLED=false`. Future-dated exits then rely on login/refresh refusing: an access token already issued keeps working on ordinary endpoints until it expires.

## Triage

1. A terminated employee still appears able to work.
   - Is `employmentStatus` `TERMINATED` and `terminationDate` in the past (UTC)? If the date is in the future the exit has not taken effect.
   - Is the user the tenant owner (`Tenant.ownerUserId`)? Owners are skipped on purpose. Transfer ownership first.
   - Does the employee have a linked user (`Employee.userId`)? Without one there is nothing to revoke.
2. A tick reports failures: read the error in the log line. A lock wait means another transaction (an edit, a rehire) held the employee row; the next tick retries.
3. A rehired employee was disabled: check the order of events in the audit trail. The sweeper re-reads the employee under a lock and revokes only if still `TERMINATED` and due, so a rehire that committed first is respected. If the user is disabled for another reason, re-enable it through the Users screen.

## Action

- Revoke now, by hand: terminate again with a date of now. It is idempotent: the audit row will say `ALREADY_REVOKED` when nothing was left to do.
- Stuck or slow sweep: the sweeper walks employees by id with a cursor carried across ticks, 200 per page and 25 pages per tick, so unrevokable rows (owners) cannot starve others. Measured: 1,000 due employees revoked in about 18 s in one tick on a workstation database.
- Turn the sweeper off (only to stop an incident): set `ACCESS_REVOCATION_SWEEPER_ENABLED=false` on the API service. Changing service configuration redeploys it, so it is a deploy and needs owner approval. Re-enable it as soon as possible.

## Rollback

There is no schema change to roll back; the command and the sweeper use existing tables. To undo a termination, set the employee back to an active status and re-enable the user from the Users screen; tokens that were revoked stay revoked and the person signs in again.

## Known limits

- Terminate does not yet cancel pending approvals or hand off work (WP-08 proper).
- Up to one sweep interval (60 s by default) of residual access for an already-issued access token on ordinary endpoints after a future-dated exit takes effect.
- Deploying this makes every employee who is ALREADY terminated with a past date and an enabled user lose access within one sweep: tell customers before release.
