# TASK-0031 WP-04 — stream report: email templates

Stream report of [[TASK-0031]].

- Branch: `agent/walkthrough2-email-templates` (base `origin/develop` 88f33c6e)
- ExecPlan: `docs/plans/EXECPLAN-0048-email-template-default-copy-and-visual-editor.md`
- Owner copy review: `docs/tasks/TASK-0031-streams/email-copy-for-owner-review.md` (generated from the copy file)
- Reserved regression ids used: REG-505 … REG-509

Record files were not edited, because they do not exist on develop yet. Everything the orchestrator needs to update BUG-3500 and ITEM-0181 is below.

---

## BUG-3500 — every seeded email template ACTIVE with placeholder body

**Status: FIXED** (unit-verified). DB-backed seed run and browser checks are pending (see QA retest).

### Root cause

Three writers kept placeholder copy live, not one. All line numbers are at 88f33c6e.

1. `services/api/src/modules/notifications/notification-events.catalog.ts:740-759` — the generic fallback in `createSystemTemplateSeed` produced the placeholder body and description with `status: ACTIVE`. It covered every event with a `systemTemplateKey` other than the five written inline.
2. `services/api/prisma/seed-config.ts:876-912` — `seedSystemEmailTemplates` upserted those seeds on every release, and its `update` branch (`:900-911`) rewrote body and status. `services/api/src/modules/notifications/notifications.repository.ts:1243-1280` (`bootstrapSystemDefaults`) was a second writer with the same upsert.
3. Found during this work: `seed-config.ts:2169-2221` (`seedTenantEmailTemplates`, also called by `seed-demo.ts:131`). It wrote a hidden, ACTIVE, `isSystem: true` copy of the activation, password reset and OTP templates into every tenant's own scope (`AUTH_TEMPLATE_SEEDS`, `:102-197`), rewriting it every run.
   - **Shadowing.** Tenant scope precedes SYSTEM in `notificationScopeChain` (`notifications.constants.ts:66-86`), so these rows were what auth email actually used. The system auth copy never reached anyone.
   - **Customize blocked.** These rows held the `(scopeKey, templateKey)` pair a tenant clone of an auth template needs.
   - **Latent send failure.** The system reset template declared `primaryColor` and `logoUrl`. Neither `auth.service.ts:865` nor `auth.service.ts:1045` passes them, and the renderer treats every declared variable as required (REG-386). Retiring the shadow rows without fixing that would have stopped forgot-password email entirely.

### Fix

- **Authored copy.** `services/api/src/modules/notifications/system-email-templates.copy.ts` (new) holds the copy for all 11 templates: subject, simple inline-styled HTML, plain text, and variables with a label and sample value. Each template's variables are the intersection of what its emitters pass:
  - activation: `user-invitations.service.ts:439-466`
  - reset: `auth.service.ts:865,1045` and `employee-profiles.service.ts:1770`
  - invoice: `super-admin.service.ts:3253,5292`
  - payslip: `payslips.service.ts:562`
  - report: `report-scheduler.worker.ts:500`
  - support: `support-cases.service.ts:594`
- **No fallback.** `notification-events.catalog.ts` builds `SYSTEM_EMAIL_TEMPLATES` only from authored copy and throws at module load if an event names a template without copy. `SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS` is kept only as a deprecated alias for `report-scheduler.worker.spec.ts`.
- **Status rule.** ACTIVE only when something sends the event by email today and the event is available: activation, reset, invoice, payslip, scheduled report, support case. DRAFT for `AUTH_OTP` (no emitter), `LEAVE_APPROVAL_REQUEST` and `LEAVE_APPROVED` (retired), `TIMESHEET_APPROVAL_REQUEST` (in-app `emit()` only) and `PAYROLL_PROCESSED` (no emitter).
- **Seed guard.** `planSystemTemplateWrite` creates a missing row, refreshes only an untouched system default (`tenantId null`, `isSystem`, `updatedBy null`), and skips everything else. Both `seedSystemEmailTemplates` and `bootstrapSystemDefaults` use it.
- **Seed verification.** `verifySystemEmailTemplates` in `seed-config.ts` throws if any ACTIVE system row contains placeholder wording. It warns, and changes nothing, for tenant-owned rows.
- **Shadow rows retired.** `seedTenantEmailTemplates` (name kept for `seed-demo.ts`) no longer writes per-tenant auth rows. It re-keys each existing one to `<key>.retired-tenant-default` and sets it ARCHIVED: only rows that are `isSystem`, at the tenant's own scope, and never saved by a person. It is idempotent and nothing is deleted.

