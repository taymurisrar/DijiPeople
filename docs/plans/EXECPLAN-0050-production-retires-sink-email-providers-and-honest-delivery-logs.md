# EXECPLAN-0050 — Production retires sink email providers, and delivery logs say what happened

TASK-0031 · WP-06 · branch `agent/walkthrough2-providers-logs` · records BUG-3501,
ITEM-0182, ITEM-0183 (occurrence 4) · binding decision ADR-0015.

```
CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, apps/web/AGENTS.md, packages/config/AGENTS.md
  - docs/decisions/ADR-0015-production-retires-sink-email-providers.md (walkthrough2 worktree)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api        — provider validation, resolution, in-app log endpoint, audit
  - frontend           — Providers screen, delivery log channel switch, names
  - integration        — email provider behaviour change (real mail leaves the system)
  - security           — tenant scoping of the new log endpoint, secrets, audit
DELIBERATELY_NOT_USED:
  - database           — no schema change and no migration
  - ui-ux              — owner decisions D4/D5 already fix the UX

SINGLE_WRITER_FILES:
  - none (no schema, migration, permissions.ts, rbac-matrix.ts, app.module.ts, guards, security-keys.ts)

QA_REQUIRED: yes — changes production email delivery and two admin screens

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - doc-code-drift (names disagreeing across nav, card and title)
  - two catalogs for one rule (BUG-0050 / BUG-3241 shape)

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-515 — production API refuses to create, enable or default a CONSOLE/DEV provider
  - REG-516 — production provider resolution never returns a sink from any source
  - REG-517 — seed-config never creates a sink provider in production
  - REG-518 — the Providers banner states the real delivery path; form behind Add provider; no developer copy
  - REG-519 — delivery logs: reason column, in-app channel, one name, no selection checkboxes

TARGET_BRANCH:            develop (via the Architect's integration)
TARGET_ENVIRONMENT:       PRODUCTION (after release)
DEPLOYMENT_REQUIRED:      yes
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         api -> web (web tolerates the old API, see Migration)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes — must ship in the same release as BUG-3500 (real template copy)
POST_DEPLOY_QA_REQUIRED:  yes — controlled-mailbox test send on the demo tenant
MERGE_STRATEGY:           merge --no-ff (Architect)
KNOWN_CONCURRENT_WORK:    WP-04 edits the template section of seed-config.ts; WP-05 owns the rules/events page
ENVIRONMENT_DEPENDENCIES: none new — reads existing NODE_ENV and APP_ENV
```

## KNOWN_MISTAKES_TO_AVOID

Retrieved with `node scripts/retrieve-knowledge.mjs notifications email-providers delivery-logs`.

- **BUG-0050** — the UI offered what the enum allowed while the factory decided what was built. The selectable list must come from one place, and the UI must not work it out for itself.
- **BUG-1595** — the platform relay was invisible to the delivery path. Resolution changes go through `EffectiveEmailProviderService`, the single composition point, never a second copy.
- **BUG-2741** — a sink was reported as SENT. `isSinkProvider` stays the single predicate.
- **BUG-3379** — NOT_DELIVERED rows now store a reason. The column only has to display it.
- **BUG-3137** — tokens reached a tenant-readable log. The in-app log must not project `body`, `payload` or `metadata`.
- **BUG-3316** — formatting context omitted during SSR caused hydration crashes. Every date formatter gets the explicit context.
- **BUG-3241** — one rule with two call sites. Production detection lives in one function.
- **BUG-2043** — `forbidNonWhitelisted` makes an unexpected query parameter a 400. A new list DTO must accept exactly what `settingsListApiPath` sends.
- **Memory: guard the seam** — test the real client payload shape against the real validator.
- **Memory: CRLF makes source-reading specs pass vacuously** — never match a `\n` literal in a source assertion.

## Objective

In production, no CONSOLE or DEV email provider can be created, enabled, made default or become the effective sender, from any source. A tenant whose only providers are sinks therefore resolves to the DijiPeople platform relay and real email is delivered. `seed:config` stops creating sink providers in production. The Providers screen says in plain words whether this workspace's mail is delivered, and by what. The create form sits behind "Add provider", and the developer copy is gone. The Delivery Logs screen:
- has one name;
- shows a Reason column;
- offers an in-app channel alongside email;
- has no pointless selection checkboxes.

## Business requirement

