---
ID: BUG-3140
aliases: [BUG-3140]
Title: Client-supplied startNewSession flag on the public agent refresh endpoint resets absolute session lifetime
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/auth, services/api/src/modules/agent]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3140 — Client-supplied startNewSession flag on the public agent refresh endpoint resets absolute session lifetime

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A client-supplied flag that changes session behaviour on a public endpoint is the server trusting input about its own security decisions.

## Summary

Client-supplied startNewSession flag on the public agent refresh endpoint resets absolute session lifetime

Identified by the 2026-09-10 full technical audit as AUTH-05 (confidence: AUTH-05=CONFIRMED).

## Expected Behavior

Absolute expiry is a server-side ceiling and cannot be extended by a token holder. Starting a genuinely new session requires re-authentication, not a boolean.

## Actual Behavior

The absolute session lifetime and the idle timeout are advisory: the holder of a refresh token decides whether they apply. Refresh tokens themselves live 90 days by default (`agentRefreshTtl: '90d'`). The only remaining server-side constraints are `User.status === ACTIVE` and the device row.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-05** (services/api/src/modules/agent/agent.service.ts, services/api/src/modules/agent/dto/agent-auth.dto.ts):

`services/api/src/modules/agent/dto/agent-auth.dto.ts:36` — the flag is plain request input on a `@Public()` route:
```ts
  @IsOptional()
  @IsBoolean()
  startNewSession?: boolean;
```
`services/api/src/modules/agent/agent.service.ts:285` — it disables the idle/absolute assertion:
```ts
    const startsNewSession = dto.startNewSession === true;
    const tokenRecord = await this.findMatchingRefreshToken(
      user.id, device.id, dto.refreshToken,
      { allowExpiredActiveSession: startsNewSession },
    );
```
`services/api/src/modules/agent/agent.service.ts:1483` — `allowExpiredActiveSession` skips `assertAgentRefreshSessionActive` entirely.
`services/api/src/modules/agent/agent.service.ts:314` — and it discards the carried-forward absolute expiry:
```ts
      sessionId: startsNewSession ? undefined : payload.sessionId,
      absoluteExpiresAt: startsNewSession ? undefined : tokenRecord.absoluteExpiresAt,
```
which in `issueTokens` (`agent.service.ts:1430`) falls back to `new Date(now + getAgentSessionAbsoluteTimeoutMs(...))` — a fresh 30 days (`AUTH_CONFIG_DEFAULTS.agentAbsoluteTimeout = '30d'`, `auth.config.ts:23`).

---


Full finding text: AUTH-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

An agent refresh token exfiltrated from a workstation's OS credential store is a permanent credential. There is no absolute cap, no reuse detection (AUTH-09), and — per AUTH-15 — a password reset does not revoke it. The device fingerprint the refresh also checks is derivable from the machine's hostname and username (AUTH-16), so it is not a second factor.

## Affected Areas

services/api/src/modules/auth, services/api/src/modules/agent

## Proposed Resolution

Remove `startNewSession` from `AgentRefreshDto`. If the agent genuinely needs to begin a fresh attendance session after an idle expiry, that is a separate authenticated call, not a refresh-time flag. At minimum, always carry `tokenRecord.absoluteExpiresAt` forward and never re-derive it in `refresh`.

(Difficulty: LOW; Regression risk: MEDIUM (deployed agents send this field; per `BUG-0035`, tightening a DTO the fleet already sends breaks them — remove the *behaviour*, keep the field accepted and ignored); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/agent/agent.service.ts, services/api/src/modules/agent/dto/agent-auth.dto.ts (audit id AUTH-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-05=MEDIUM (deployed agents send this field; per `BUG-0035`, tightening a DTO the fleet already sends breaks them — remove the *behaviour*, keep the field accepted and ignored). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-05) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