### Tests added

- `services/api/src/modules/notifications/system-email-templates.spec.ts`
  - no placeholder wording in any template field
  - tokens used = variables declared, per template
  - the exact ACTIVE/DRAFT map
  - catalog throws with missing copy
  - sanitiser keeps tokens and links, and strips unsafe markup
  - seed guard cases
  - authoring events
- `services/api/src/modules/notifications/system-email-template-emitters.spec.ts` — reads each emitter call site (CRLF-normalised, non-empty guard) and asserts declared ⊆ passed for every ACTIVE template.
- **Mutation-checked:**
  - placeholder body on the payslip template → caught
  - `{{logoUrl}}` added to the reset template → caught by the emitter spec (1 failed, 6 passed)

### Regression entries

### REG-505 — ACTIVE system email templates shipped placeholder bodies, restored on every deploy

| | |
|---|---|
| **Bug class** | `unvalidated-seed-state` |
| **Module** | `services/api/src/modules/notifications` |
| **Bug record** | BUG-3500 |
| **Root cause** | `createSystemTemplateSeed` in `notification-events.catalog.ts` fell back to a generic "This is a system placeholder email template" body with `status: ACTIVE` for every event with a `systemTemplateKey` but no inline copy (six of eleven). `seedSystemEmailTemplates` in `seed-config.ts`, run on every release, re-imposed body and status on every run. Nothing asserted template copy, so placeholder and real copy were indistinguishable to every test. |
| **Regression test** | `services/api/src/modules/notifications/system-email-templates.spec.ts` |
| **QA scenario** | to be assigned at integration |
| **Scenario** | No system email template field contains placeholder wording. The catalog refuses to load when an event names a system template with no authored copy. A template is ACTIVE only for events something sends by email today. `seed:config` fails if an ACTIVE system template in the database contains placeholder wording. |
| **Proven to fail without the fix** | Mutation check: re-inserting the placeholder sentence into the payslip copy makes the spec fail (1 failed / 42 passed). By inspection, six 88f33c6e seeds carry that sentence, so the same assertion covers the original defect. |
| **Note** | Copy lives in `system-email-templates.copy.ts`, the single source; `docs/tasks/TASK-0031-streams/email-copy-for-owner-review.md` is generated from it for the owner's review (ADR-0015). |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