ADR-0015 (owner, 2026-09-13), decisions 1, 2 and 4, and owner decisions D4, D5 and D9 in the walkthrough ledger:
- sink providers are not selectable or effective in production;
- existing sink rows are ignored, so tenants fall back to the platform relay;
- the screen states the real delivery path.

ITEM-0182 covers the logs. D9 requires shipping with BUG-3500's real template copy, which is WP-04, in the same release.

## Existing behavior

- **FACT** `packages/config/email-providers.js:26` — `SUPPORTED_EMAIL_PROVIDER_TYPES = ['CONSOLE','DEV','SMTP']`, with no environment input.
- **FACT** `email-providers-manager.tsx:45-47` — the form defaults to CONSOLE.
- **FACT** `email-providers-manager.tsx:83-137` — the banner branches only on `canSend`.
- **FACT** `email-providers-manager.tsx:291-293` — the form is always rendered, with the JSON description.
- **FACT** `email-providers-manager.tsx:472` — the table is `min-w-[900px]` inside `overflow-x-auto`. The wrapper is a child of `grid gap-6`, whose items default to `min-width: auto`. **INFERENCE:** the grid track therefore grows to the table's 900px min-content and the overflow wrapper never engages, which is the 1440px horizontal scroll once the settings sidebar takes its share.
- **FACT** `email-provider-factory.service.ts:45-58` — tenant resolution picks the default enabled row, even a sink.
- **FACT** `email-provider-factory.service.ts:64` — `fromEnvironment` accepts `EMAIL_PROVIDER=CONSOLE`.
- **FACT** `email-provider-factory.service.ts:69` — the dev fallback is gated only on `NODE_ENV !== 'production'`.
- **FACT** `platform-email-provider.resolver.ts:49-52` — any stored platform type other than SMTP resolves to CONSOLE.
- **FACT** `effective-email-provider.service.ts:41-51` — the tenant chain is tenant-only, then platform, then env/dev-fallback.
- **FACT** `notifications.service.ts:729-851` — create, update, set-default and disable do no environment check and write no audit.
- **FACT** `notifications.repository.ts:588-605` — `setDefaultProvider` also sets `enabled: true`.
- **FACT** `services/api/prisma/seed-config.ts:2435-2485` — `seedTenantConsoleProviders` upserts an enabled default CONSOLE provider for every tenant with no enabled provider. It is called at `:516`, and `render.yaml:38` runs `release` (which includes `seed:config`) before every deploy. It is also called by `seed-demo.ts:136`.
- **FACT** `settings-navigation.ts:529-530` labels the logs screen "Email Delivery Logs" / "Email Logs". `settings-adapter-registry.ts:6629` labels it "Delivery Logs". `settings-runtime.ts:208` names its group "Delivery History".
- **FACT** the Notifications card is `settings-navigation.ts:489` "Notifications", while `settings-runtime.ts:205`, `settings-adapter-registry.ts:6871` and `notifications/rules/page.tsx:39` all say "Notification Rules".
- **FACT** `settings-adapter-registry.ts:6644` — the log columns omit `errorMessage`, although BUG-3379 stores a reason for NOT_DELIVERED (`email-execution.service.ts:524-531`) and FAILED (`:417`, `:585`).
- **FACT** `standard-module-list-page.tsx:127` — `enableSelection` is hardcoded on. No list command on a read-only settings adapter consumes the selection (`module-list-page.tsx:111-124`, `standard-module-runtime.ts` commands).
- **FACT** in-app notifications are persisted in `Notification`, `NotificationRecipient` and `NotificationInteractionLog` (`schema.prisma:7861-7968`), all tenant-owned. The only list endpoint is per-user (`notifications.controller.ts:334`, `inbox.read`).

Must keep working:
- Non-production CONSOLE/DEV creation and resolution.
- The dev console fallback.
- Platform-first resolution for platform-originated mail.
- Retry refusal for sink tenants (`notifications.service.ts:384-395`).
- The masked-secret merge.
- The email log record page with Retry.

## Existing architecture

