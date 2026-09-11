---
ID: BUG-3144
aliases: [BUG-3144]
Title: Constant-time defence in verifyIdentityCredential is inert, leaving a 2700x timing oracle for email existence
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3144 — Constant-time defence in verifyIdentityCredential is inert, leaving a 2700x timing oracle for email existence

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Constant-time defence in verifyIdentityCredential is inert, leaving a 2700x timing oracle for email existence

Identified by the 2026-09-10 full technical audit as AUTH-08 (confidence: AUTH-08=CONFIRMED (measured)).

## Expected Behavior

The absent-identity compare must consume the same time as a real one, at the same cost factor used for stored passwords.

## Actual Behavior

A registered address takes ~200–1000 ms to be refused (a real bcrypt compare); an unregistered address takes under a millisecond. Both return the identical `AUTH_INVALID_CREDENTIALS` body, so the message-level defence works and the timing defence does not. Note the discovery lock-out counter (`DISCOVERY_ATTEMPTS_BEFORE_BLOCK = 10`) only engages for addresses that *exist* — the fast path never records anything, so enumeration is unbounded apart from the 20-per-IP-per-10-minutes rate limit.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-08** (services/api/src/modules/users/identity.service.ts):

`services/api/src/modules/users/identity.service.ts:241` — the placeholder, and the comment stating precisely the property it fails to have:
```ts
/**
 * The compare runs even when no identity exists, against a fixed hash. Skipping
 * it makes the unknown-address case measurably faster than the wrong-password
 * case, and that timing difference is the same oracle in a different costume.
 */
const ABSENT_IDENTITY_HASH =
  '$2a$10$0000000000000000000000000000000000000000000000000000';
```
A bcrypt hash requires 53 characters after the `$2a$10$` prefix (22-character salt + 31-character digest). This string has **52**. `bcryptjs` rejects it before doing any work.
Measured with the repository's own `bcryptjs` (5-iteration average, same process):
```
identity ABSENT_IDENTITY_HASH (malformed):  0.03 ms   → returns false immediately
real cost-10 hash:                        211.50 ms
real cost-12 hash:                       1012.85 ms
agent TIMING_EQUALISATION_HASH (valid):  1250.69 ms   (agent.service.ts:116 — correct)
```
Consumed by `verifyIdentityCredential` at `identity.service.ts:266`, reached from `AuthService.discoverWorkspaces` (`auth.service.ts:210`) via the `@Public()` route `POST /api/auth/discover-workspaces` (`auth.controller.ts:69`).

---


Full finding text: AUTH-08 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A platform-wide oracle answering "does this email address have a DijiPeople account". For an HR product that is a customer-and-employee roster: an attacker can confirm which staff of a named company are on the platform before phishing them, and can confirm which companies are customers. It also silently undoes the mitigation the surrounding code was written to provide, which is the more dangerous property — the defence reports itself as present.

## Affected Areas

services/api/src/modules/auth

## Proposed Resolution

Replace the constant with a real hash generated at the current cost factor, e.g. `bcrypt.hashSync('absent-identity-placeholder', 12)` captured as a literal, and add a startup or unit assertion that `bcrypt.getRounds(ABSENT_IDENTITY_HASH) === 12` so a truncated literal cannot pass review again. `agent.service.ts:116` already carries a correct example.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/users/identity.service.ts (audit id AUTH-08).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-08=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-08` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-08) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
