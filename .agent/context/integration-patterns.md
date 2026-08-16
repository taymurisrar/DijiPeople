# Integration Patterns

> **Last verified:** 2026-08-16
> **Verified against commit:** 78072d2
> **Key source files:** services/api/src/main.ts, services/api/src/modules/billing/, services/api/src/modules/agent/, services/api/src/modules/attendance-integrations/, services/api/src/modules/attendance-integrations/gateways/gateway-auth.guard.ts, services/api/src/modules/notifications/email/, services/api/src/common/mailer/mailer.service.ts, services/api/src/common/security/secret-encryption.service.ts, services/api/src/modules/partner-experience/partner-auth.guard.ts, apps/agent-desktop/src/main/, gateway/DijiPeople.Gateway.sln, tools/zkteco-poc/, render.yaml
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

Four external-boundary integrations exist at this commit: **Stripe billing**,
**outbound email**, the **Electron agent desktop client**, and the **partner
experience portal**. Each crosses a trust boundary and each has its own auth
mechanism.

### 1. Stripe billing — `services/api/src/modules/billing/`

Layout: `controllers/` (`billing`, `public-billing`, `stripe-webhook`),
`services/` (`billing`, `stripe-billing`, `webhook` + spec), `constants/`,
`dto/`, `types/`, plus `billing-seat-pricing.ts` and `promotion-pricing.ts`
(each with a spec).

**Raw body requirement is configured in `main.ts`, not in the module.**
`NestFactory.create(AppModule, { bodyParser: false, ... })` disables Nest's
parsers, then `configureBodyParsing(expressApp)` installs them selectively:

- `/api/billing/stripe/webhook` → `raw({ type: 'application/json', limit: '2mb' })`
- `/api/super-admin/platform-email/templates` → `json({ limit: '10mb' })`
- everything else → `json({ limit: '1mb' })` + `urlencoded({ extended: true, limit: '1mb' })`

Two subsequent middlewares call `isStripeWebhookRequest(req, stripeWebhookPath)`
(exact path match on `originalUrl` minus query string) and `next()` past the JSON
and urlencoded parsers. **Changing this path, or reordering these middlewares,
breaks Stripe signature verification silently.**

**Idempotency** is explicit in `WebhookService.processStripeEvent`:
`ensureWebhookEventRecord(event)` persists a `StripeWebhookEvent` row keyed on
the Stripe event id; if its `processingStatus` is already `PROCESSED` or
`IGNORED` the handler returns `{ duplicate: true }` without re-dispatching. On
success the row moves to `PROCESSED`/`IGNORED` with `processedAt`; on throw it
moves to `FAILED` with a sanitized `errorMessage` and the error is rethrown so
Stripe retries. Every outcome is mirrored to `PlatformEventsService` with
`eventCode: 'STRIPE_WEBHOOK_PROCESSED'`, `correlationId: event.id`.