- **Provider catalog:** `@repo/config` `email-providers.js` (plain CJS, hand-written `index.d.ts`).
- **Sink predicate:** `isSinkProvider` in `services/api/src/modules/notifications/email/providers.ts`.
- **Resolution:**
  - `EmailProviderFactory.resolveProvider` handles tenant rows, then env, then dev fallback.
  - `PlatformEmailProviderResolver.resolve` handles the platform relay.
  - `EffectiveEmailProviderService` composes them. It is used by `EmailExecutionService`, `NotificationsService.describeEffectiveProvider` and the retry path. `NotificationDiagnosticsService` calls the factory directly.
- **Provider CRUD:** `NotificationsController` → `NotificationsService` → `NotificationsRepository`. `AuditService` is already injected into `NotificationsService` (`notifications.service.ts:89`).
- **Web:**
  - Providers is a bespoke specialized page (`settings/notifications/providers/page.tsx`); the adapter is `mode: "specialized"`.
  - Logs is a settings-runtime read-only list (`settings-runtime-pages.tsx` `SettingsRuntimeList`) at `/settings/notifications/delivery/delivery-logs`, rewritten from `/settings/notifications/logs` (`next.config.ts:130`).
- **Shared UI:** `Dialog` (`app/components/ui/dialog.tsx`), `DataTable` (`app/components/data-table/data-table.tsx`), `SegmentedControl`, `Button`, `EmptyState`.

## Requirements

1. R1 — One production predicate, `sinkEmailProvidersRetired(env)`, in `@repo/config`. It is true when `NODE_ENV` **or** `APP_ENV` (trimmed, lower-cased) equals `production`.
2. R2 — `selectableEmailProviderTypes(env)` = the supported types minus sinks when retired, the full supported list otherwise.
3. R3 — In production the API rejects:
   - creating a sink provider;
   - an update whose resulting row is a sink and enabled;
   - set-default on a sink.

   The rejection is a 400 `{ code: 'EMAIL_PROVIDER_TYPE_NOT_ALLOWED', message }`. Disabling a sink stays allowed.
4. R4 — In production, `resolveProvider`:
   - skips sink tenant rows;
   - ignores a sink `EMAIL_PROVIDER`;
   - never returns the dev fallback.

   `EffectiveEmailProviderService` ignores a sink platform relay. A tenant with only sink rows resolves to the platform relay.
5. R5 — Outside production, resolution and validation are byte-for-byte unchanged.
6. R6 — `seedTenantConsoleProviders` creates nothing in production and returns 0.
7. R7 — `GET /notifications/email-providers/effective` adds:
   - `deliveryPath`: `TENANT_PROVIDER` | `PLATFORM_RELAY` | `NOT_DELIVERED`;
   - `notDeliveredReason`: `NO_PROVIDER` | `SINK_PROVIDER` | `null`;
   - `sinkProvidersRetired`.

   Existing fields are unchanged.
8. R8 — `GET /notifications/email-providers/field-schema` adds `selectableProviderTypes`. `items` is unchanged.
9. R9 — The Providers banner:
   - says "delivered by this workspace's provider", "delivered by the DijiPeople platform relay" or "not delivered";
   - when not delivered, gives the reason in a few words;
   - never describes a sink as delivering.
10. R10 — Create/edit form:
    - it opens in a `Dialog` from "Add provider" / a row's "Edit";
    - the type options are the server's selectable list, plus a stored unavailable type shown disabled;
    - a new provider defaults to the first non-sink selectable type.
11. R11 — The Providers screen has none of the following:
    - the JSON developer note;
    - the Console warning box;
    - schema descriptions;
    - field help text;
    - the empty-state description;
    - the "needs no extra configuration" line;
    - the page description;
    - the banner's instructional sentences.
12. R12 — A sink row that production ignores shows the state "Not used". The providers list uses the shared `DataTable`, and the page has no horizontal scroll at 1440px or 400px.
13. R13 — Every provider create, update, set-default and disable writes an audit row. Snapshots carry no `configuration`.
14. R14 — The delivery log list shows a Reason column (`errorMessage`).
15. R15 — `GET /notifications/in-app-delivery-logs`:
    - is guarded by `notification.logs.read` + `REPORTS read`, exactly as email logs are;
    - is scoped to `user.tenantId`, paginated and searchable;
    - projects only title, event, recipient name/email, status, delivered/read timestamps and created time.
16. R16 — The Delivery Logs screen has an Email / In-app channel switch (`?channel=in-app`). In-app rows use a read-only adapter with record navigation off.
17. R17 — Log rows render without selection checkboxes.
18. R18 — The logs screen reads "Delivery Logs" in settings navigation, the landing card, the group label and the page title. The Notifications card reads "Notification Rules", as its page title and group already do.

