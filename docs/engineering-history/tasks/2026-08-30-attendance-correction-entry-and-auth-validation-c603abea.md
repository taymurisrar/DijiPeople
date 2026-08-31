# Engineering History — Attendance correction entry and auth validation

| | |
|---|---|
| **Task Title** | Attendance correction entry and auth validation |
| **Task Type** | FEATURE, with four BUGFIX commits it produced |
| **Date** | 2026-08-30 |
| **Architect Plan** | [EXECPLAN-0029](../../plans/EXECPLAN-0029-attendance-correction-from-the-record-page.md) |
| **Session** | SESSION-0084 |
| **Agents Used** | Frontend (the panel, the prefill, the manager's diff) · Security (the three auth and authorization findings) · QA (the live production sweep) · Integrator (four rebases, two forced by a moving `develop`) · Release/DevOps (merge and deployment verification). **Deliberately not used:** Database — no schema change; every value the diff renders was already persisted and already returned. Backend/API was declared unnecessary at planning, and that turned out to be wrong: three of the six findings were server-side. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop`, later re-based onto `origin/main` |
| **Task Branch** | `agent/attendance-correction-entry` |
| **Base SHA** | `54f79ac51dce9a245f941774e99ee6283163ac06` |
| **Final Task SHA** | `279cf72e99c9a328eff254846255b20f47a1f0ac` |
| **Target Branch** | `develop`, then `main` via PR #63 |
| **Merge Commit** | `c603abeacedeef52d08d27689438ef9788bbc656` |
| **Final Target SHA** | `c603abeacedeef52d08d27689438ef9788bbc656` |

### Commits

```
279cf72e docs(records): renumber a colliding REG id, and record what verification could not clean up
d321e942 fix(attendance): stop offering the requester buttons the server has always refused
322ab25c fix(auth): the endpoint that says whether you are signed in did not know you had signed out
53f0dca3 feat(attendance,auth): correct a record from the record, and a sign-out that signs you out
```

### Files Changed

41 files, +4272 / -99 against `54f79ac5`. Eleven are code:

```
apps/web/app/(authenticated)/attendance/[entryId]/page.tsx
apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx
apps/web/app/components/attendance-corrections/attendance-correction-form.tsx
apps/web/app/components/attendance-corrections/attendance-correction-panel.tsx      (new)
apps/web/app/components/attendance-corrections/attendance-correction-types.ts
apps/web/app/components/attendance-corrections/correction-form-fields.ts
apps/web/app/components/attendance-corrections/correction-form-fields.spec.ts
services/api/src/modules/attendance/attendance.service.ts
services/api/src/modules/attendance/attendance.correction-authorization.spec.ts
services/api/src/modules/auth/auth.service.ts
services/api/src/modules/auth/auth-session-lifecycle.spec.ts                        (new)
```

The rest are records and generated indexes.

## What the task was, and what it turned out to be

The handoff described the correction workflow as complete but for its entry
point, and asked for that entry point plus a validation of login, logout,
refresh, expiry and remember-me.

The entry point was smaller than described; the defects around it were larger.
The handoff said the "Correction request" button existed on the record page and
redirected to a blank form. It does not exist there at all:
`attendanceCorrectionCommand()` is declared `placement: "list-command-bar"`, and
`command-runtime.resolver.ts:41` renders only `detail-command-bar` and
`detail-status-group` on a detail page. It also said the form reads no search
params; it reads three. Both halves were checked before either was acted on.

Six defects were found: four fixed here, four more recorded for a decision. Every
one was confirmed against live production rather than inferred from the code.

## Conflicts

Four rebases, conflicting only in generated indexes and one hand-written
register:

1. **`origin/develop` moved from `7cd9a556` to `c18b5024` mid-task.** The
   SESSION-0082 branch this work was based on had been merged to `develop` *and*
   `main` by another session while this was in progress. Conflicts in
   `Engineering Control Center.md`, `sessions/active.md`, `sessions/index.md`.
   Type: **generated-artifact divergence**.
2. **`develop` moved again to `68f4fd2e`** while CI ran, bringing another
   session's billing fix. Twelve conflicting files, all generated except
   `docs/qa/regressions/index.md`.
3. **`develop` fell behind `main`.** PR #62 put a merge commit on `main` that
   never returned to `develop`, so `validate-framework` failed
   `DEVELOP_CONTAINS_MAIN`. Type: **branch-topology drift**, not content.
4. **`REG-374` was allocated twice.** Another session took it for the billing fix
   and merged first. Type: **durable-id collision**.

## Conflict Resolutions

1 and 2 — took `origin`'s side of every generated file wholesale and re-ran the
generators, which is the only resolution yielding an index that matches the
merged tree rather than one matching neither branch.

**What that would have broken if it had not been caught:**
`docs/qa/regressions/index.md` *looks* generated and is not. Resolving it the same
way silently dropped this task's REG-375 and REG-376; they were recovered from
`24c68a12` and re-inserted. Two bug records would otherwise have cited regression
entries that did not exist, and `qa:check` would have failed on some later
session's branch rather than this one.

3 — rebased onto `origin/main` rather than `origin/develop`, so the ref-push to
`develop` reconciled the topology and landed the work in one move instead of
leaving `develop` behind production again.

4 — renumbered **this** branch's entry rather than the merged one: BUG-2505 now
carries REG-379. Renumbering the already-merged billing entry would have rewritten
a record other work already cites. **What this would have broken:** two records
claiming one REG id, which no validator catches — the register is a single file,
and `REG-nnn` is deliberately not a wikilink, so nothing checks uniqueness.

## Verification

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record; the sweep is recorded in the six bug records and in QA-AUTH-010, QA-ATTENDANCE-008 and QA-ATTENDANCE-009 |
| **Bug IDs** | Created and fixed: BUG-2505, BUG-2506, BUG-2507, BUG-2547, BUG-2560. Created and open: BUG-2504, BUG-2508, BUG-2509, BUG-2573 |
| **Backlog Items** | None |
| **Regressions** | REG-375, REG-376, REG-377, REG-378, REG-379 |
| **QA Scenarios** | QA-ATTENDANCE-008, QA-ATTENDANCE-009, QA-AUTH-010 |
| **CI Run ID** | `33335284589` — full run on `develop` at `279cf72e`. PR #63's required gate was also green, via evidence reuse on the identical SHA |
| **CI Result** | PASS |

### Local validation

```
api      2408 tests / 283 suites    PASS
web      1202 tests /  57 suites    PASS
admin     399 tests /  44 suites    PASS
api      check-types                PASS
web      check-types                PASS
admin    check-types                PASS
api      eslint --max-warnings=789  0 errors / 780 warnings (unchanged baseline)
web      eslint                     0 errors / 26 warnings
web      build                      PASS, every route dynamic
validate:framework                  PASS — 4789 checks
nine generator --check commands     all current
```

### Live production verification, at `fba846d1`, before this deploy

Each fix was confirmed to be *needed* by measuring the broken behaviour first,
which is the half most easily skipped:

- `POST /auth/login` with no tenant context → `401 AUTH_UNAUTHORIZED`.
- 25 consecutive `POST /auth/refresh` from one IP → 25 successes, no 429.
  BUG-2458 confirmed fixed in the wild; the credential budget is per-path.
- Sign out, then replay the refresh token → `401 SESSION_REVOKED`.
- Sign out, then `GET /employees` with the old access token → `401
  SESSION_REVOKED`. `GET /auth/me` with the **same** token → `200`, returning the
  caller's identity, with 7.98 hours left on it. Controls: no cookie → 401,
  tampered signature → 401. **BUG-2547.**
- `POST /attendance/correction-requests` as the old form built a
  `TIME_ADJUSTMENT` → `400 "A requested check-in or check-out timestamp is
  required."` The same request carrying the period this task's fix collects →
  `201`. **BUG-2505 confirmed, and the fix confirmed sufficient.**
- Reading it back → `requestedWorkMode: "REMOTE"`. **BUG-2507 was the web type,
  never the API.**
- That request reported `canApprove true · canReject true` to its own requester,
  who was then refused `403 ACCESS_DENIED`. **BUG-2560.**

### Mutation testing

Both fixes were verified by removing them:

- Disabling the `/auth/me` liveness check fails exactly the
  `getProfileFromRequest` case and leaves the other fourteen passing — which is
  why that case exists alongside the helper's own five.
- Removing the party check from `canCurrentUserActionCorrection` fails the two
  paired cases and passes twelve.

## Deployment

| | |
|---|---|
| **Rollback class** | `CODE_ONLY` — no migration, no schema change, no data change |
| **Components** | api, web |
| **Merged to `main`** | `c603abea`, 2026-08-30T21:15:59Z |
| **Deployed** | `/api/health` reported `c603abea` at 21:23:17Z, ~7 minutes after the merge |

### Post-deploy verification, at `c603abea`

Each probe below is the exact one that failed before the deploy, re-run against
the deployed fix:

```
BUG-2560  ACR-000001 canApprove=false canReject=false canEdit=false   PASS (was all true)
BUG-2547  GET  /auth/me       401 SESSION_EXPIRED                    PASS (was 200)
          GET  /employees     401 SESSION_REVOKED                    PASS (unchanged)
BUG-2506  POST /auth/refresh  401 SESSION_REVOKED                    PASS
BUG-2505  POST correction-requests, TIME_ADJUSTMENT with no period
                              400 "A requested check-in or check-out
                              timestamp is required."                PASS (server rule intact)
```

`/auth/me` returns `SESSION_EXPIRED` rather than `SESSION_REVOKED` because the
liveness failure falls through to the refresh path, which clears the cookies and
reports an expired session. That is the intended shape: to a client, a revoked
session should look like one that ended.

**Not verified, and why.** The employee-facing panel could not be exercised on
production: the account available owns no attendance record of its own — its only
visible row is `85303ef3…`, the stuck entry SESSION-0082 left open, which belongs
to another employee, so `isCurrentUsersEntry` is false and the panel correctly
declines to offer itself. The panel is covered by unit tests over its pure seed,
inference and diff logic, and by a clean `next build`, but it has not been seen
rendering against live data.

## Knowledge captured

The three auth and authorization findings are one shape, and REG-378 states it in
the narrowest actionable form: **when a rule is added to a write path, every read
model that describes that write path is now stale, and nothing in the type system
or the test suite will say so.**

- BUG-2506 — sign-out revoked two different ways, and the weaker way carried the
  common case.
- BUG-2547 — `@Public()` is an exemption from the guard, not from the guard's
  reasoning.
- BUG-2560 — the read model behind the buttons was the write path's authorization
  minus the rule BUG-0002 had just added to it.

The second lesson is REG-379's: a test asserting one side of a contract can be
green while the contract is broken. `TIME_ADJUSTMENT` had a passing test
describing the form's field map, and the form's field map was the wrong half.

## Follow-up

- **BUG-2504** (HIGH) — approval applies only `checkIn` and `checkOut`. Needs an
  ExecPlan: `EmployeeWorkMode.FIELD` has no `AttendanceMode` counterpart, and
  overtime has no column to land in.
- **BUG-2508** — the work-site selector is never populated; the only endpoint is
  gated on a device-management permission.
- **BUG-2509** — platform remember-me has no policy able to refuse it. Pinned by
  test, awaiting a product decision.
- **BUG-2573** — nothing can reach `CANCELLED`; a mistaken correction cannot be
  withdrawn.
- `ACR-000001` on `dijipeople-demo` is left `PENDING_APPROVAL`. It was created to
  verify BUG-2505 and cannot be cleaned up, because BUG-2573 is exactly the
  missing route and the separation-of-duties rule correctly refuses the
  workaround. Reported rather than worked around.
- BUG-2494 and BUG-2495 reached production still `ArchitectDisposition:
  TRIAGE_REQUIRED`, and SESSION-0082 is closed, so no active session owns them.
  Not triaged here: this task did not verify those fixes and will not assert a
  disposition it has not established.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0002]] · [[BUG-2458]] · [[BUG-2494]] · [[BUG-2495]] · [[BUG-2504]] · [[BUG-2505]] · [[BUG-2506]] · [[BUG-2507]] · [[BUG-2508]] · [[BUG-2509]] · [[BUG-2547]] · [[BUG-2560]] · [[BUG-2573]] · [[EXECPLAN-0029]] · [[QA-ATTENDANCE-008]] · [[QA-ATTENDANCE-009]] · [[QA-AUTH-010]] · [[SESSION-0082]] · [[SESSION-0084]]

<!-- GRAPH:END -->
