---
ID: BUG-3501
aliases: [BUG-3501]
Title: The email provider screen presents a console sink as delivery and offers sink providers in production
Status: FIXED
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
RegressionId: REG-515
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0015-production-retires-sink-email-providers.md
RelatedImplementation: [docs/plans/EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs.md, packages/config/email-providers.js, services/api/src/modules/notifications/email/email-provider-factory.service.ts, services/api/src/modules/notifications/notifications.service.ts, services/api/prisma/seed-config.ts, apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx, apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.ts]
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

TASK-0031 WP-06 inferred it from code, to be confirmed in the browser: the
settings layout's own column is `minmax(0,1fr)`
(`apps/web/app/components/settings/settings-layout.tsx:40`), but the manager's
inner `grid gap-6` was not, so its auto column could grow to the table's
`min-w-[900px]` and the table's `overflow-x-auto` wrapper never engaged.

**Also found during WP-06** (line numbers at `88f33c6e`): the resolution path
chose a sink too. `email-provider-factory.service.ts:45-58` took the default
enabled tenant row even when it was a sink, `:64` accepted
`EMAIL_PROVIDER=CONSOLE`, `:69` gated the development fallback on `NODE_ENV`
alone, and `platform-email-provider.resolver.ts:49-52` resolved a non-SMTP
platform relay to the console sink. Provider writes in `notifications.service.ts`
had no environment check and no audit row, and `seedTenantConsoleProviders` in
`seed-config.ts` re-created an enabled Console default for every tenant without
an enabled provider on every release.

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

QA scenarios QA-SETTINGS-030 (API, resolution, seed) and QA-SETTINGS-031 (screen).

- REG-515 (write refusal), REG-516 (resolution never returns a sink) and REG-517
  (seed): `services/api/src/modules/notifications/email/production-sink-retirement.spec.ts`,
  plus `packages/config/email-providers.test.js` for the environment predicate
  (including the `APP_ENV` masking case and staging). Mutation: forcing
  `sinkEmailProvidersRetired` to false fails 7 of the spec's 24 tests; the rest
  stub the environment answer and test the refusal itself.
- REG-518 (the banner and screen):
  `apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.spec.ts`
  — banner wording per path, a sink never "delivered" even against an older API,
  type options, the "Not used" state, removed copy, the form behind "Add
  provider".
- `services/api/src/modules/notifications/email/email-delivery-capability.spec.ts`
  keeps the development chain pinned.

Both requirements below are met.

As filed, the record required:

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

Fixed in TASK-0031 WP-06 (commit 11e987a6 on `agent/walkthrough2-providers-logs`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0050), applying
ADR-0015 and shipping with [[BUG-3500]].

- **Production detection.** `sinkEmailProvidersRetired(env)` in `@repo/config`
  is true when `NODE_ENV` or `APP_ENV` is `production` (either one, so neither
  masks the other). `staging` is deliberately excluded. The API reads it once
  through `EmailProviderFactory.sinkProvidersRetired()`; the seed passes
  `process.env`.
- **API refusal.** In production, creating CONSOLE or DEV, an update leaving a
  sink row enabled, switching a row into a sink type, and set-default on a sink
  all return 400 `EMAIL_PROVIDER_TYPE_NOT_ALLOWED`. Disabling a sink row, or
  switching it to SMTP, stays allowed.
- **Resolution in production.** `EmailProviderFactory` skips sink tenant rows and
  a sink `EMAIL_PROVIDER` and never returns the development fallback;
  `EffectiveEmailProviderService` drops a sink platform relay, so a sink-only
  tenant resolves to the SMTP platform relay. Diagnostics use the same factory.
  Development and test behaviour is unchanged.
- **Existing rows.** Not deleted: a sink row production ignores is shown as "Not
  used". `seedTenantConsoleProviders` returns 0 in production, so no release
  re-creates one.
- **Contract (additive).** `GET …/email-providers/effective` adds `deliveryPath`,
  `notDeliveredReason` and `sinkProvidersRetired`; `GET …/field-schema` adds
  `selectableProviderTypes`, and the web offers exactly that list.
- **Audit.** Provider create, update, set-default and disable are audited on
  `EmailProviderSetting`, never including `configuration`.
- **Screen.** The banner reads "Email is delivered by this workspace's provider",
  "Email is delivered by the DijiPeople platform relay" or "Email is not
  delivered" with its reason; the form lives in a `Dialog` opened by "Add
  provider" or a row's Edit, defaulting to the first non-sink type; the shared
  `DataTable` replaces the hand-rolled table and `ConfirmDialog` replaces
  `window.confirm`; the JSON note and other explanatory copy are removed
  (ITEM-0183 occurrence 4).
- **Horizontal overflow.** Cause inferred from code: the manager's inner grid
  column could grow to the table's `min-w-[900px]`, so the table's own
  `overflow-x-auto` never engaged. Every grid child is now `min-w-0`.

Effect on release: every tenant whose enabled providers are all CONSOLE or DEV,
effectively every tenant that never configured its own SMTP provider, the demo
tenant included, starts sending real mail through the platform relay.

Verified on production (read-only check, 2026-09-13; TASK-0031 assumption A-02
now HIGH): the platform relay is enabled as SMTP on Mailtrap live SMTP, not a
sandbox; production has 3 tenants, and all 3 are sink-only (CONSOLE). All three
will therefore receive real mail through the relay once this release is deployed.

## QA Retest

Pending — browser verification on a throwaway database and on production in
TASK-0031 WP-07/WP-08. Scenarios QA-SETTINGS-030 (API, resolution, seed) and
QA-SETTINGS-031 (screen):

1. Locally with `APP_ENV=production` and a tenant holding only a default Console
   provider: with the relay enabled as SMTP the banner reads "Email is delivered
   by the DijiPeople platform relay"; with it disabled, "Email is not
   delivered" and "No email provider is available."; the Console row reads "Not
   used" with no Set Default.
2. Add provider opens a dialog offering only SMTP; Escape closes it.
3. Edit the Console row: "Console (not available)"; saving enabled is refused;
   unticking Enabled saves.
4. `POST /api/notifications/email-providers` with CONSOLE returns 400
   `EMAIL_PROVIDER_TYPE_NOT_ALLOWED`.
5. Without production settings, CONSOLE and DEV are offered and a Console default
   reads "Email is not delivered" with "The Console provider does not send
   email."
6. 1440px and 400px: no horizontal page scroll, no JSON note or help text.
7. `npm run seed:config` with `APP_ENV=production` creates no Console provider.
8. After release, on the demo tenant: a template test arrives, logged SENT with
   providerType SMTP.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-06; unit-tested; browser verification pending.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]], [[tenant-application]]
- Implementation — [[EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs]]
- Regression — REG-515 (see the regression register)

<!-- GRAPH:END -->