## Dependencies

- BUG-3500 / WP-04 — real template copy. It must ship in the same release: **blocking for release, not for merge**.
- Platform relay configured and enabled as SMTP in production (`PlatformSetting` key `PLATFORM_EMAIL_SETTINGS_KEY`). Without it, sink-only tenants resolve to nothing and get FAILED "No enabled email provider is configured." rows. That is honest, but not delivery. Release/DevOps verifies it before deploy.

## Files / modules affected

`packages/config`
- `email-providers.js`, `index.js`, `index.d.ts`, new `email-providers.test.js`

`services/api`
- `src/modules/notifications/email/email-provider-factory.service.ts`
- `src/modules/notifications/email/effective-email-provider.service.ts`
- `src/modules/notifications/email/email-execution.service.ts` (reason wording only: "Email Providers screen")
- `src/modules/notifications/notifications.service.ts` (provider validation + audit, field schema, in-app logs)
- `src/modules/notifications/notifications.controller.ts` (field-schema delegation, new in-app log route)
- `src/modules/notifications/notifications.repository.ts` (tenant in-app log query)
- `src/modules/notifications/dto/in-app-delivery-log-query.dto.ts` (new), `dto/index.ts`
- specs: new `email/production-sink-retirement.spec.ts`, new `in-app-delivery-logs.spec.ts`; stub updates in `email-delivery-capability.spec.ts`, `email-sink-delivery-status.spec.ts`, `email-execution-rule-gate.spec.ts`, `platform-email-provider.resolver.spec.ts` where they stub the factory
- `prisma/seed-config.ts` — **only** `seedTenantConsoleProviders` (plus its import line)

`apps/web`
- `app/(authenticated)/settings/notifications/providers/page.tsx`
- `app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx`
- new `app/(authenticated)/settings/notifications/_components/email-delivery-path.ts` + `.spec.ts`
- `lib/notifications-api.ts` (types)
- `app/(authenticated)/settings/_lib/settings-navigation.ts` (notifications + logs entries only)
- `app/(authenticated)/settings/_lib/settings-adapter-registry.ts` (logs adapter, new in-app adapter, optional `recordNavigation` input)
- `app/(authenticated)/settings/_lib/settings-runtime.ts` (logs group label only)
- `app/(authenticated)/settings/_lib/delivery-log-channel.ts` + `.spec.ts` (new)
- `app/(authenticated)/settings/_components/delivery-log-channel-switch.tsx` (new)
- `app/(authenticated)/settings/_components/settings-runtime-pages.tsx` (logs channel branch)
- `app/components/runtime/standard-module-list-page.tsx` (additive `enableSelection` prop, default true)

## Database impact

None. No schema change, no migration, no data change. Existing sink rows stay in place and are ignored by production resolution (ADR-0015 permits this), which keeps rollback code-only.

## Backend impact

- **`EmailProviderFactory`** gains `sinkProvidersRetired(): boolean`. It reads `NODE_ENV`/`APP_ENV` through the existing `ConfigService`. `resolveProvider` applies it to tenant rows, the env provider and the dev fallback.
- **`EffectiveEmailProviderService`:**
  - `resolveForTenant`/`resolveForPlatform` drop a sink platform result when retired, through one private helper;
  - `describeForTenant` adds the R7 fields;
  - it exposes `sinkProvidersRetired()` so `NotificationsService` needs no new injection.
- **`NotificationsService`:**
  - `createProvider`, `updateProvider` and `setDefaultProvider` call `assertProviderTypeAllowed`;
  - all four writes call `AuditService.log`, with actions `email_provider.created|updated|default_set|disabled` and entity `EmailProviderSetting`;
  - new `listProviderFieldSchema()` and `listInAppDeliveryLogs(user, query)`.
- **`NotificationsRepository.listTenantInAppDeliveryLogs(tenantId, query)`** is a `notificationRecipient.findMany` + `count` where `tenantId`, with explicit `select`.
- **New endpoint** `GET /notifications/in-app-delivery-logs?search&page&pageSize` returns `{ items, page, pageSize, total, totalPages }`. Each item carries `id`, `title`, `eventCode`, `recipient`, `recipientName`, `status`, `deliveredAt`, `readAt`, `createdAt`.
- **No transaction changes:** audit is written after the repository call, matching `notification_preference.updated` at `notifications.service.ts:207`.

