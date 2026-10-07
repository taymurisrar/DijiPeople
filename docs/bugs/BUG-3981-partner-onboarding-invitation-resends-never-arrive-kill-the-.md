---
ID: BUG-3981
aliases: [BUG-3981]
Title: Partner onboarding invitation resends never arrive, kill the old link, return the raw token and report failed sends as success
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: USER_REPORT
DetectedDate: 2026-10-07
DetectedInSha: 898a6ac3
AffectedModules: [partner-experience]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-653
RelatedBacklogItem: ITEM-0228
RelatedDecision: ADR-0026
RelatedImplementation: [services/api/src/modules/partner-experience/partner-experience.service.ts, packages/config/partner-lifecycle.js]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-08
---

# BUG-3981 — Partner onboarding invitation resends never arrive, kill the old link, return the raw token and report failed sends as success

## Summary

Once BUG-3929 made Send onboarding link reach the server, the invitation itself was unsafe and unreliable:
- A resend never arrived. The email was deduplicated while the token had already rotated, so the old link died too.
- The raw token was returned to the admin UI. `activatePartner` returned the raw portal token as well.
- There was no partner-status guard, so the invitation could demote an ACTIVE partner, and nothing ever set ONBOARDING_INVITED.
- A failed send reported success.
- Resends had no cooldown.

## Expected Behavior

- Every send or resend delivers a fresh link, and the previous link stops working.
- Only the allowed states can invite.
- The partner moves to ONBOARDING_INVITED.
- Tokens never leave the server.
- A delivery failure is a clear domain error that changes nothing.
- Resends are rate-limited.
- Everything is audited without secrets.

## Actual Behavior

`partner-experience.service.ts` (lines 508 to 621) sent the email with no idempotency key. The platform-communications default key ignores the body, so a resend matched the earlier SENT row, while the token hash had already been rotated. `sendEmail` never throws. The response carried `token`.

## Reproduction

1. Send the onboarding link.
2. Send it again. No second email arrives, and the first link now fails.
3. Send to a partner that is already ACTIVE. Its status drops to ONBOARDING_PENDING.

## Evidence

- Investigation report B.
- `platform-communications.service.ts` lines 91 to 95 and 260 to 280.
- `partner-experience.service.ts` around line 964: activation already keyed its email on the token hash.

## Root Cause

The invitation was written before the admin could reach it (BUG-3929), so none of its paths had ever been exercised end to end.

## Impact

- Partners could not reliably receive onboarding links.
- Operators were shown live bearer tokens.
- Live partners could be demoted.

## Affected Areas

Partner onboarding invitation, partner portal activation, and the public onboarding link endpoints.

## Proposed Resolution

ADR-0026 D6.

## Acceptance Criteria

All of the following are covered by `partner-onboarding-invitation.spec.ts` (24 cases) and the DB-backed e2e test:
- The idempotency key includes the token hash.
- The states in the shared lifecycle table are enforced.
- ONBOARDING_INVITED is set on send.
- No token appears in a response, the audit log or the timeline.
- A provider failure returns 502 `PARTNER_INVITATION_DELIVERY_FAILED` with nothing changed.
- A resend within 60 seconds returns 429.
- An old link returns 404 and an expired link returns 410.
- A decided application returns 409.

## Regression Coverage

REG-653: `services/api/src/modules/partner-experience/partner-onboarding-invitation.spec.ts` and `services/api/test/partner-onboarding-invitation.e2e-spec.ts`.

## Dependencies

[[BUG-3929]], which fixes the routing.

## Related Items

[[ITEM-0228]] covers links stored in the outbound email body. Also [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]] WP-05.

## Resolution

- The onboarding contact is `Partner.email`.
- Tokens are 32 random bytes, stored only as a sha256 hash. The email is keyed on `partner-onboarding:<applicationId>:<tokenHash>`.
- A 60-second cooldown with optimistic claims.
- A failed delivery rolls back to the previous token and status, the failed outbound row is never retried, and the failure is audited and added to the timeline.
- On success, a conditional status update writes a timeline entry and an audit row with the actor.
- The response is `{applicationId, sentTo, expiresAt, resend, partnerStatus, message}`.
- `activatePartner` no longer returns a token.
- The public link no longer reveals which partners exist, and gives specific responses for expired and closed links.
- 10 catalog codes were added, plus 2 audit actions.

## QA Retest

QA-PLATFORM-051:
- Unit: 24 of 24 pass.
- DB e2e: 3 of 3 pass against a throwaway database.
- Three mutants were killed: the idempotency key, the delivery status and the closed-state refusal.

## History

- 2026-10-07 — created from user report at `c01b778b`.
- 2026-10-08 — fixed in TASK-0037 WP-05.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0228]]
- Modules — [[partners]]
- Regression — REG-653 (see the regression register)

<!-- GRAPH:END -->
