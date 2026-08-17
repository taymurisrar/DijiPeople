---
ID: BUG-0050
aliases: [BUG-0050]
Title: Notification settings offer email providers whose backend always fails
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 0051180
AffectedModules: [apps/web, services/api/src/modules/notifications]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-053
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
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

Fixed 2026-08-17 by the record's second branch — the providers are now "clearly
unavailable and impossible to select" rather than implemented. Implementing SES,
SendGrid, Mailgun and Postmark is four integrations with four credential sets and
four SDKs; that is a feature, and shipping it under a bug fix would have been the
wrong call.

The defect was never really the placeholder. It was **two catalogs with nothing
comparing them**: the UI enumerated what the Prisma enum allowed, the factory
decided what was actually built, and neither knew about the other. So the fix is
one catalog.

`packages/config/email-providers.js` publishes
`SUPPORTED_EMAIL_PROVIDER_TYPES` (`CONSOLE`, `DEV`, `SMTP`) and
`UNIMPLEMENTED_EMAIL_PROVIDER_TYPES`. Both sides consume it:

- `EmailProviderFactory.getProvider()` is checked against it.
- `email-providers-manager.tsx` offers from it.

`email-provider-support.spec.ts` is the comparison that was missing. It asserts
the published catalog equals the Prisma enum exactly, that supported and
unimplemented do not overlap, that every supported type resolves to a real
provider, and that every unimplemented one still resolves to the placeholder.
Adding an enum value, or shipping an implementation without publishing it, or
publishing one without implementing it, each turns exactly one of those red.

**Existing rows keep working.** The Prisma enum retains every value — narrowing
it would be a destructive migration, and a tenant configured before this fix may
hold `SES`. Dropping that from the select would have made it fall back to the
first option, so opening the row and saving anything would silently rewrite the
provider type. The stored value is therefore re-added to the list, disabled and
labelled `SES — not available`: the administrator can see what is stored and why
no mail is arriving, and still cannot newly choose it.

## QA Retest

Pass.

```text
email-provider-support.spec.ts   11 tests, all passing
services/api notification+email   7 suites, 35 tests
apps/web                         17 suites, 391 tests; check-types PASS
```

Negative case is built into the spec rather than run by hand: moving a provider
between the supported and unimplemented lists without changing the factory fails
`returns a real implementation for <type>` or
`still resolves <type> to the placeholder`.

## History

- 2026-08-17 — verified against current web options and backend provider factory.
