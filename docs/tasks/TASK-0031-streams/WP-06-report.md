# TASK-0031 · WP-06 stream report — sink email providers and delivery logs

Stream report of [[TASK-0031]].

Branch `agent/walkthrough2-providers-logs` (based on `origin/develop` 88f33c6e).
ExecPlan: [`docs/plans/EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs.md`](../../plans/EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs.md).
Binding decision: ADR-0015. Reserved regression ids REG-515 … REG-519.

Record files were not edited, because they do not exist on develop yet. This
report carries what the Architect merges into them.

---

## BUG-3501 — the email provider screen presented a console sink as delivery

**Status proposed:** FIXED (browser retest pending).

### Root cause

- `packages/config/email-providers.js:26` — the supported types included CONSOLE and DEV, with no environment input. The UI offered them everywhere.
- `services/api/src/modules/notifications/email/email-provider-factory.service.ts:45-58` — tenant resolution chose the default enabled row even when it was a sink.
- The same factory file:
  - `:64` — `fromEnvironment` accepted `EMAIL_PROVIDER=CONSOLE`;
  - `:69` — the dev fallback was gated on `NODE_ENV` alone.
- `services/api/src/modules/notifications/email/platform-email-provider.resolver.ts:49-52` — a non-SMTP platform relay resolved to the console sink.
- `services/api/src/modules/notifications/notifications.service.ts:729-851` — provider create, update, set-default and disable had no environment check and wrote no audit row.
- `services/api/prisma/seed-config.ts:2435-2485` — `seedTenantConsoleProviders` upserted an enabled default Console provider for every tenant with no enabled provider. `render.yaml:38` runs it on every deploy.
- `email-providers-manager.tsx` (pre-change):
  - `:45-47` — the form defaulted to CONSOLE;
  - `:88` — the banner branched only on `canSend`;
  - `:291-293` — the form was always open, with the JSON note.
- **Horizontal overflow (cause inferred from code, confirm in the browser):** the settings layout's own column is `minmax(0,1fr)` (`apps/web/app/components/settings/settings-layout.tsx:40`), but the manager's inner `grid gap-6` was not. Its auto column could grow to the `min-w-[900px]` table (pre-change `email-providers-manager.tsx:281`, `:472`), so the table's `overflow-x-auto` wrapper never engaged.

### Fix

**Production detection**
- `sinkEmailProvidersRetired(env)` in `@repo/config` is true when `NODE_ENV` **or** `APP_ENV` is `production`. It checks both, so neither masks the other; Render sets both.
- `staging` is deliberately excluded: the decision covers production only, and no staging environment exists.
- The API reads it once, through `EmailProviderFactory.sinkProvidersRetired()`, via `ConfigService`. The seed passes `process.env`.

**API refusal**

Production returns 400 `{ code: "EMAIL_PROVIDER_TYPE_NOT_ALLOWED" }` for:
- creating CONSOLE or DEV;
- an update whose resulting row is a sink and enabled;
- switching a row into a sink type;
- set-default on a sink (set-default also enables).

Disabling a sink row, or switching it to SMTP, stays allowed so administrators can clean up.

**Resolution in production**
- `EmailProviderFactory` skips sink tenant rows and a sink `EMAIL_PROVIDER`, and never returns the dev fallback.
- `EffectiveEmailProviderService` drops a sink platform relay, so a sink-only tenant resolves to the SMTP platform relay.
- `NotificationDiagnosticsService` goes through the same factory, so it gets this too.
- Development and test behaviour is unchanged, pinned by tests.

**Seeding**

`seedTenantConsoleProviders` returns 0 in production. Only that function and one import changed in `seed-config.ts`.

**Contract** (additive)
- `GET /notifications/email-providers/effective` adds `deliveryPath`, `notDeliveredReason` and `sinkProvidersRetired`.
- `GET /notifications/email-providers/field-schema` adds `selectableProviderTypes`. The web offers exactly that list; with an older API it offers no sink.

**Audit**

`email_provider.created`, `email_provider.updated`, `email_provider.default_set` and `email_provider.disabled` are written on entity `EmailProviderSetting`. Snapshots carry type, name, enabled, default and sender fields, never `configuration`.

