# ExecPlan — DLP capture for the desktop agent: clipboard and triggered screenshots

> Plan `PLAN-022`, under [[TASK-0020]]. Required by [`PLANS.md`](../../PLANS.md)
> on four triggers: **new models** (four tenant-owned tables), **an
> authorization change** (a new `dlp.review` permission and a role that holds
> it), **an integration/contract change** (new request bodies the deployed agent
> sends, governed by `forbidNonWhitelisted`), and **a large refactor** (removes a
> deliberately-tested product boundary across agent, API and schema).
>
> This feature reverses a decision the codebase enforces on purpose. Screenshots
> and clipboard capture are hardcoded off at
> `apps/agent-desktop/src/main/config-manager.ts:32-34` and asserted to stay off
> **whatever the server asks** by `config-manager.spec.ts:66` ("what the server
> may not turn on"). `apps/agent-desktop/AGENTS.md:114` documents the boundary.
> Removing two of those three locks is an explicit owner decision, recorded here
> and in an ADR, not a quiet edit.

CONTEXT_FILES_REQUIRED:
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/branch-model.md`
  - `apps/agent-desktop/AGENTS.md` — the six app-specific rules; rule 1 (decide
    server-side), rule 2 (never log what the agent reads), rule 4 (idempotent
    retries) all bind here.
  - `services/api/prisma/AGENTS.md` — schema, migration, single-writer rules.
  - `docs/architecture/settings-and-branding.md` — the settings-runtime contract
    the tenant config screen must use.

SPECIALIST_AGENTS_REQUIRED:
  - Database — four new tenant-owned models, a migration, indexes, retention.
  - Backend/API — capture ingest endpoints, DTOs, server-side enforcement.
  - Security — a new permission, object-level access to captured content, audit
    on every read, encryption at rest, and the tenant-isolation proof. This is
    the highest-stakes reviewer on the task: the data is other people's
    clipboard contents and screen images.
  - Integration — the Electron capture path and the agent↔API contract, which is
    validated in a different workspace (`agent-client-contract.spec.ts`).
  - Frontend — the tenant DLP config screen and the investigator review surface.
  - QA — consent-gate behaviour, that a disabled tenant captures nothing, that a
    replayed batch does not double-record, and that content is unreadable
    without `dlp.review`.
DELIBERATELY_NOT_USED:
  - Release/DevOps — `develop` only; `main` stays UNTOUCHED. The owner promotes
    to production themselves. No agent installer is published by this task.

SINGLE_WRITER_FILES:
  - `services/api/prisma/schema.prisma` — write lease required (WP-01).
  - `services/api/src/common/constants/permissions.ts` — the new `dlp.review`
    key (WP-03).
  - `services/api/src/common/constants/rbac-matrix.ts` — the entity/privilege
    entry and the role grant (WP-03).

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - BUG-0035 — the agent sent a field the DTO did not declare and every request
    404'd/400'd for months while the UI showed success. Every new request body
    here ships with its DTO and is added to `agent-client-contract.spec.ts` in
    the same change.
  - BUG-0036 — a replayed batch permanently inflated running totals. Each new
    captured-event write carries a `dedupeKey` and a unique index before any
    send path exists.
  - BUG-0034 — a silent capability failure on an employee machine is
    undiagnosable. Capture failures log the reason (never the content) and are
    visible in the self-diagnostic, not swallowed.
  - `doc-code-drift` — figures re-derived on this branch, not trusted from prose.

---

## Objective

A tenant may enable, from Platform-Admin-granted tenant settings, capture of
**clipboard contents** and **screenshots taken on a data-loss rule** (a
sensitive-source application in the foreground while an exfiltration channel —
WhatsApp Web, Telegram, personal webmail, a USB or personal-cloud target —
becomes active). Captured events flow through the existing agent heartbeat/queue
machinery to the API, which stores them encrypted, scoped to the tenant, and
readable only by a role holding a new `dlp.review` permission, with every read
audited. When this is done: a tenant with the feature off captures nothing and
the agent never makes the OS call; a tenant with it on collects clipboard and
triggered-screenshot evidence an investigator can review; keylogging remains
impossible; and the employee sees an unmistakable indicator whenever capture is
active.

## Business requirement

The owner reported real incidents of employees opening sensitive information and
sharing it over WhatsApp, and asked for screenshots, clipboard capture and
keylogging. Four decisions were taken through `AskUserQuestion` on 2026-08-25:

1. **Keylogging — dropped.** It records what is typed, not what is read or
   copied, and barely touches the paste-into-WhatsApp threat while carrying the
   largest liability. `allowKeylogging` stays hardcoded `false` with its test.
2. **Capture depth — full content.** Clipboard text and full screenshots are
   stored, not only metadata. (Recorded despite the higher exposure; see Risks.)
3. **Prevention vs record — record only.** The agent observes and reports; it
   does not block or warn on a paste in this task. A later task may add the
   `ALERT`/`BLOCK` action — the `DlpRule.action` column is designed to carry it,
   defaulting to `OBSERVE`, so adding prevention later is not a schema change.
4. **Consent gate — tenant toggle only.** No per-employee acknowledgement is
   required to capture. Two things are nonetheless built and kept:
   - a consent gate (`dlpConsentRequired`, default `false`) wired to the
     existing `legal`/`consent.service` so a later legal requirement is a
     setting flip, not a rebuild; and
   - a visible active-capture indicator, kept regardless of the toggle, because
     a covert full-content clipboard recorder is the one variant that is
     indefensible under any regime and it costs almost nothing.

`TODO: Confirm product/business rule.` — the default sensitive-source app list
and exfil-channel list. Seeded with a sensible default (Office apps, PDF
viewers, the tenant's HRM domains as sensitive; WhatsApp/Telegram/personal
webmail/removable drives as channels) and fully tenant-editable.

## Existing behavior

- The agent already collects activity telemetry: `ActivityTracker`
  (`apps/agent-desktop/src/main/activity-tracker.ts`) reads the foreground app
  and window title when the tenant enabled it, `SessionManager`
  (`session-manager.ts`) batches heartbeats through `OfflineQueue`
  (`offline-queue.ts`) and `ApiClient` (`api-client.ts`), and the API writes
  `ActivityEvent` / `WorkSession` / `DailyProductivitySummary`
  (`schema.prisma:10627,10599,10704`).
- Capability decisions are server-owned. `AgentTrackingSettings`
  (`schema.prisma:10727`) carries `captureActiveApp`, `captureWindowTitle`,
  `allowCameraAccess`, retention, version policy; `AgentService.getConfig`
  projects them into `AgentConfig` and `saveHeartbeatEvent` enforces the capture
  flags on write (`agent.service.ts`).
- The three DLP-adjacent capabilities are the exception: `allowScreenshots`,
  `allowClipboardTracking`, `allowKeylogging` are typed as literal `false`
  (`apps/agent-desktop/src/main/types.ts:31-34`), hardcoded in the default and
  in `ConfigManager.refresh` (`config-manager.ts:32-34,151-153`), and locked by
  `config-manager.spec.ts:66`.
- Retention already runs. `AgentService` purges `ActivityEvent`,
  `AgentLocationRequest` and `DailyProductivitySummary` past
  `historyRetentionDays` in a transaction (`agent.service.ts:1234`). This is not
  a claim — the `deleteMany` calls are there. New tables must join that purge.
- `StorageService` (`services/api/src/common/storage/storage.service.ts`) writes
  to the filesystem under `FILE_STORAGE_DIR`; downloads stream through a
  permission-checked route, never a storage URL (see `AppReleaseController`).
- `SecretEncryptionService` exists for at-rest encryption of sensitive values;
  `SECRET_ENCRYPTION_KEY` is mandatory in production.
- The `legal` module (`services/api/src/modules/legal/consent.service.ts`,
  `LegalDocumentAcknowledgement` at `schema.prisma:12871`) records versioned
  document acknowledgements — the machine the consent gate reuses.

## Existing architecture

Reused, not rebuilt:

- **Heartbeat/queue/offline path** — capture events are a new event kind on the
  existing queue and batch sender, so offline buffering, idempotency and the
  single post-refresh retry apply for free. No second transport.
- **`AgentTrackingSettings` + `AgentConfig`** — the flags are new columns and new
  config fields on the existing projection, enforced in the existing
  `saveHeartbeatEvent` path (rule 1: decide server-side).
- **`StorageService`** — screenshots are stored exactly as release artefacts are:
  bytes under a prefix, streamed back through a permission-checked route.
- **`SecretEncryptionService`** — clipboard text and screenshot bytes encrypted
  at rest with the existing service; no new crypto.
- **Two permission systems** — `dlp.review` is added to both
  `permissions.ts` and the `rbac-matrix.ts` entity/privilege table, like every
  other guarded route.
- **Settings runtime** — the tenant DLP config screen is a settings-runtime page
  (`apps/web/.../settings/_lib`), not a bespoke shell.

## Requirements

1. A tenant setting enables/disables clipboard capture and screenshot capture
   independently; both default off; both are Platform-Admin-visible tenant
   config, not employee-editable.
2. With a capture flag off, the agent makes no corresponding OS call and sends
   no such event — proven by a `config-manager` test in the shape of the
   existing "capability off reads nothing" test.
3. Clipboard captures record source app, destination/foreground app, byte size,
   SHA-256, and (full-content mode) the encrypted text.
4. A screenshot is captured only when a `DlpRule` fires; never on a timer.
5. Every captured event carries a `dedupeKey`; a replayed batch never
   double-records (BUG-0036).
6. Captured content is stored encrypted and is readable only via a route guarded
   by `dlp.review` + the matching RBAC privilege; every read is audited.
7. New tables are purged by the existing retention job; screenshots carry a
   retention window no longer than telemetry, configurable and defaulting
   shorter.
8. The agent shows an unmistakable active-capture indicator (tray state + a
   first-run notice) whenever either capture flag is on.
9. `allowKeylogging` remains hardcoded `false` and keeps its test.
10. `dlpConsentRequired` exists (default `false`); when true, the API refuses to
    accept captured events for an employee without a current acknowledgement.
11. Every new agent request body has a matching DTO and is added to
    `agent-client-contract.spec.ts` (BUG-0035).

## Dependencies

- A throwaway local PostgreSQL `DATABASE_URL` to generate and apply the WP-01
  migration (`prisma migrate dev`). The dev `dijipeople` database is not to be
  touched. **This is the only blocker on WP-01; it is requested from the owner.**
- `SECRET_ENCRYPTION_KEY` present in every environment that stores captured
  content (already required in production).
- No external systems. No Stripe, no gateway, no email.

## Files / modules affected

**services/api/prisma** (single-writer):
- `schema.prisma` — four models; new columns on `AgentTrackingSettings`; one new
  enum (`DlpRuleAction`).
- `migrations/<ts>_dlp_capture/` — generated.

**services/api backend:**
- `src/modules/agent/agent.service.ts`, `agent.controller.ts`,
  `dto/` — capture ingest endpoints and DTOs; config projection; retention.
- `src/modules/agent/dlp/` (new) — `dlp.service.ts` (rule config, review reads),
  `dlp.controller.ts` (investigator surface), `dto/`, `*.spec.ts`.
- `src/common/constants/permissions.ts`, `rbac-matrix.ts` (single-writer) —
  `dlp.review`.
- `agent-client-contract.spec.ts` — new payloads.

**apps/agent-desktop:**
- `src/main/types.ts`, `config-manager.ts` (+ spec) — new flags, keylogging lock
  kept.
- `src/main/dlp/` (new) — `clipboard-watcher.ts`, `rule-evaluator.ts`,
  `screenshot-capture.ts`, `*.spec.ts`.
- `src/main/session-manager.ts` — wire capture events into the queue.
- `src/main/tray.ts` — active-capture indicator.

**apps/web:**
- `app/(authenticated)/settings/desktop-agent/` — DLP config section.
- a new investigator review page + `lib/security-keys.ts` mirror of `dlp.review`.

## Database impact

Four tenant-owned models, all with `tenantId` + `tenant` relation,
`@@index([tenantId, …])`, composite uniqueness including `tenantId`, and a
nullable `dedupeKey String? @unique` on event tables (the BUG-0036 pattern —
NULL-excluded unique index governs new writes without touching history):

- `ClipboardCaptureEvent` — `tenantId, employeeId, userId, sessionId, deviceId,
  occurredAt, receivedAt, sourceApp?, destinationApp?, contentBytes,
  contentSha256, encryptedContent? (Bytes/String, full-content mode only),
  firedRuleId?, agentVersion, dedupeKey?`.
- `ScreenCaptureEvent` — same identity columns + `storageKey` (bytes in
  `StorageService`), `contentSha256`, `firedRuleId`, `capturedReason`,
  `dedupeKey?`.
- `DlpRule` — `tenantId, name, enabled, sourceAppPatterns Json,
  channelAppPatterns Json, action DlpRuleAction @default(OBSERVE), createdById,
  updatedById`, timestamps.
- `DlpAlert` — `tenantId, employeeId, ruleId, occurredAt, clipboardEventId?,
  screenshotEventId?, status`.

New enum `DlpRuleAction { OBSERVE ALERT BLOCK }` — only `OBSERVE` is honoured in
this task; the others exist so prevention is a later behaviour change, not a
migration.

New columns on `AgentTrackingSettings`: `allowClipboardCapture Boolean
@default(false)`, `allowScreenshotCapture Boolean @default(false)`,
`clipboardFullContent Boolean @default(false)`, `dlpConsentRequired Boolean
@default(false)`, `screenshotRetentionDays Int @default(30)`.

Migration `…_dlp_capture`, additive only — new tables, new nullable/defaulted
columns, no change to existing columns, uniqueness or relations. No backfill
(all defaults are off/empty). Reversible: the down direction drops the new
tables, enum and columns; because every addition is defaulted-off, rolling back
the code before the migration leaves the extra columns unread and harmless.

## Backend impact

- `POST /api/agent/dlp/clipboard-events` and `POST
  /api/agent/dlp/screenshot-events` (batch), `@CurrentUser()`, guarded by the
  agent session like the heartbeat route. DTOs with `class-validator`; remember
  the global `forbidNonWhitelisted` — payload and DTO ship together. Enforcement
  of the capture flags and `dlpConsentRequired` happens **in the service on
  write**, not trusted from the client (rule 1). Writes are idempotent on
  `dedupeKey`.
- Screenshot bytes: multipart or base64 body → `SecretEncryptionService` /
  `StorageService`; the row holds `storageKey`, never the bytes inline.
- Config projection (`getConfig`) gains the new flags so the agent learns what it
  may capture from the server, defaulting off.
- Retention: extend the existing `$transaction` purge (`agent.service.ts:1234`)
  to the two event tables and `DlpAlert`, screenshots on
  `screenshotRetentionDays`, and delete the stored bytes, not only the row.
- `DlpService` / `DlpController`: tenant rule CRUD and the investigator read
  surface (list alerts, read one clipboard event's decrypted content, stream one
  screenshot) — every content read guarded by `dlp.review` and audited.

## Frontend impact

- `apps/web` settings-runtime: a DLP section on the desktop-agent settings page —
  the two capture toggles, full-content toggle, consent-required toggle,
  screenshot retention, and the rule list. Loading/error/empty/access-denied
  states via the shared components. Gated by the agent-settings manage
  permission for editing.
- A new investigator review page (alerts list → event detail), gated by
  `dlp.review`, using `ProDataTable`/runtime components — no hand-rolled table.
  `dlp.review` mirrored into `lib/security-keys.ts` for cosmetic nav gating;
  server is the authority.

## Permission / RBAC impact

- New key `dlp.review` in `common/constants/permissions.ts`.
- New entity/privilege in `rbac-matrix.ts` (a `DLP_REVIEW` entity, `READ`
  privilege) and the `[['dlp.review'], ENTITY_KEYS.DLP_REVIEW, READ]` bridge.
- Granted to **no existing role by default**; assigned to a named
  investigations/security role by explicit tenant configuration. Deliberately
  not folded into `agent.settings.read`: configuring monitoring and reading
  what it captured are different authorities. `hasElevatedTenantRole` still
  reaches it — noted, not widened.
- Both `@Permissions('dlp.review')` and `@RequirePermission(ENTITY_KEYS.DLP_REVIEW,
  'read')` on every content-read handler. Ingest routes use the agent-session
  guard, not `dlp.review`.
- Mirror `dlp.review` into `apps/web/lib/security-keys.ts`.

## Tenant-isolation impact

Every new query filters `tenantId` from `request.user.tenantId`. Ingest derives
tenant from the authenticated agent session, never from the body. Review reads
use `findFirst({ where: { id, tenantId } })` — never `findUnique` by bare id on
these models. `deleteMany` in retention is `{ tenantId, … }`. There is no
platform (cross-tenant) path in this task; a reviewer confirms isolation by
checking that no handler accepts a tenant identifier from input and every
repository call carries `tenantId`. Captured content is the most sensitive
tenant-owned data in the system — a cross-tenant read here is a breach, so the
Security agent verifies this explicitly.

## Audit / event / logging impact

- `AuditService.log()` on: enabling/disabling either capture flag, editing a
  `DlpRule`, and **every read of captured content** (`dlp.review` reads), with
  actor, target employee, and event id in the snapshot — never the content
  itself in the audit row.
- **Never logged anywhere**: clipboard text, screenshot bytes, `encryptedContent`,
  storage keys' contents. `AgentLogger` on the client logs the event
  (`agent.dlp.clipboard.sent count=n`), never the payload (rule 2). Server logs
  the same way; `sanitizeForErrorLog` on any error path that could carry a
  sample.
- No platform events, no notifications in this task (record-only).

## Integration impact

- The agent↔API contract gains two request bodies. Deployed older agents do not
  send them and are unaffected (additive). New agent builds must be validated
  against the DTOs in `agent-client-contract.spec.ts` — the spec is where a
  drift like BUG-0035 surfaces.
- No gateway, Stripe, email or storage-provider contract change beyond using
  `StorageService` as-is.

## Migration / data compatibility

Additive migration; old code runs against the new schema (extra defaulted
columns unread; extra tables unwritten). Old agents run against the new API
(they never call the new routes). New agent against old API: the new routes
404 and the agent treats a 404 like any capture-send failure — logged, not
fatal — so a version skew degrades to "no capture", never to a broken agent.
Config projection defaults every new flag off, so an un-migrated or partially
configured tenant captures nothing.

## Parallel-safe tasks

- WP-04 (agent capture: clipboard watcher, rule evaluator, screenshot, tray
  indicator, config flags) is `PARALLEL_SAFE` against a mocked endpoint and the
  agreed DTO shapes. It has no database dependency and is built and unit-tested
  in the `agent-desktop` workspace now. **This is where implementation starts
  while the WP-01 database credential is obtained.**

## Dependency-blocked tasks

- WP-01 (schema + migration) — `DEPENDENCY_BLOCKED` on a throwaway `DATABASE_URL`.
  Blocks WP-02, WP-03, WP-05.
- WP-02 (API ingest), WP-03 (API review + RBAC), WP-05 (frontend) — each
  `DEPENDENCY_BLOCKED` on WP-01.

## Integration tasks

- WP-06 (QA + the agent↔API contract spec + end-to-end) — `INTEGRATION`, runs
  last, joins the agent payloads to the API DTOs and proves the isolation,
  consent-gate and dedupe requirements.

## Testing strategy

Commands from AGENTS.md only:
- `npm --workspace agent-desktop run test` — new `dlp/*.spec.ts`: capture-off
  makes no OS call; a fired rule produces exactly one screenshot event; a
  clipboard diff hashes and bounds correctly; keylogging stays off.
- `npm --workspace agent-desktop run check-types`.
- `npm --workspace api run test` — `dlp.service.spec.ts` (flag + consent
  enforcement on write, dedupe, tenant scoping), retention extension,
  `agent-client-contract.spec.ts` (new payloads).
- `npm run prisma:validate`, `npm run prisma:generate`,
  `npm run prisma:migrate:status`, `npm run db:preflight` before WP-01 work.
- `npm run lint`, `npm run typecheck`.
- Manual: on a Windows box, enable capture for a test tenant, copy from a
  flagged app into WhatsApp Web, confirm one clipboard event and one screenshot
  arrive, are unreadable without `dlp.review`, and are audited when read.

## Risks

1. **Sensitive data now leaves the endpoint and lands on the server (HIGH /
   HIGH).** Full-content mode means the server stores the very salary sheets the
   feature protects. Mitigation: encryption at rest, `dlp.review`-only access,
   audited reads, short screenshot retention, and a metadata-only mode kept
   available. Residual risk accepted by the owner (decision 2).
2. **Legal defensibility without consent (HIGH / MEDIUM).** Tenant-toggle-only
   capture may be unlawful or inadmissible in some jurisdictions. Mitigation:
   the consent gate is built and one flag away; the visible indicator ships
   regardless. Flagged to the owner; a counsel review is theirs to run.
3. **A covert or always-on screenshot loop (MEDIUM / HIGH).** Mitigation:
   screenshots are rule-triggered only (req. 4), and the indicator is
   mandatory (req. 8).
4. **Replay double-count / poison batch (MEDIUM / MEDIUM).** Mitigation:
   `dedupeKey` unique index (req. 5); align capture text bounds with the DTO to
   avoid the ITEM-0027 400-loop; capture failures are dropped-after-N, not
   immortal.
5. **Tenant cross-read of captured content (LOW / CRITICAL).** Mitigation:
   isolation proof above; Security agent sign-off required.

## Rollback considerations

The migration is additive and reversible: drop the four tables, the enum and the
five columns. Because every addition defaults off, reverting the application code
before the migration leaves unused columns and empty tables — harmless. If the
frontend ships without the API, the config screen's saves 404 and the toggles
stay off (fail-safe). If the API ships without the migration, `getConfig` and
ingest referencing missing columns fail at query time — so the migration deploys
first, always. No captured data is destroyed by a rollback except by the normal
retention purge.

## Definition of Done

- [ ] `allowKeylogging` still `false`, still tested.
- [ ] Capture-off proven to make no OS call and send no event.
- [ ] Both capture flags default off; tenant-config only.
- [ ] `dedupeKey` unique index in place; replay test passes.
- [ ] Content encrypted at rest; readable only via `dlp.review`; every read
      audited.
- [ ] Retention purges the new tables and the stored screenshot bytes.
- [ ] Active-capture indicator shown whenever a flag is on.
- [ ] `dlpConsentRequired` enforced server-side when true; defaults false.
- [ ] New payloads in `agent-client-contract.spec.ts`.
- [ ] Permission in both systems; mirrored to `security-keys.ts`.
- [ ] Tenant isolation verified by the Security agent.
- [ ] ADR recorded for removing the screenshot/clipboard locks.
- [ ] Validation commands run and reported; no unrelated changes in the diff.