## Frontend impact

- **Providers stays bespoke.** The runtime cannot express masked-secret merges, schema-driven fields, or default and disable commands; the adapter already records this as its `blocker`.
- **Components reused:** `Dialog`, `DataTable`, `Button`, `EmptyState`.
- **Logs stay in the settings runtime.** A second read-only adapter serves the in-app channel, and a client `SegmentedControl` wrapper switches `?channel`.
- **States:** loading and error come from the route conventions; empty uses `EmptyState` (title only); access denied comes from `requireSettingsPermissions`.
- **Responsive:** grid children get `min-w-0`, and the table scrolls inside itself.
- **Accessibility:** the Dialog provides focus trap, Escape and a name. Every control keeps a label, and state is text.

## Permission / RBAC impact

- No new or changed keys in `permissions.ts` or `rbac-matrix.ts`.
- The new endpoint uses the existing `notification.logs.read` + `ENTITY_KEYS.REPORTS read` — both decorators, identical to `email-delivery-logs`.
- No row-level scope, matching the email log: it is a tenant-administration view gated by a log permission.
- No elevated-role change, and no `security-keys.ts` change (`NOTIFICATION_LOGS_READ` is already mirrored).

## Tenant-isolation impact

- **In-app log query:** `where: { tenantId: user.tenantId }`, from `@CurrentUser()`; search terms are added under that AND. Relations are selected through the recipient row, which is tenant-owned. No `tenantId` input is accepted.
- **Provider writes:** they keep `findFirst({ id, tenantId })` (`notifications.repository.ts:541-549`). The new type check reads the existing row the same way.
- **Resolution:** it stays keyed by `tenantId`. The platform relay is global by design (BUG-1595) and read-only here.
- **Reviewer check:** grep `listTenantInAppDeliveryLogs` for `tenantId`. The spec asserts the where clause.

## Audit / event / logging impact

- **Audited:** provider create, update, set-default and disable. The snapshot holds `providerType`, `providerName`, `enabled`, `isDefault`, `fromEmail`, `fromName` and `replyToEmail`.
- **Never logged or audited:** configuration, secrets, notification bodies or payloads.
- **No new platform events.**

## Integration impact

- **Email: the behaviour changes.** Real mail leaves through the platform SMTP relay for tenants that were sink-only.
- **No change** to the gateway, desktop agent, Stripe or storage.

### Tenants that start sending real mail after deploy (by rule, not by query)

This assumes the platform relay is enabled as SMTP.

1. **Every tenant whose enabled providers are all CONSOLE/DEV** moves to the platform relay. Because `seed:config` has upserted an enabled default "Console Provider" for every tenant that had no enabled provider on every deploy, this is in practice **every tenant that never configured its own SMTP provider** — the demo tenant included.
2. **Every tenant whose default enabled provider is a sink but which also has an enabled SMTP row** moves to its own SMTP row.
3. **Tenants whose effective provider is already SMTP** (their own, or the relay because they had no enabled rows) are unchanged.
4. **Platform-originated mail** whose platform relay is absent now skips tenant sinks the same way.
5. **If the platform relay is disabled, or stored as a non-SMTP type,** sink-only tenants resolve to nothing. Their mail is recorded FAILED with a reason and is not delivered.

## Migration / data compatibility

- **Stored data:** sink rows remain and are shown as "Not used" in production. A tenant admin can edit a row to SMTP or disable it.
- **New web against old API:**
  - `selectableProviderTypes` is absent → the web falls back to the supported non-sink types;
  - `deliveryPath` is absent → it derives the path from `canSend` / `inherited` / `providerType`;
  - the in-app channel would 404, so API ships first.
- **Old web against new API:** fields are additive. Server enforcement makes a stale CONSOLE option fail with a readable 400.
- **Mixed versions:** old and new can run side by side.

## Parallel-safe tasks

- `PARALLEL_SAFE` — the `@repo/config` predicate + node tests.
- `PARALLEL_SAFE` — the delivery log names and Reason column (web settings libs).

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — API validation, resolution and seed, which need the `@repo/config` predicate.
- `DEPENDENCY_BLOCKED` — the Providers screen, which needs the R7/R8 contract.
- `DEPENDENCY_BLOCKED` — the in-app channel UI, which needs the endpoint.