**Screen** (`email-providers-manager.tsx`, `providers/page.tsx`, new `email-delivery-path.ts`)
- **Banner:** "Email is delivered by this workspace's provider", "Email is delivered by the DijiPeople platform relay", or "Email is not delivered". The not-delivered reason is either "No email provider is available." or "The Console provider does not send email." The sender line reads "Sent as …".
- **Form:** it lives in the shared `Dialog`, opened by "Add provider" or a row's "Edit". A new provider defaults to the first non-sink type. A stored unavailable type shows as "(not available)", disabled.
- **List:** the shared `DataTable` replaces the hand-rolled table. A sink row that production ignores shows the state "Not used", and Set Default is not offered for it. Disable uses the shared `ConfirmDialog` instead of `window.confirm`.
- **Copy removed (ITEM-0183 occurrence 4 included):**
  - the JSON note;
  - the Console warning box;
  - schema descriptions;
  - field help text;
  - "This provider needs no extra configuration.";
  - the empty-state description;
  - the banner's instructional sentences;
  - the page description.
- **Layout:** every grid child is `min-w-0`, and the table scrolls inside `DataTable`'s own `overflow-x-auto`.

### Tests added

- `packages/config/email-providers.test.js` — predicate truth table, including the masking case; staging; selectable list.
- `services/api/src/modules/notifications/email/production-sink-retirement.spec.ts`:
  - the catalog agrees with `isSinkProvider`;
  - factory: sink rows ignored, SMTP preferred over a default sink, `EMAIL_PROVIDER=CONSOLE` ignored, no dev fallback, `APP_ENV` masking;
  - effective provider: sink-only tenant goes to the platform relay, sink relay ignored, delivery paths;
  - service: the real web payload validated by the real DTO, then refused; DEV refused; edit, disable, switch and set-default rules; audit without configuration; selectable list;
  - seed writes nothing in production.
- **Mutation-checked:** with `sinkEmailProvidersRetired` forced to false, 7 of its 24 tests fail. The others stub the environment answer and test the service refusal itself.
- `services/api/src/modules/notifications/email/email-delivery-capability.spec.ts` — stub gains `sinkProvidersRetired: () => false` (development chain).
- `apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.spec.ts`:
  - banner wording per path;
  - a sink is never "delivered", including against an older API without `deliveryPath`;
  - type options;
  - "Not used" state;
  - removed copy stays absent (source assertions with plain `includes`, no newline literals);
  - form behind "Add provider" in a `Dialog`.

### Regression entries

**REG-515** — Production API refuses sink email providers
- Record: BUG-3501 · ADR-0015
- Rule: with `NODE_ENV` or `APP_ENV` = production, `POST /notifications/email-providers` with CONSOLE or DEV returns 400 `EMAIL_PROVIDER_TYPE_NOT_ALLOWED`, and so does an update that leaves a sink row enabled, switches a row into a sink type, or sets a sink as default. Disabling a sink row or switching it to SMTP succeeds.
- Guard: `services/api/src/modules/notifications/email/production-sink-retirement.spec.ts` ("NotificationsService provider writes in production").

**REG-516** — Production provider resolution never returns a sink
- Record: BUG-3501 · ADR-0015
- Rule: in production, tenant sink rows, a sink `EMAIL_PROVIDER`, a sink platform relay and the dev console fallback are all ignored. A tenant whose only providers are sinks resolves to the platform relay.
- Guard: `production-sink-retirement.spec.ts` ("EmailProviderFactory in production", "EffectiveEmailProviderService in production"), plus `packages/config/email-providers.test.js`.

**REG-517** — seed-config never creates a sink provider in production
- Record: BUG-3501
- Rule: `seedTenantConsoleProviders` returns 0 and performs no read or write when `NODE_ENV` or `APP_ENV` is production.
- Guard: `production-sink-retirement.spec.ts` ("seedTenantConsoleProviders").

**REG-518** — The Email Providers screen states the real delivery path
- Record: BUG-3501 · ITEM-0183 (occurrence 4)
- Rule:
  - the banner never describes a CONSOLE or DEV provider as delivering, including against an API without `deliveryPath`;
  - production offers no sink type;
  - the form opens only from "Add provider" or "Edit";
  - the developer note "Configuration JSON is sent to the backend as-is" is absent.
