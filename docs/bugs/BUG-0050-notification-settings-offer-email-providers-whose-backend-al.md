---
ID: BUG-0050
aliases: [BUG-0050]
Title: Notification settings offer email providers whose backend always fails
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 0051180
AffectedModules: [apps/web, services/api/src/modules/notifications]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0050 — Notification settings offer email providers whose backend always fails

## Summary

The tenant notification settings UI offers SES, SendGrid, Mailgun, Postmark and
Custom email providers. The backend maps all of them to
`ApiPlaceholderEmailProvider`, whose delivery and connection-test methods always
throw "not implemented".

## Expected Behavior

Every provider exposed as configurable must either deliver/test successfully or
be clearly unavailable and impossible to select.

## Actual Behavior

A tenant administrator can configure and select a provider that cannot send a
single message or pass its connection test.

## Reproduction

1. Open tenant Settings → Notifications → Email providers.
2. Add an SES, SendGrid, Mailgun, Postmark or Custom provider.
3. Test the connection or send a notification through it.
4. The backend instantiates `ApiPlaceholderEmailProvider` and throws the
   provider-specific not-implemented error.

## Evidence

- `apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx:50` exposes the provider choices.
- `services/api/src/modules/notifications/email/email-provider-factory.service.ts:75-88` maps non-console/dev/SMTP choices to the placeholder.
- `services/api/src/modules/notifications/email/providers.ts:292-309` throws for delivery and connection testing.

## Root Cause

Provider configuration and UI options were implemented before the corresponding
delivery adapters, with no capability flag preventing unsupported choices.

## Impact

Tenant administrators can save apparently valid production email configuration
that guarantees notification failure. This is a reachable false-success path,
but it does not expose data, so severity is MEDIUM.

## Affected Areas

Tenant notification settings, email provider factory, notification delivery and
connection-test endpoints.

## Proposed Resolution

Expose only implemented providers from a backend capability contract and reject
unsupported types in DTO/service logic; the web UI renders the same list.
Implementing every external vendor is separate integration work.

## Acceptance Criteria

- Unsupported providers cannot be selected or saved.
- Direct API attempts receive a stable validation error.
- Supported console/dev/SMTP behavior remains unchanged.
- A contract test prevents UI/backend provider lists from drifting.

## Regression Coverage

Add an API factory/capability test and a web pure-logic registry test; link a
regression ID after proving the unsafe list fails.

## Dependencies

No external dependency for hiding/rejecting unsupported choices. Actual vendor
implementations require separate credentials and integration plans.

## Related Items

[[notifications]] · [[settings]] · [[TASK-0005]]

## Resolution

Not fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — verified against current web options and backend provider factory.