## Integration tasks

- `INTEGRATION` — Architect: merge with WP-04 (same `seed-config.ts`, different section) and WP-05, run the full validation, then do the throwaway-DB browser check.
- `INTEGRATION` — Release: confirm the platform relay is SMTP and enabled before deploy, then send a controlled-mailbox test from the demo tenant after deploy.

## Testing strategy

**Commands**
- `node --test packages/config/email-providers.test.js`
- `npm --workspace api run test -- notifications` (with a dummy `DATABASE_URL`)
- `npm --workspace api run check-types`
- `npm --workspace web run test -- notifications settings`
- `npm --workspace web run check-types`
- `npx eslint --fix` on changed files

**New specs**
- `email-providers.test.js` — predicate truth table, including `NODE_ENV=development` + `APP_ENV=production`; selectable list.
- `production-sink-retirement.spec.ts`:
  - create CONSOLE rejected in production and accepted in development;
  - the real web payload shape against the real service;
  - update-to-enabled-sink rejected, disable-a-sink allowed;
  - set-default on a sink rejected;
  - a sink-only tenant resolves to the platform relay;
  - `EMAIL_PROVIDER=CONSOLE` ignored and no dev fallback in production;
  - a sink platform relay ignored;
  - `describeForTenant` delivery paths;
  - `seedTenantConsoleProviders` writes nothing in production;
  - audit rows carry no configuration.
- `in-app-delivery-logs.spec.ts` — tenant-scoped where clause; the projection omits body, payload and metadata; both permission decorators present.
- Web `email-delivery-path.spec.ts` — banner wording per path, a sink never "delivered", type options, removed strings absent.
- Web `delivery-log-channel.spec.ts`:
  - the channel resolver;
  - the logs adapter lists `errorMessage`;
  - the in-app adapter has record navigation off;
  - nav, adapter and group all read "Delivery Logs";
  - the Notifications nav label equals its adapter label.

**Manual, on the throwaway DB**
1. With `APP_ENV=production`, open Providers and confirm there are no CONSOLE/DEV options and a sink row shows "Not used".
2. Confirm the banner reads "delivered by the DijiPeople platform relay" when the relay is enabled.
3. Confirm Add provider opens the dialog.
4. Confirm there is no scroll at 1440px or 400px.
5. On Delivery Logs, confirm the Reason column, the In-app switch and the absence of checkboxes.

## Risks

1. **Real mail to real people** — likelihood certain, impact high.
   - *Mitigation:* ADR-0015 accepts it. Ship only with BUG-3500 copy. Demo employee addresses are non-deliverable.
2. **Platform relay not enabled in production** — likelihood low, impact medium: mail becomes FAILED rather than silently discarded.
   - *Mitigation:* a release check. The banner says "not delivered".
3. **Staging treated as non-production** — likelihood low, since staging does not exist.
   - *Mitigation:* documented. Add `staging` to the predicate in one place when a staging environment appears.
4. **Stub specs break when the factory gains a method** — likelihood high, impact low: tests only.
   - *Mitigation:* update the stubs in the same commit.
5. **In-app log exposes notification content** — likelihood low, impact medium.
   - *Mitigation:* explicit `select`, pinned by a spec.
6. **WP-05 renames the rules page** — likelihood medium, impact low: the names would drift again.
   - *Mitigation:* the spec pins nav label == adapter label, so a partial rename goes red.

## Rollback considerations

- **Code-only.** Reverting restores sink resolution. Because no row was changed and seeding simply stopped, the prior state returns on the next `seed:config` run.
- **Web without API:** the in-app channel fails and the banner falls back to derived wording.
- **API without web:** the old screen still offers CONSOLE, but the server refuses it with a readable message.

## Definition of Done

- [ ] The listed validation commands run and pass; results are reported exactly.
- [ ] Production refusal and resolution tests fail on the pre-change tree (mutation-checked).
- [ ] Audit is written on all four provider writes, with no configuration in snapshots.
- [ ] The new endpoint carries both permission decorators, and its tenant scope is asserted.
- [ ] No explanatory copy added; the listed copy is removed.
- [ ] The stream report `docs/tasks/TASK-0031-streams/WP-06-report.md` is written, with REG-515…519 entry text.
- [ ] No files outside the list above, and no record, index or generator edits.