- Guard: `apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.spec.ts`.

**REG-519** — Delivery Logs: reason column, in-app channel, one name, no checkboxes
- Record: ITEM-0182
- Rule:
  - the email log lists `errorMessage` (Reason) beside Status;
  - `?channel=in-app` serves tenant in-app deliveries from `GET /notifications/in-app-delivery-logs` (tenant-scoped, `notification.logs.read` + REPORTS read, no notification content);
  - navigation, settings group, adapter and page title all read "Delivery Logs";
  - the Notifications card label equals its page and adapter label;
  - log rows have no selection checkbox.
- Guards: `apps/web/app/(authenticated)/settings/_lib/delivery-log-channel.spec.ts`, `services/api/src/modules/notifications/in-app-delivery-logs.spec.ts`.

### QA retest steps (throwaway DB, then the demo tenant after release)

1. **Local, `APP_ENV=production`, tenant holding only an enabled default Console provider.** Open Settings → Notifications → Email Providers.
   - With the platform relay enabled as SMTP, the banner reads "Email is delivered by the DijiPeople platform relay". With it disabled, the banner reads "Email is not delivered", with "No email provider is available."
   - The Console row's state is "Not used", with no Set Default.
2. **Add provider.** A dialog opens. Provider type offers only SMTP, and Escape closes it.
3. **Edit the Console row.** The type shows "Console (not available)". Saving with Enabled ticked shows the refusal message. Unticking Enabled saves.
4. **Direct API.** `POST /api/notifications/email-providers` with `providerType: "CONSOLE"` returns 400 `EMAIL_PROVIDER_TYPE_NOT_ALLOWED`.
5. **Without `APP_ENV`/`NODE_ENV` production.** CONSOLE and DEV are offered. A Console default gives "Email is not delivered", with "The Console provider does not send email."
6. **Layout.** 1440px and 400px widths show no horizontal page scroll, and there is no JSON note, help text or page description.
7. **Seed.** Run `npm run seed:config` with `APP_ENV=production` against a tenant with no provider. No "Console Provider" row is created.
8. **After release, on the demo tenant.** Send a template test to a controlled mailbox; it arrives. The delivery log row is SENT with providerType SMTP.

### Tenants that start sending real email after deploy (by rule)

This requires the platform relay (admin Settings → Email) to be enabled as SMTP in production.

- **Every tenant whose enabled providers are all CONSOLE/DEV** moves to the platform relay. Because `seed:config` has upserted an enabled default "Console Provider" into every tenant that had no enabled provider on every deploy, this is effectively **every tenant that never configured its own SMTP provider**, the demo tenant included. Their notification, invitation, password-reset, approval and scheduled-report mail becomes real.
- **Every tenant with a default sink plus an enabled SMTP row** moves to its own SMTP row.
- **Unchanged:** tenants already resolving to their own SMTP default, and tenants with no enabled row (already on the relay).
- **If the relay is not SMTP and enabled:** sink-only tenants resolve to nothing. Their sends are recorded FAILED, with "No enabled email provider is configured.", and are not delivered.

### Residual risks

- **Real mail must ship with BUG-3500 / WP-04 copy in the same release** (ADR-0015, D9).
- **Sink rows remain stored**, shown as "Not used" in production. A later cleanup is optional.
- **Staging is not treated as production.** Revisit when a staging environment exists; there is one place to change.
- **Local verification used path-mapped `@repo/config`.** The worktree's `node_modules` junction resolves a stale copy from the primary checkout, so CI is the first unmapped typecheck and jest run.

---

## ITEM-0182 — delivery logs that cover in-app notifications and say why

**Status proposed:** DONE (browser retest pending).

### Root cause

