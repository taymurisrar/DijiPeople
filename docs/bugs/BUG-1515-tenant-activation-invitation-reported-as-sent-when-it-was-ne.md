---
ID: BUG-1515
aliases: [BUG-1515]
Title: Tenant activation invitation reported as sent when it was never delivered
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [auth, tenant-control-plane, notifications]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-263
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt: 2026-08-27
---

# BUG-1515 — Tenant activation invitation reported as sent when it was never delivered

## Summary

A customer who paid through the public signup received a fully provisioned,
ACTIVE tenant whose owner could never sign in. The activation email carrying the
single-use link was not delivered, and every surface in the platform said it
had been. The reason was recorded — in an audit `afterSnapshot` field that no
screen renders — so the only way to discover it was to query the database.

## Expected Behavior

Issuing an invitation and delivering the email that carries it are two
outcomes. When delivery does not happen, the platform should say so: in the API
response, in the logs, and on the screen an operator looks at.

## Actual Behavior

- `resendInvitation` returned `success: true` and "An invitation has been sent
  to `<email>`." regardless of what delivery did.
- `issueInvitation` caught any delivery error into a local variable and logged
  nothing, so nothing appeared in the API logs either.
- The admin Tenant Owners row showed `Invitation pending` — indistinguishable
  from an invitation still in flight.
- The admin panel forced toast tone `success` for any accepted response.

## Reproduction

1. Complete a paid signup on `www.dijipeople.com` so a tenant provisions.
2. Observe the tenant reaches `ACTIVE` and the owner reaches `INVITED`.
3. In admin, open the tenant → Access & Security → owner row → Resend invite.
4. Confirm the dialog. `POST /api/platform/tenants/{id}/access/{userId}/resend-invitation`
   returns **201** and the UI shows a green "An invitation has been sent" toast.
5. No email arrives, and no row appears in Settings → Email → recent sends.

## Evidence

Observed on production, tenant `f959c5ff-c8f2-419b-ae79-e99989557771`
(`QA E2E Signup B 20260826`), 2026-08-26:

- Owner `9ea70209-f50d-45aa-b3b4-7d5e407e6944`, status `INVITED`,
  `invitationStatus: "Invitation pending"`, `lastSignInAt: null`.
- `POST .../resend-invitation` → **201**, no new delivery row.
- Platform delivery log's most recent entry stayed at 16:28:53 (the onboarding
  verification code); tenant provisioned 16:36:48, owner invited 16:36:52.
- Render API logs for 13:36:00–13:38:00Z contain **two lines**, both
  `POST /api/billing/stripe/webhook → 400`. Nothing about the invitation.
- Mail infrastructure ruled out: a platform test email to an external Gmail
  address sent at 17:23 and arrived in the inbox.

Code paths:

- `services/api/src/modules/auth/user-invitations.service.ts` — the delivery
  `try/catch` sets `deliveryMode = 'disabled'` and returns; the SKIPPED path
  (`delivery.sent === false`) throws nothing at all.
- `services/api/src/modules/tenant-control-plane/tenant-access.service.ts` —
  `resendInvitation` returned a hardcoded `success: true`.
- `services/api/src/modules/notifications/email/email-execution.service.ts` —
  silent SKIP branches: `TENANT_EMAIL_DISABLED`, `EVENT_EMAIL_DISABLED`,
  `AUTH_NOTIFICATION_COOLDOWN`; plus a thrown
  "No active email template is configured for event ...".
- `apps/admin/app/_components/tenants/tenant-access-panel.tsx` — tone was
  hardcoded to `success`.

## Root Cause

**Both halves are now established.**

*The reporting defect*: three layers each discarded the delivery outcome, so a
failure was indistinguishable from a success. Fixed on `93971563`.

*The delivery failure*: **no email provider was resolvable for the tenant.**
Read from production on 2026-08-27, once `2eadac97` deployed and made the field
legible:

```
activationEmailStatus:    FAILED
activationEmailDetail:    "No enabled email provider is configured."
activationEmailDelivered: false
```

`EmailProviderFactoryService.resolveProvider(tenantId)` tries three sources in
order: the tenant's own enabled providers, then an environment-configured
fallback, then — **only when `NODE_ENV !== 'production'`** — the console
provider. Production has no fourth option, so it returned `null` and
`email-execution.service.ts` logged the `CONFIGURATION` failure above.

The tenant had no provider of its own, which is expected: nothing in
provisioning configures one. So delivery depended entirely on the environment
fallback, and `fromEnvironment()` returns `null` the moment `EMAIL_PROVIDER` is
unset.

