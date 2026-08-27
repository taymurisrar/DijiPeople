---
ID: BUG-1595
aliases: [BUG-1595]
Title: Production has no tenant email provider so no tenant can send any email
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [notifications, tenants]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1595 — Production has no tenant email provider so no tenant can send any email

## Summary

No tenant on production can send any email. `EMAIL_PROVIDER` is not in effect on
the live API service, tenants have no provider of their own, and the console
fallback is deliberately disabled in production — so provider resolution returns
`null` and every tenant-scoped message fails as a `CONFIGURATION` error.

The visible consequence is that a paying customer cannot get into the workspace
they bought: the activation email is the only way in, and it is never delivered.
Platform email is unaffected and works, which is why this went unnoticed.

## Expected Behavior

A provisioned tenant can send the email its workflows depend on — activation,
notifications, approvals, signature requests — without an operator configuring a
provider per tenant.

## Actual Behavior

`EmailProviderFactoryService.resolveProvider(tenantId)` returns `null`.
`EmailExecutionService` writes an `EmailDeliveryLog` row with
`status: FAILED`, `errorMessage: "No enabled email provider is configured."`,
`retryable: false`, `failureCategory: CONFIGURATION`, and no mail is sent.

## Reproduction

1. Provision a tenant through the paid public signup.
2. Observe the tenant reach `ACTIVE` and the owner reach `INVITED`.
3. As a platform owner, read
   `GET /api/platform/tenants/{tenantId}/access`.
4. The owner row reports the failure directly.

## Evidence

Read from production on 2026-08-27, after `2eadac97` deployed the field that
makes it legible. Tenant `f959c5ff-c8f2-419b-ae79-e99989557771`, owner
`9ea70209-f50d-45aa-b3b4-7d5e407e6944`:

```
activationEmailStatus:    FAILED
activationEmailDetail:    "No enabled email provider is configured."
activationEmailDelivered: false
status:                   INVITED
lastSignInAt:             null
```

The invitation was issued at 2026-08-26T13:36:52Z during provisioning, and
resent at 13:48:55Z. Neither was delivered.

Contrast: a platform test email delivered successfully to an external Gmail
inbox through `live.smtp.mailtrap.io` on 2026-08-26. Platform and tenant mail do
not share a provider, so the platform delivery log looked healthy throughout.

## Root Cause

Established. `resolveProvider` tries three sources in order:

1. the tenant's own enabled providers — nothing in provisioning creates one, so
   a newly provisioned tenant has none;
2. `fromEnvironment()`, which returns `null` immediately unless `EMAIL_PROVIDER`
   is set;
3. the console provider, guarded by `NODE_ENV !== 'production'` — so it is
   deliberately unavailable here.

Production therefore has no fourth option and returns `null`.

`render.yaml` declares `EMAIL_PROVIDER: SMTP` with `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD` and `EMAIL_FROM` marked `sync: false`
for the dashboard. The declaration exists; the values were not in effect on the
running service. That is the file-versus-dashboard divergence already recorded
at the top of `render.yaml` as BUG-0767, whose comment warns that a dashboard
configuration diverging from the file is invisible to review. This is a second
instance of the same class.

Whether the variables are now present after the 2026-08-27 deploy has **not**
been confirmed — see QA Retest.

## Impact

Critical, and customer-facing on the revenue path.

Every self-service purchase provisions a tenant whose owner can never sign in,
because the activation link only ever arrives by email. The funnel was reported
as working end to end on 2026-08-26; it works up to the point where the customer
needs to log in, which is the point that matters.

Beyond activation, every tenant-scoped message fails identically: user
invitations, approval notifications, SLA and workflow notices, signature
requests, onboarding notices. The failures are recorded per tenant in
`EmailDeliveryLog` with `retryable: false`, so nothing retries them.

Existing tenants that configured their own provider are unaffected.

## Affected Areas

- `services/api/src/modules/notifications/email/email-provider-factory.service.ts`
- `services/api/src/modules/notifications/email/email-execution.service.ts`
- `render.yaml` — the `EMAIL_*` block
- The Render service configuration, which is the authority in practice
- Tenant provisioning, which configures no provider

## Proposed Resolution

Two separate things, and the second matters more than the first.

**Restore delivery.** Set the `sync: false` values on the live service and
confirm `EMAIL_PROVIDER` resolves. That is a configuration change, not a code
change.

**Stop it being silent.** A production API that cannot send tenant email should
say so at startup rather than at the first invitation. Provider resolution
failing with `failureCategory: CONFIGURATION` is an operational signal and
should raise a platform event, not only write a log row no screen reads. Whether
provisioning should also give each tenant an explicit provider — rather than
leaning on a single shared environment fallback — is a design decision worth an
ADR.

The deeper issue is that `render.yaml` is not the authority on production
configuration. BUG-0767 recorded that once already; this is the recurrence. A
check that compares declared against live environment keys would catch the whole
class.

## Acceptance Criteria

- `resolveProvider` returns a provider for a tenant with none of its own, on
  production.
- A freshly provisioned tenant's owner receives an activation email and can sign
  in.
- An `EmailDeliveryLog` row with `failureCategory: CONFIGURATION` raises a
  platform event.
- The owner of the affected tenant is given a working way in.

## Regression Coverage

None yet. A test asserting `resolveProvider` returns non-null under
`NODE_ENV=production` with no tenant provider and a configured environment would
cover the code path, but the failure here was configuration, so the durable
guard is the declared-versus-live environment comparison named above. Requires a
`REG-nnn` entry once written.

## Dependencies

Needs access to the Render service configuration; not fixable from the
repository alone.

## Related Items

The underlying cause of [[BUG-1515]], whose reporting half is fixed and which is
what made this legible. Same class as the `render.yaml`-versus-dashboard
divergence in BUG-0767. Possibly related to [[BUG-1551]], which is the same
question — declared configuration not being in effect — asked about file
storage.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. **The 2026-08-27 deploy may already have changed this**, if
the service is Blueprint-synced from `render.yaml`; `EMAIL_PROVIDER` carries a
literal value, though the SMTP credentials beside it are `sync: false` and would
still need setting by hand.

Retest by resending the invitation for tenant
`f959c5ff-c8f2-419b-ae79-e99989557771` and reading `activationEmailStatus` on
the access endpoint — the field now reports the outcome truthfully. Do not judge
it by the toast alone; that is what [[BUG-1515]] was.

## History

- 2026-08-27 — established from production immediately after `2eadac97`
  deployed, while closing out [[BUG-1515]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]], [[tenant-control-plane]]

<!-- GRAPH:END -->