- `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts:6644` — the list columns omitted `errorMessage`. BUG-3379 stores it for NOT_DELIVERED (`email-execution.service.ts:524-531`) and FAILED (`:417`, `:585`), but it was visible only on the record page.
- No tenant-wide in-app log endpoint existed. The only list is per-user inbox, `notifications.controller.ts:334`.
- `apps/web/app/components/runtime/standard-module-list-page.tsx:127` hardcoded `enableSelection`, and no list command on a read-only settings adapter uses the selection.
- **Names** (the landing card and the page `SettingsShell` title both use the navigation label):

  | Where | Before | After |
  |---|---|---|
  | `settings-navigation.ts:529-530` | "Email Delivery Logs" / "Email Logs" | "Delivery Logs" |
  | `settings-adapter-registry.ts:6629` | "Delivery Logs" | "Delivery Logs" |
  | `settings-runtime.ts:208` group | "Delivery History" | "Delivery Logs" |
  | Notifications card `settings-navigation.ts:489` | "Notifications" | "Notification Rules" |

  The Notifications card's page title, group and adapter already read "Notification Rules".

### Fix

- **Reason column.** It is added beside Status. The NOT_DELIVERED reason now names the "Email Providers" screen, which was "Notification Providers".
- **In-app channel.** `GET /notifications/in-app-delivery-logs?search&page&pageSize`:
  - both decorators are identical to the email log;
  - `where.tenantId` comes from the session;
  - an explicit `select`: title, event code, recipient name and email, status, delivered/read/created timestamps;
  - no body, payload or metadata;
  - a DTO that accepts exactly what the settings list sends.
- **Channel switch.** Web adds the `notification-in-app-logs` read-only adapter, with record navigation off, and a shared `SegmentedControl` "Channel" switch (Email / In-app). The switch sets `?channel=in-app` on the same URL; pagination keeps the channel.
- **Checkboxes.** They are removed from both log channels through a new additive `enableSelection` prop, default `true`.
- **Names.** "Delivery Logs" is used everywhere; the Notifications card reads "Notification Rules".
- **No schema change.**

### Tests added

- `services/api/src/modules/notifications/in-app-delivery-logs.spec.ts`:
  - tenant scoping of `findMany` and `count`;
  - the select excludes content;
  - service flattening, with the tenant taken from the session;
  - the DTO accepts the runtime query and rejects `tenantId`;
  - route metadata equals the email log's in both permission systems.
- `apps/web/app/(authenticated)/settings/_lib/delivery-log-channel.spec.ts`:
  - channel resolution, adapter choice and href;
  - Reason column position;
  - in-app adapter shape, with record navigation off, while the email log keeps navigation;
  - one name across nav, runtime item, group and both adapters;
  - the Notifications card equals its adapter and group.

### Regression entry

REG-519 (above).

### QA retest steps

1. Open Settings → Notifications. The cards read "Notification Rules", "Email Templates", "Email Providers" and "Delivery Logs", and each opened page title matches its card.
2. Open Delivery Logs.
   - NOT_DELIVERED and FAILED rows show text in the Reason column.
   - There are no row checkboxes.
   - Clicking an email row still opens the record, with Retry when permitted.
3. Choose Channel → In-app. The URL gains `?channel=in-app` and rows list the notification, recipient, status, read and created times. Rows do not navigate, pagination keeps the channel, and Email returns to the email log.
4. As a user without `notification.logs.read`, `GET /api/notifications/in-app-delivery-logs` returns 403.
5. At 400px the channel switch and table fit, and the table scrolls inside itself.

### Residual risks

- **The in-app list has no status filter in the UI**, only paging. Search is available through the API.
- **If WP-05 renames the rules page**, nav, adapter, group and page title must change together. `delivery-log-channel.spec.ts` fails on a partial rename.
- **The 13 identical scheduled-report rows** seen on the demo tenant are real sends, not a display fault. They were not deduplicated.

---

## Files touched outside the declared ownership

- `apps/web/app/components/runtime/standard-module-list-page.tsx` — additive `enableSelection` prop, default `true`; needed to remove the log checkboxes.
- `apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx` — the Delivery Logs channel branch, beside the existing `notification-email-logs` branch.
- `apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts` — the logs group label only.
- `apps/web/lib/notifications-api.ts` — types for the additive contract fields.
- `services/api/src/modules/notifications/email/email-execution.service.ts` — one reason string ("Email Providers screen").
- `services/api/src/modules/notifications/notifications.repository.ts` / `dto/` — the in-app log query and its DTO.
