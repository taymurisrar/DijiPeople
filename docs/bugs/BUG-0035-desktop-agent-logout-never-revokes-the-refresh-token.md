---
ID: BUG-0035
aliases: [BUG-0035]
Title: Desktop agent logout never revokes the refresh token
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [apps/agent-desktop, services/api/src/modules/agent]
OwnerAgent: integration
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0035 — Desktop agent logout never revokes the refresh token

## Summary

The desktop agent's logout request sends a field the server's DTO does not
declare. Because the global `ValidationPipe` runs `forbidNonWhitelisted: true`,
the request is rejected with `400` **every time**. The agent swallows the
failure silently, so logout clears the local credential while the server-side
refresh token stays live for its full remaining TTL.

## Expected Behavior

Signing out revokes the session server-side. A refresh token captured before
logout stops working at logout.

## Actual Behavior

`POST /api/agent/auth/logout` returns `400` on every call. The
`AgentRefreshToken` row is never revoked. Nothing logs the failure and nothing
surfaces it to the user, who is shown a successful sign-out.

## Reproduction

1. Sign in with the desktop agent.
2. Sign out from the tray.
3. Observe the API response to `POST /api/agent/auth/logout` — `400`, with the
   `forbidNonWhitelisted` message naming `deviceFingerprint`.
4. Replay the previously issued refresh token against
   `POST /api/agent/auth/refresh`. It still returns a fresh token pair.

Step 4 is the finding. Steps 1–3 explain why nobody noticed.

## Evidence

- `apps/agent-desktop/src/main/api-client.ts:120-128` — the request body is
  `{ refreshToken, deviceFingerprint }`.
- `services/api/src/modules/agent/dto/agent-auth.dto.ts` — `AgentLogoutDto`
  declares **only** `refreshToken`.
- `services/api/src/main.ts:108-110` — `whitelist: true`,
  `forbidNonWhitelisted: true`. An undeclared field is a `400`, which root
  `AGENTS.md` states as a standing rule ("an unknown request field is a 400, so
  DTO and frontend payload must change together").
- `apps/agent-desktop/src/main/session-manager.ts:172` — the call is
  `.catch(() => undefined)`, discarding the rejection.
- `apps/agent-desktop/.env` (untracked, local) and the tracked
  `.env.production.example` set `AGENT_REFRESH_TOKEN_TTL=90d`.

## Root Cause

Established: a client/DTO contract drift that no test covers. The `agent` module
has **no specs at all** — `services/api/src/modules/agent/` contains only the
controller, module, service and `dto/`, and no suite under
`services/api/test/` exercises `/agent/*`. The desktop app has no tests either.
Combined with the deliberate `.catch(() => undefined)`, there is no layer at
which this could have surfaced.

## Impact

- A refresh token exfiltrated from a workstation — from the OS credential vault
  by malware running as that user, or from a backup — remains valid for up to
  **90 days after the employee signs out**, and survives re-imaging the machine.
- "Sign out" as a remediation step is ineffective. An operator responding to a
  suspected compromise by telling the employee to sign out achieves nothing
  server-side.
- Every logout leaves an orphaned live token row, so the useful ones cannot be
  distinguished from the abandoned ones.

Severity `HIGH`: no live bypass on its own — an attacker still needs the token —
but it removes the only revocation control the client offers, on the longest
lived credential the platform issues.

## Affected Areas

`apps/agent-desktop` sign-out and session teardown ·
`services/api/src/modules/agent` logout handler and DTO · `AgentRefreshToken`.

## Proposed Resolution

Fix the contract, in whichever direction the security answer favours — and it
favours **accepting `deviceFingerprint`**: revoking every token for that device,
rather than only the one presented, is the behaviour a sign-out should have.
Dropping the field client-side is the smaller change and the weaker outcome.

Then stop swallowing the result: a failed logout must be logged with its reason
and must not present as a clean sign-out.

Separately, `EmployeeDevice.isActive` is never set to `false` by any desktop
path — there is no unpair. That is adjacent and belongs in the same change if it
is cheap, or its own record if it is not.

## Acceptance Criteria

- `POST /api/agent/auth/logout` returns `200` for the payload the agent actually
  sends.
- After logout, replaying the previous refresh token returns `401`.
- A logout failure is recorded in the agent log with its reason.
- A spec covers the logout request/response contract end to end.

## Regression Coverage

**None today.** The regression must post the agent's real payload shape and
assert both the success status and that the token is subsequently rejected —
the second assertion is the one that matters, since a contract test alone would
pass if the field were simply dropped client-side.

## Dependencies

None.

## Related Items

[[desktop-agent-architecture]] · [[desktop-agent]] · [[authentication]] ·
[[BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]] ·
[[ITEM-0027]] · bug pattern [[declared-but-unwired-step]].

## Resolution

Fixed on the server side, and the drift is now pinned by a contract test.

`AgentLogoutDto` declares the optional `deviceFingerprint` the desktop agent
has always sent. **The server is the side that changed, deliberately**: deployed
agents already send the field, so tightening the client instead would leave every
installed copy unable to sign out until it updated — and
[[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] records
that the agent's update feed does not exist, so many never would.

The field is optional rather than required, because the device is read from the
refresh token payload and revocation does not depend on it. Sign-out must not
fail over a field it does not need.

The handler itself was already correct once reached — it verifies the token and
revokes by user, device and token — so nothing changed there. The bug was
entirely that the request never arrived.

**The durable fix is the contract test.** The two sides drifted because they are
validated in different workspaces and no test crossed the boundary.
`agent-client-contract.spec.ts` validates the real payloads that
`apps/agent-desktop/src/main/api-client.ts` sends against the DTOs that receive
them, through a `ValidationPipe` built with the same options as `main.ts` —
so a field the production pipe would reject is rejected there too. A further
assertion reads the agent's own source and fails if it sends a body field no
payload in the test covers, so the test cannot quietly describe a client that no
longer exists.

While covering the same client, `HeartbeatDto.events` was found to have **no
server-side size bound at all**. The agent caps a batch at 1000
(`MAX_HEARTBEAT_BATCH_SIZE`) but that cap lived only in the client, so any
holder of a valid agent token could post an arbitrarily large batch and hold a
connection open while the server processed it one event at a time.
`@ArrayMaxSize(1000)` now matches the client's cap: a legitimate agent is never
refused, and the limit stops being a courtesy.

## QA Retest

`npm --workspace api run test -- --testPathPatterns "agent-client-contract"`
— 10 assertions covering login, refresh, refresh-with-new-session, logout, device
registration, session start, and the heartbeat batch bound in both directions.

Verified to fail against the defect it pins:

- removing `deviceFingerprint` from the DTO fails
  *POST /agent/auth/logout accepts what the desktop agent sends*;
- removing `@ArrayMaxSize(1000)` fails
  *refuses a batch larger than any agent sends*.

Full API suite as CI runs it: **157 suites, 1122 tests, all passing.** ESLint
clean across every file touched.

## History

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `FIX_NOW`. Small, bounded, and it restores a
  revocation control that everyone reasonably assumes already works — which is
  what makes it worse than its size suggests.
- 2026-08-16 — fixed by declaring the field the client already sends, and
  pinned with a cross-workspace contract test so the two sides cannot drift
  again. An unbounded heartbeat batch was found and bounded in the same pass.