`render.yaml` *does* declare `EMAIL_PROVIDER: SMTP`, with `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD` and `EMAIL_FROM` marked `sync: false`
for the dashboard. The variables were therefore declared and not in effect —
the same file-versus-dashboard divergence recorded at the top of `render.yaml`
as BUG-0767, which is the reason that comment exists.

**This is not specific to one invitation.** Tenant email has no working
provider at all, so every tenant-scoped message — activation, notifications,
approvals, signature requests — fails the same way. Platform email is
unaffected and demonstrably works: a platform test message delivered through
`live.smtp.mailtrap.io` on 2026-08-26. The two paths do not share a provider,
which is exactly why the platform delivery log looked healthy while no tenant
mail was going out.

Ruled out along the way, and recorded so nobody re-treads them: a missing
`AUTH_ACCOUNT_ACTIVATION` template (the scope chain falls back to
`NOTIFICATION_SYSTEM_SCOPE_KEY`, and `seedSystemEmailTemplates()` runs on every
release), and the platform delivery log's silence (it covers platform mail
only).

## Impact

Every customer who buys through the public signup. They pay, the tenant
provisions correctly, and they cannot sign in. There is no recovery path in the
admin console, because the one control that exists — Resend invite — reports
success while sending nothing. Reachable in production and hit on the first
real paid signup.

## Affected Areas

- `auth` — `UserInvitationsService.issueInvitation`
- `tenant-control-plane` — `TenantAccessService.resendInvitation`, identity listing
- `notifications` — email execution skip branches, tenant `EmailDeliveryLog`
- `apps/admin` — tenant access panel

## Proposed Resolution

Two separable pieces. The first is done; the second needs the first to be
deployed before it can be diagnosed.

1. **Stop losing the outcome** (branch `agent/invitation-delivery-visibility`):
   log every non-delivery, return `delivered` from the API, and render the
   delivery status on the owner row.
2. **Fix the delivery failure itself**, once the reason is legible. No ExecPlan
   needed for (1); (2) cannot be scoped until the reason is known.

## Acceptance Criteria

- A resend whose email is not delivered returns `delivered: false` and a
  message naming the reason.
- A non-delivery emits a `warn` log carrying tenant, user, invitation and reason.
- The admin owner row shows "Email not delivered — `<reason>`" and the toast is
  not green.
- A newly provisioned tenant's owner either receives the activation email, or
  the console states why not.

## Regression Coverage

`services/api/src/modules/tenant-control-plane/tenant-access.service.spec.ts`
— "reports a resent invitation that was not delivered as undelivered" and
"reports a resent invitation that was delivered as sent". Both fail against the
previous `success: true` return. `REG-nnn` to be allocated at fix closure.

## Dependencies

Part 2 depends on part 1 being deployed, since the reason is not otherwise
readable from production.

## Related Items

- [[BUG-1516]] — duplicate customer records per signup, which produced the
  CRITICAL Stripe "could not be resolved to one tenant" events on the same
  payment.

## Resolution

Both halves are fixed and released.

*Reporting* — `93971563`, released as `2eadac97`. `issueInvitation` logs a
delivery failure instead of swallowing it, `resendInvitation` returns
`delivered` and `deliveryStatus` alongside `success`, and the admin panel takes
its toast tone from the delivery outcome rather than forcing `success`. The
owner row shows "Email not delivered" where it used to show only "Invitation
pending".

*Delivery* — the underlying cause was [[BUG-1595]]: no email provider was
resolvable for any tenant. Fixed by PLAN-023 on `a26fa39e`, released as
`5762b2b2`.

The order mattered. The reporting fix is what made the delivery failure
findable at all — until it shipped, the platform reported success regardless,
and the reason sat in a log no screen could reach.

## QA Retest

Verified against production on 2026-08-27, on tenant
`f959c5ff-c8f2-419b-ae79-e99989557771`, after `5762b2b2` deployed. Scenario
QA-TENANT-017.

- Resend returned `success: true`, `delivered: true`, `deliveryStatus: SENT` —
  three separate fields, which is the point.
- The access endpoint reported `activationEmailStatus: SENT`,
  `activationEmailDelivered: true`, no `activationEmailDetail`.
- **The email arrived.** Its link opened an activation page naming the right
  person, work email and workspace.
- After activation: owner `ACTIVE`, `invitationStatus: Activated`,
  `credentialRotatedAt` set, `activeOwnerCount: 1`.
- The owner signed in successfully and saw an empty employee list — their own
  tenant's data, with no leakage from any other.

## History

- 2026-08-26 — found during production E2E QA of the admin app; the first real
  paid signup produced an ACTIVE tenant whose owner could not sign in.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]], [[tenant-control-plane]], [[notifications]]
- Regression — REG-263 (see the regression register)

<!-- GRAPH:END -->