Stripe env vars referenced in `src`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_API_VERSION`, `STRIPE_MODE`,
`STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL`,
`STRIPE_PORTAL_RETURN_URL`. **None are in `render.yaml`** — they must be set in
the Render dashboard manually.

Smoke helpers: `scripts/stripe-test-mode-smoke.mjs`,
`scripts/stripe-webhook-smoke.mjs`.

### 2. Outbound email — two layers

**Layer A — `services/api/src/common/mailer/`** (`MailerService`). Used for
password reset and account activation links. It reads `MAIL_DELIVERY_MODE`
(default `'log'`) and, at this commit, **only implements `log` mode**: any other
value logs a warning and falls back to logging the link. It does not send mail.

**Layer B — `services/api/src/modules/notifications/`** is the real pipeline:
catalog (`notification-events.catalog.ts`) → orchestrator
(`notification-orchestrator.service.ts`) → queue
(`queues/notification-queue.service.ts`) → processor
(`processors/email-notification.processor.ts`) → `email/`.

`email/email-provider-factory.service.ts` `resolveProvider(tenantId)` order:

1. Tenant `EmailProviderSetting` rows — the `isDefault` one, else the first
   non-`CONSOLE`/`DEV` one, else a `CONSOLE`/`DEV` one.
2. **Environment fallback** (`fromEnvironment()`), keyed on `EMAIL_PROVIDER`:
   SMTP reads `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT` (default 587),
   `EMAIL_SMTP_SECURE` (`=== 'true'`), `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`;
   API providers read `EMAIL_API_KEY`; plus `EMAIL_FROM`, `EMAIL_FROM_NAME`
   (default `DijiPeople`), `EMAIL_REPLY_TO`.
3. Non-production only: a console dev-fallback provider.
4. Production with no tenant row and no `EMAIL_PROVIDER`: **returns `null` and
   every outbound email fails.** `render.yaml` says exactly this in a comment and
   pre-declares the `EMAIL_*` vars.

Supported provider types today: `SMTP` and `CONSOLE`/`DEV`; anything else gets
`ApiPlaceholderEmailProvider`. Delivery is logged by
`email-delivery-log.service.ts`; `email-safety.ts` and
`email-scope-resolution.spec.ts` guard recipient scoping. **Never send email
directly from a domain service.**

### 3. Secret encryption — `common/security/secret-encryption.service.ts`

Format `enc:v1:<iv>:<authTag>:<ciphertext>`, all base64, AES-256-GCM, 12-byte IV.
Key comes from `SECRET_ENCRYPTION_KEY` (falls back to `APP_ENCRYPTION_KEY`),
passed through `sha256` so any passphrase length works.

**In production, a missing key throws at construction and the API refuses to
boot** — deliberate, so credentials are never silently stored in plaintext.
Outside production it logs a warning and stores plaintext (`isEnabled === false`).
Declared in `render.yaml` with `sync: false`.

Current consumers: `notifications/email/email-execution.service.ts`,
`notifications.service.ts`, `notifications.module.ts`,
`platform-communications/platform-email-settings.service.ts`. Any new
third-party credential storage must route through this service.

### 4. Agent desktop — `services/api/src/modules/agent/` ↔ `apps/agent-desktop/`

`@Controller('agent')` with `@UseGuards(JwtAuthGuard, PermissionsGuard)` at class
level. Three `@Public()` auth routes (`POST auth/login|refresh|logout`); the rest
authenticated: `GET me`, `me/productivity`, `config`, `settings`,
`location-requests/pending`, `employees/:employeeId/summary`;
`POST employees/:employeeId/location-requests`, `devices/register`,
`sessions/start|heartbeat|end`; `PATCH location-requests/:requestId/result`,
`devices/permissions`, `settings`.

The agent is a **separate auth client**: `AUTH_CLIENT_IDS.AGENT_DESKTOP =
'agent-desktop'` in `common/config/auth.config.ts`, with its own
`AGENT_JWT_ACCESS_SECRET` / `AGENT_JWT_REFRESH_SECRET`, its own TTLs
(`AUTH_AGENT_*`) and its own cookie names (`AGENT_ACCESS_TOKEN_COOKIE`,
`AGENT_REFRESH_TOKEN_COOKIE`). `auth.config.ts` branches on
`AUTH_CLIENT_IDS.AGENT_DESKTOP` in ~8 places. `JwtAuthGuard` rejects a token
whose `appClientId`/`aud` does not match the requesting client, so web tokens
cannot reach agent routes and vice versa.

Client side (`apps/agent-desktop/src/main/`): `api-client.ts` sends header
`X-DijiPeople-App: agent-desktop`; `session-manager.ts`, `activity-tracker.ts`,
`location-capture.ts`, `secure-store.ts`, `update-manager.ts`, `tray.ts`.

**Offline / retry contract** — `apps/agent-desktop/src/main/offline-queue.ts`:
a file-backed queue at `<userData>/heartbeat-queue.json` with atomic
temp-file-plus-rename writes and a promise `writeLock`. `MAX_QUEUE_SIZE` is
`min(agentEnv.offlineQueueMaxItems, 100_000)`; `enqueue` keeps the **newest**
items (`slice(-MAX)`), `prepend` (used to return a failed batch) keeps the
**oldest** (`slice(0, MAX)`), `drain(maxItems)` pops a batch (default 50).
Server side, `agent.service.ts` has `saveHeartbeatEvent`, `upsertDailySummary`
and `enforceTelemetryRetention`, plus `assertOwnDevice` — device ownership is
re-verified, not trusted from the payload.

### 5. Partner portal — `modules/partner-experience/partner-auth.guard.ts`

A third auth path: bearer token in `Authorization`, verified with `JwtService`,
requiring `actorType === 'PARTNER'` plus string `sub`, `partnerId` and `email`.
It attaches `request.partnerActor`. It **does not** read the permission metadata
keys, so handlers behind it are outside the dual-permission invariant's scope
(the invariant counts and reports them rather than judging them).

Other non-`PermissionsGuard` guards: `common/guards/roles.guard.ts`,
`common/guards/public-rate-limit.guard.ts`,
`modules/customization/customization-access.guard.ts`,
`modules/platform-auth/platform-permissions.ts` (`PlatformPermissionsGuard`).

## Key abstractions

- **Persisted-event idempotency** (`StripeWebhookEvent` + `processingStatus`) as
  the pattern for any at-least-once inbound webhook.
- **Provider resolution chain**: tenant row → environment → dev fallback → null.
- **Per-client JWT isolation**: separate secret, TTL, cookie name and
  `appClientId`/`aud` check per surface.
- **Client-side durable queue with atomic writes** for offline telemetry.
- **`SecretEncryptionService`** as the single envelope for stored third-party
  credentials, versioned by an `enc:v1:` prefix so the algorithm can change.
- **`PlatformEventsService`** as the observability sink for integration outcomes
  (`correlationId` = the external event id).

## Known exceptions

> **Four absence claims that used to sit here were all false and have been
> removed** (2026-08-16, verified at `78072d2`). They asserted that the
> `attendance-integrations` module, the `gateway/` .NET solution,
> `gateway-auth.guard.ts` and `tools/zkteco-poc/` did not exist. All four exist,
> and three of them are substantial. An agent following this file would have
> concluded there was nothing to extend and either rebuilt it or refused the
> work. This is the second recorded instance of the same failure mode in the
> context layer — see [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi]],
> the earlier [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist]],
> and the generalised guard in [[ITEM-0011]]. Absence claims age worse than any
> other kind, because nothing breaks when they become false.

- **The `attendance-integrations` module exists**, with exactly the structure
  root `AGENTS.md` describes: `connectors/`, `devices/`, `gateways/`,
  `ingestion/`, `integrations/`, `mapping/`, `operations/`, `provisioning/`,
  `work-sites/`. `gateway-auth.guard.ts`, `gateway-runtime.service.ts`,
  `gateway-credential.service.ts` and `gateway-configuration.service.ts` are all
  present under `gateways/`, several with specs. The "gateway guard" comment in
  `wiring-invariants.spec.ts` is **not** aspirational.
- **The `gateway/` .NET solution exists** — `DijiPeople.Gateway.sln` with
  `src/`, `tests/`, `packaging/` and `artifacts/`, 1,387 tracked files — and
  `gateway:build`, `gateway:test` and `gateway:package` are all real npm
  scripts in the root `package.json`.
- **`tools/zkteco-poc/` exists** (35 tracked files), with its own npm scripts
  under the `zkteco:*` prefix.
- **The desktop agent is not part of any of this.** `apps/agent-desktop`
  contains zero references to a gateway or a device connector, and the gateway
  contains zero references to the desktop agent. Physical attendance devices
  reach the platform through the on-premise gateway; the Electron agent reports
  workstation activity directly to `modules/agent`. They are two unrelated
  ingestion paths that both end at the API — see
  [[desktop-api-gateway-relationship]].
- `MailerService` cannot actually send mail; `MAIL_DELIVERY_MODE` has one
  working value.
- `EMAIL_*`, `STRIPE_*`, `SECRET_ENCRYPTION_KEY`, `MAIL_DELIVERY_MODE` are **not
  in `turbo.json` `globalEnv`** even though `EMAIL_*` and `SECRET_ENCRYPTION_KEY`
  are in `render.yaml`.

## Anti-patterns to avoid

- Moving or renaming `/api/billing/stripe/webhook` without updating
  `configureBodyParsing` and `isStripeWebhookRequest` in `main.ts`.
- Re-enabling Nest's global body parser, or adding a global `json()` before the
  raw-body middleware.
- Swallowing a webhook handler error — the rethrow is what makes Stripe retry.
- Sending email from a domain service instead of the notifications orchestrator.
- Storing an API key, SMTP password or integration token as plain JSON.
- Trusting a device id, employee id or tenant id from an agent payload —
  `assertOwnDevice` / `getLinkedEmployee` exist for that reason.
- Reusing the `web` JWT secret or cookie name for a new client. Add a client id
  and its full env set instead.
- Building a second device-integration surface beside `attendance-integrations`
  instead of extending it. It exists, and root `AGENTS.md`'s "extend the
  existing architecture; never build a competing one" applies to it.
- Treating the Electron agent and the on-premise gateway as one integration.
  They share no code, no contract and no data path.

## TARGET (required going forward)

1. Every new inbound webhook persists a dedupe row keyed on the provider's event
   id and returns early on a replay, following `WebhookService`.
2. Every new outbound integration credential goes through
   `SecretEncryptionService`, and its env var is registered in
   `packages/config` validation, `turbo.json` `globalEnv`, `render.yaml` and
   `docs/environment-variables.md`.
3. Every new external surface gets its own `AUTH_CLIENT_IDS` entry with its own
   secrets, TTLs and cookie names — never a shared secret.
4. Integration outcomes (success, ignored, failed) are recorded through
   `PlatformEventsService` with a `correlationId` traceable to the provider.
5. Client-side retry uses a bounded, durable queue with atomic writes; the server
   side must be idempotent because the client will resend.
6. Device-gateway work extends `services/api/src/modules/attendance-integrations`
   and the `gateway/` solution. A change to the gateway contract is a breaking
   change for on-premise installations nobody can see, so version or extend
   additively — never repurpose a field.

## What the specialist agent MUST verify before changing this

- Read `services/api/src/main.ts` `configureBodyParsing` in full before touching
  any billing route path or any global middleware.
- Read `services/api/src/modules/billing/services/webhook.service.ts` before
  adding a Stripe event type — dispatch and status transitions are coupled.
- Read `email-provider-factory.service.ts` `resolveProvider` before changing
  provider selection; the tenant→env→dev→null order is load-bearing in production.
- Read `services/api/src/common/config/auth.config.ts` end to end before adding
  or changing a client id; the agent-desktop branches are scattered.
- Re-derive the shape of the integration surface before extending it — list
  `services/api/src/modules/attendance-integrations/` and `gateway/src/` rather
  than trusting this file's description of them. Both move quickly, and the
  removed absence claims above are what happens when that is skipped.
- Check `turbo.json` `globalEnv` and `render.yaml` for any env var you add.