### REG-506 — An ACTIVE template declared a variable its emitter never passes

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api/src/modules/notifications` |
| **Bug record** | BUG-3500 |
| **Root cause** | `EmailTemplateRendererService.render` requires every key in `availableVariables`. The system `AUTH_PASSWORD_RESET` template declared `primaryColor` and `logoUrl`, which neither `auth.service.ts` reset call site passes. It only worked because hidden per-tenant rows shadowed the system template; removing them, or seeding real copy naively, would have stopped forgot-password email. REG-386 was the same defect for scheduled reports. |
| **Regression test** | `services/api/src/modules/notifications/system-email-template-emitters.spec.ts` |
| **QA scenario** | to be assigned at integration |
| **Scenario** | For every ACTIVE system template, every declared variable is present in the `variables` object at every emitter call site: activation, reset (three sites), invoice, payslip, scheduled report, support case. |
| **Proven to fail without the fix** | Mutation check: adding `{{logoUrl}}` to the reset copy fails the spec (1 failed / 6 passed). By inspection, the 88f33c6e reset template declared both `logoUrl` and `primaryColor`, neither of which the `auth.service.ts` call sites pass. |
| **Note** | The spec reads source rather than constructing the services, because each emitter has a dozen collaborators; it normalises CRLF and requires at least three extracted keys per call site so it cannot pass vacuously. A new ACTIVE template with no emitter listed fails the spec. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

### REG-509 — Seeds rewrote system templates unconditionally and hid tenant-scope auth copies that shadowed them

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `services/api/prisma` / `services/api/src/modules/notifications` |
| **Bug record** | BUG-3500 |
| **Root cause** | `seedSystemEmailTemplates` and `NotificationsRepository.bootstrapSystemDefaults` both upserted system templates with an unconditional update. `seedTenantEmailTemplates` wrote ACTIVE `isSystem` auth templates into every tenant's scope; they outranked the system templates in resolution, were invisible on every screen, and held the key a tenant's Customize needs. |
| **Regression test** | `services/api/src/modules/notifications/system-email-templates.spec.ts` (`planSystemTemplateWrite (seed guard)`) |
| **QA scenario** | to be assigned at integration (DB-backed) |
| **Scenario** | Running `seed:config` twice leaves system copy unchanged on the second run. A tenant's own template (any scope) is never written. Legacy per-tenant `isSystem` auth rows are re-keyed `.retired-tenant-default` and ARCHIVED, and auth emails then resolve to the system templates. Customize on the password reset template succeeds. |
| **Proven to fail without the fix** | Before the fix the seed's update branch rewrote body and status on every existing system row, and the legacy per-tenant rows made `POST /notifications/email-templates/:id/clone` on an auth template violate `@@unique([scopeKey, templateKey])`. The guard's skip cases are unit-tested; the retirement step needs the DB-backed check below. |
| **Note** | Rows are re-keyed rather than deleted so `EmailDeliveryLog.templateId` history keeps its template. Rollback: `UPDATE "EmailTemplate" SET "templateKey" = replace("templateKey", '.retired-tenant-default', ''), status = 'ACTIVE' WHERE "templateKey" LIKE '%.retired-tenant-default'`. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

---

## ITEM-0181 — visual email template editor

**Status: DONE** (unit-verified). Browser verification is pending.

### What was wrong

The problems are listed in the record: raw HTML plus two JSON textareas, a free-text key, an event dropdown of about 55 including dead events, system templates rendered as disabled inputs, the key shown twice, and the table clipping at 1440px. Code references:

- create form: `email-template-create-form.tsx:250-273`
- editor: `email-template-editor.tsx:41,193-316,342-347`
- table: `email-templates-table.tsx:75-86`

Template API logic lived on `NotificationsService` with no audit rows and a bare-id update (`notifications.service.ts:515-695`, `notifications.repository.ts:402-416`).

### Fix

**API: `services/api/src/modules/notifications/email/email-template-authoring.service.ts` (new).** The template methods moved here from `notifications.service.ts`; the controller routes are unchanged plus two new ones.

- **Authoring events.** `GET /notifications/email-templates/authoring-events` lists events that send email, are available, are tenant mail (not DijiPeople-to-customer) and are in the plan (`FeatureAccessService`). Each event carries `{key,label,sample}` variables and default content.
- **Draft preview.** `POST /notifications/email-templates/preview` renders an unsaved template. `POST .../:id/preview` accepts content overrides and uses catalog samples.
- **Test send.** `test-send` needs only a recipient.
- **Create.** The key and `availableVariables` are derived from the event. Tokens the event does not supply are refused (`EMAIL_TEMPLATE_VARIABLES_UNKNOWN`). The body goes through `sanitizeEmailTemplateHtml` (new, `sanitize-html` allowlist; `sanitize-html` is already an api dependency).
- **Customize.** `clone` on a system template makes a DRAFT tenant copy under the system key at tenant scope, so it replaces the default once activated. It opens the existing copy if one exists and refuses platform mail.
- **Visibility.** System templates a tenant cannot use (platform mail, events nothing sends, features outside the plan) are hidden from list, get, preview and clone.
- **Module picker.** Scope options list only modules in the plan.
- **Audit.** `EMAIL_TEMPLATE_CREATED`, `_UPDATED`, `_CUSTOMIZED`, `_CLONED`, `_ACTIVATED` and `_ARCHIVED` write before/after snapshots.
- **Tenant-scoped update.** `updateTenantTemplate` is now `updateMany { id, tenantId, isSystem: false }`.

**Web: `apps/web/app/(authenticated)/settings/notifications/`.**

- **Rich text editor.** `_components/email-template-rich-text-editor.tsx` has a toolbar for bold, italic, underline, bulleted and numbered lists, heading and link. Paste inserts plain text. It uses no new dependency (see ExecPlan).
- **Variable picker.** `_components/email-template-variable-menu.tsx` inserts at the caret in the subject or the message.
- **Preview.** `_components/email-template-preview.tsx` shows the subject, a sandboxed formatted view and the plain-text part.
- **Composer.** `_components/email-template-composer.tsx` is shared by create and edit: event picker (create), live debounced preview, Save / Save and activate, and test send.
- **System templates.** `_components/email-template-editor.tsx` shows a rendered preview with one Customize action.
- **List.** `_components/email-templates-table.tsx` shows the key once under the name. Module is folded into "Applies to", the Version column is dropped, and Archive uses `ConfirmDialog`.
- **Helper text removed.** Page and panel descriptions are gone from all three template pages.
- **Pure logic.** `templates/_lib/email-template-editing.ts` holds the payload builders, HTML-to-text and token insertion. `templates/_lib/email-template-client.ts` holds the fetch calls, so `lib/notifications-api.ts`, which WP-05 and WP-06 are also changing, is untouched.

### Tests added

- `services/api/src/modules/notifications/email/email-template-authoring.service.spec.ts` (14 tests)
- `services/api/src/modules/notifications/dto/email-template-payload.spec.ts` (seam: fixture against the real DTOs with `whitelist` + `forbidNonWhitelisted`)
- `apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-editing.spec.ts` (builders against the same fixture, HTML-to-text, token insertion, test-send result wording)
- Shared fixture: `apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-payload.fixture.json`

### Regression entries

### REG-507 — Template authoring accepted hand-typed HTML, keys and variable JSON, and system templates could not be customized

| | |
|---|---|
| **Bug class** | `read-filter-without-a-write-check` |
| **Module** | `services/api/src/modules/notifications` |
| **Bug record** | ITEM-0181 |
| **Root cause** | Create and update stored whatever `availableVariables` JSON and key the client typed. HTML was only checked for `<script>`/`javascript:`. The event list offered events that never send email. Cloning a system auth template collided with the hidden per-tenant rows. Template writes had no audit rows, and update wrote by bare id. |
| **Regression test** | `services/api/src/modules/notifications/email/email-template-authoring.service.spec.ts` |
| **QA scenario** | to be assigned at integration |
| **Scenario** | Authoring events exclude platform mail, unsent, retired and out-of-plan events. Create derives key and variables from the event, sanitises HTML (event handlers, scripts, frames and `url(` styles removed or refused) and refuses unknown tokens. Customize creates a DRAFT tenant copy under the system key, or opens the existing one. Platform mail is not found for a tenant. Update writes through `{ id, tenantId, isSystem: false }` and ignores client variable JSON. Preview escapes hostile variable values. Every state change is audited. |
| **Proven to fail without the fix** | At 88f33c6e `createTemplate` stored `dto.availableVariables` verbatim and required `templateKey`; there was no authoring-events route, no `customizable` flag and no audit call. The spec's derivation, refusal and audit assertions cannot pass against that code. |
| **Note** | Web counterpart: the editor no longer renders any HTML or JSON textarea; covered by browser QA below. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

### REG-508 — The template editor payload and the API DTOs could drift apart

| | |
|---|---|
| **Bug class** | `structural-guard-lost-in-rewrite` |
| **Module** | `apps/web` / `services/api/src/modules/notifications/dto` |
| **Bug record** | ITEM-0181 |
| **Root cause** | The global `ValidationPipe` runs `forbidNonWhitelisted`, so a field the editor sends that a DTO does not declare is a 400. The editor was rewritten to send new shapes (no key, no variables, preview overrides, draft preview, recipient-only test send), and nothing tied the client body to the DTOs. |
| **Regression test** | `services/api/src/modules/notifications/dto/email-template-payload.spec.ts`; `apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-editing.spec.ts` |
| **QA scenario** | to be assigned at integration |
| **Scenario** | The web builders produce exactly the shared fixture, and every fixture payload validates against the real DTO with the pipe's options. An undeclared field in the fixture is rejected, which proves the check has teeth. |
| **Proven to fail without the fix** | By inspection of the 88f33c6e DTOs: `templateKey` and `availableVariables` were required on create and `variables` on preview and test send, and no draft preview DTO existed, so the fixture payloads would be rejected. The spec's undeclared-field case proves the validation options are live. |
| **Note** | Both specs read the same JSON file, so neither side can change alone. |
| **Fixed** | 2026-09-13 |
| **Active** | yes |

---

## Commands run (worktree, final state)

| Command | Result |
|---|---|
| `npm --workspace api run test -- notifications report-scheduler` (dummy `DATABASE_URL`) | PASS — 20 suites, 184 tests |
| `npm --workspace web run test -- email-template` (runs the whole web suite) | PASS — 95 suites, 1853 tests |
| `npm --workspace web run check-types` | PASS |
| `npm --workspace api run check-types` | Only 2 errors, both **pre-existing**: `src/common/storage/providers/r2-object-storage.provider.ts` cannot find `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner`. Those packages are absent from the shared `node_modules` junction; the file is untouched here. No error in changed files. |
| `tsc` over `prisma/seed-config.ts` + `prisma/seed-demo.ts` (scratch tsconfig extending `services/api/tsconfig.json`) | PASS |
| `npx eslint --fix` on every changed api file | PASS. 2 **pre-existing** warnings in `seed-config.ts` (unused `ApprovalActorType`, `ApprovalModuleKey` imports, line 15). |
| `npx eslint --fix` on every changed web file | PASS |
| Mutation check (placeholder body; undeclared `logoUrl` on reset) | Both caught |

Not run here: DB-backed e2e and browser verification (orchestrator, WP-07). No e2e spec was written: `seed-config.ts` builds a Prisma client at import time, so the seed checks below are manual steps on the throwaway database.

## QA retest steps (throwaway DB, then demo tenant)

1. **Seed runs.** Run `npm --workspace api run seed:config` twice.
   - Second run logs `0 created, 11 refreshed, 0 left unchanged` and no verification error.
   - Every `SYSTEM` row matches the owner review document; statuses match its table.
   - Per-tenant `AUTH_*` rows with `isSystem = true` now have key `…​.retired-tenant-default` and status ARCHIVED.
2. **Template list.** Open `/settings/notifications/templates` at 1440px and 400px.
   - System rows shown: Account activation, Password reset, Scheduled report, plus Payslip only if the plan has payroll.
   - Not shown: Invoice, Support, Verification code, Leave, Timesheet, Payroll processed.
   - Each key appears once; no horizontal clipping at 1440px.
3. **System template.** Open Password reset.
   - It shows a rendered preview (subject, formatted view, plain text) with no inputs, and one Customize button.
   - Customize lands on a DRAFT tenant copy with the same key.
   - Customize again from the list opens the same copy.
4. **Editing the copy.**
   - Bold/italic/list/heading/link work.
   - Variable → `Recipient name` inserts `{{recipientName}}` at the caret in both the subject and the message.
   - The preview updates within about half a second.
   - Typing `{{salary}}` shows "Not supplied by this event: salary", and Save is refused.
5. **Activate and send.** Save and activate, then Send test to a real mailbox.
   - The result message matches the delivery log status.
   - Request a password reset for a user on that tenant: the email uses the customized copy.
   - Archive the copy (confirm dialog, Escape closes) and request another reset: it uses the system copy.
6. **New template.**
   - The Event picker offers only authorable events.
   - Content is prefilled from the event's default.
   - Save as draft redirects to the editor.
   - No HTML or JSON field exists anywhere.
7. **Starter-plan tenant.** The Module picker has no Payroll, Claims, Loans, Benefits or Performance, and no Payslip event is offered.
8. **Demo tenant after release (with WP-06).**
   - "Password reset email" shows the new copy.
   - A forgot-password email arrives with the new copy.
   - The scheduled report email arrives with the new copy.

## Residual risks and follow-ups

- **Payslip email.** `payslips.service.ts:575-577` passes `actionUrl` as a relative path and `tenantName` as the payroll calendar's name, so the payslip copy has no button and does not name the company. Follow-up for the payroll owner: pass an absolute URL and the tenant name, then add them to the copy.
- **Scheduled report period.** `report-scheduler.worker.ts` passes `periodLabel: schedule.periodPreset`, a raw preset value, which the report email prints as-is.
- **Module-to-feature mapping (inference).** `MODULE_FEATURE_KEYS` maps claims, loans and benefits to the `payroll` feature, and performance to a feature key that does not exist (hidden). `tenant-settings.catalog.ts` has no keys for them; confirm with the product owner.
- **Existing tenant clones of placeholders.** Clones of the old placeholder templates stay ACTIVE. The seed warns and never changes them, per ADR-0015. Any found on the throwaway or production database need an owner decision.
- **Platform mail overrides.** Tenant-scoped copies of `BILLING_INVOICE_ISSUED` / `SUPPORT_CASE_UPDATE` created before this change would still override DijiPeople's own mail to that tenant; new ones can no longer be created.
- **Editor markup.** `document.execCommand` is obsolete in the spec but implemented everywhere; the editor may reshape authored markup on save. The server sanitiser is the authority. Needs browser verification in Chrome, Firefox and Safari.
- **Cosmetic log line.** `runSeedConfig` still logs `Email templates created/updated: N`, which now counts retired legacy rows. It is outside the owned section.
- **Out of scope.** `AUTH_OTP` remains in `AUTH_NOTIFICATION_EVENTS` and in `seedTenantNotificationPreferences`.
- **Merge hotspots with WP-06:**
  - `notifications.service.ts`: 396 lines removed, including the block immediately above `listProviderSettings` and imports.
  - `notifications.controller.ts`: constructor and imports.
  - `notifications.module.ts`: providers.
  - `seed-config.ts`: the import block; the builder functions removed right after `seedTenantConsoleProviders`.

## Files touched outside declared ownership

None:
- `notifications.repository.ts`: only the template methods and `bootstrapSystemDefaults` template loop.
- `notifications.module.ts`: only the provider registration.
- `notifications.service.ts`: only the template methods that moved out.
