---
ID: BUG-3501
aliases: [BUG-3501]
Title: The email provider screen presents a console sink as delivery and offers sink providers in production
Status: OPEN
Severity: MEDIUM
Priority: P1
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [notifications, apps/web]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0015-production-retires-sink-email-providers.md
RelatedImplementation:
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3501 — The email provider screen presents a console sink as delivery and offers sink providers in production

## Summary

The tenant **Email Providers** screen tells the administrator their mail "is sent
by this workspace's own provider … over CONSOLE". A console provider delivers
nothing; it writes rendered mail to server logs.

The screen also:
- offers CONSOLE and DEV as provider types in production;
- keeps the create form permanently open above the provider list;
- shows developer copy;
- overflows horizontally at a desktop width.

The demo tenant's only provider is a CONSOLE provider, enabled and default, so
none of its notification email has been delivered.

## Expected Behavior

Owner decision 2026-09-13 (ADR-0015):
- CONSOLE and DEV providers cannot be created in production.
- Existing CONSOLE providers are removed from use in production, so tenants fall back to the platform relay and real email is sent.
- The banner states the real delivery status.
- The create form sits behind an "Add provider" action.
- No developer copy appears on the page.
- The page fits the viewport at 1440px.

## Actual Behavior

- The banner reads "Email is sent by this workspace's own provider", then "Mail leaves as <tenant> <no-reply@dijipeople.local> over CONSOLE". This is presented as a working state.
- The Provider type select offers CONSOLE and DEV in production.
- The create form ("Create Email Provider") is always rendered above the Configured Providers list.
- The form panel's description reads "Configuration JSON is sent to the backend as-is. Masked secrets remain protected by backend merge rules."
- At 1440px the page scrolls horizontally.
- Delivery log rows on the demo tenant from 2026-09-09 read NOT_DELIVERED with providerType CONSOLE (see [[BUG-3379]]).

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` (demo tenant) as the workspace owner.
2. Open Settings → Notifications → Email Providers (`/settings/notifications/providers`) at a 1440px-wide viewport.
3. Read the effective-provider banner. Observe "over CONSOLE" presented as delivery.
4. Open the Provider type select. Observe CONSOLE and DEV offered.
5. Observe the create form open above the list, its JSON description, and horizontal scroll.
6. Open the Email Delivery Logs. Observe NOT_DELIVERED rows with providerType CONSOLE.

## Evidence

Browser QA on the live demo tenant at `df0f84f1`. Code references are at the
worktree HEAD.

**The offered types are environment-blind.** They come from
`SUPPORTED_EMAIL_PROVIDER_TYPES = ['CONSOLE', 'DEV', 'SMTP']` in
`packages/config/email-providers.js:26`, consumed at
`apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx:68-69`
and rendered at lines 314-324. Nothing in either file consults the environment.

**The form defaults to CONSOLE.** `emptyProvider` defaults `providerType` to
`"CONSOLE"` (lines 45-47).

**The banner treats a sink as delivery.** `EffectiveProviderPanel`
(lines 83-137) warns only when `effective.canSend` is false (line 88). Otherwise
it prints "Email is sent by this workspace's own provider" and "Mail leaves as …
over {providerType}" (lines 105-129). A sink type that can "send" to a log is
reported exactly like SMTP.

**The form is always open.** The create/edit `SettingsPanel` is rendered
unconditionally above the list (lines 291-467).

**The developer copy is hardcoded.** The JSON description is at line 293.

## Root Cause

Established for the offer, the default and the banner:
- The supported-type list in `packages/config/email-providers.js:26` has no notion of environment, so sink providers are offered wherever the screen runs.
- The form preselects CONSOLE (`email-providers-manager.tsx:45-47`).
- `EffectiveProviderPanel` distinguishes only "can send" from "cannot send" (line 88), so a sink provider is described as delivering mail.
- The always-open form and the JSON copy are how the component is written (lines 291-293).

**Not yet established:** the element causing horizontal overflow at 1440px. The
provider table is `min-w-[900px]` but sits inside an `overflow-x-auto` wrapper
(lines 471-472), so it is not asserted as the cause.

## Impact

- Tenant administrators are told mail is being delivered when it is not, so notifications, invitations and scheduled reports silently go nowhere.
- On the demo tenant this is the current state, and production tenants configured the same way are equally affected.
- Once CONSOLE providers are removed, tenants fall back to the platform relay and **real email is sent**. That change must not ship before [[BUG-3500]]'s real template copy.
- Remaining findings are usability and trust defects on an administrator screen.

## Affected Areas

- `apps/web` Settings → Notifications → Email Providers (`email-providers-manager.tsx`).
- `packages/config` supported email provider types.
- API `notifications` module: provider creation, effective-provider resolution and send path for CONSOLE/DEV in production.
- Existing CONSOLE provider rows on production tenants (data change).
- The platform relay, which becomes the effective sender for those tenants.

## Proposed Resolution

Disposition is PLAN_REQUIRED: the change alters production delivery for existing
tenants and includes a data change. Write an ExecPlan covering:
- **Server enforcement:** the API refuses to create or enable CONSOLE/DEV providers in production. The UI hiding them is cosmetic.
- **Existing rows:** how existing CONSOLE providers are taken out of use in production (disable or remove), with a dry-run count, rollback and the resulting effective provider per tenant.
- **Sequencing:** ship with [[BUG-3500]]'s authored template copy in the same release.
- **Banner:** reports real delivery status. A sink provider is never described as sending mail.
- **Form:** the create form moves behind an "Add provider" action. Editing opens the same form for the chosen row.
- **Copy:** the JSON description is removed.
- **Layout:** the page fits 1440px without horizontal scroll.

## Acceptance Criteria

- In production, the Provider type select does not offer CONSOLE or DEV.
- In production, the API rejects creating or enabling a CONSOLE or DEV provider.
- After the rollout, no production tenant has an enabled CONSOLE provider. Tenants that had one resolve to the platform relay, and a test notification to a controlled mailbox is delivered.
- The banner never says mail is sent while the effective provider is a sink.
- The create form is hidden until "Add provider" is chosen.
- The text "Configuration JSON is sent to the backend as-is" no longer appears.
- `/settings/notifications/providers` has no horizontal scroll at 1440px.
- Non-production environments can still use CONSOLE/DEV.

## Regression Coverage

- An API unit test must fail today: provider creation with `providerType: CONSOLE` under a production environment must be rejected.
- A web test of `EffectiveProviderPanel` with a sink effective provider must assert it is not described as sending mail.
- REG entries to be added when the tests exist.

## Dependencies

- [[BUG-3500]] must ship in the same release.
- ADR-0015.
- An ExecPlan (PLAN_REQUIRED).

## Related Items

- [[BUG-3379]]: NOT_DELIVERED rows with providerType CONSOLE.
- [[BUG-3500]]: placeholder template copy.
- [[ITEM-0182]]: delivery logs.
- [[ITEM-0183]]: removes agent-added explanatory text from tenant screens.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
