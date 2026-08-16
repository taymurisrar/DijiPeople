---
ID: BUG-0034
aliases: [BUG-0034]
Title: Desktop agent logout never revokes the refresh token
Status: OPEN
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
ResolvedAt:
---

# BUG-0034 — Desktop agent logout never revokes the refresh token

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
[[BUG-0032-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]] ·
[[ITEM-0026]] · bug pattern [[declared-but-unwired-step]].

## Resolution

Not resolved. Found by an audit; no product code changed by that task.

## QA Retest

Not applicable — not yet fixed. Verified by reading the client payload, the DTO
and the global pipe configuration at `78072d2`. **The 400 was not observed
against a running API**; it follows from `forbidNonWhitelisted: true` and an
undeclared field, which is the documented behaviour of this codebase.

## History

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `FIX_NOW`. Small, bounded, and it restores a
  revocation control that everyone reasonably assumes already works — which is
  what makes it worse than its size suggests.
</content>
