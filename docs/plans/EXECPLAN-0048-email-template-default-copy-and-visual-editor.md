CONTEXT_FILES_REQUIRED:
  - docs/decisions/ADR-0015-production-retires-sink-email-providers.md (on agent/demo-walkthrough-2-records; binding)
  - docs/decisions/ADR-0011-notification-rule-and-preference-are-two-gates-not-one.md
  - docs/knowledge/modules/notifications.md
  - services/api/prisma/AGENTS.md (seed rules)

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — catalog copy, template authoring service, DTOs, seed guard
  - Frontend — visual editor, variable picker, live preview, list
  - Security — HTML sanitisation on write, escaping on render, tenant scoping

DELIBERATELY_NOT_USED:
  - Database/Prisma — no schema change; `EmailTemplate` already has every column used
  - Integration — no provider or transport change (that is WP-06, BUG-3501)

SINGLE_WRITER_FILES:
  - none of the listed single-writer files are touched
  - shared (non single-writer) files also edited by WP-06: `notifications.controller.ts`, `notifications.module.ts`, `services/api/prisma/seed-config.ts` (this plan edits only the email-template sections: `AUTH_TEMPLATE_SEEDS`, `seedSystemEmailTemplates`, `seedTenantEmailTemplates`)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/declared-but-unwired-step.md
  - docs/qa/known-bug-patterns/two-writers-one-field.md
  - docs/qa/known-bug-patterns/unvalidated-seed-state.md
  - docs/qa/known-bug-patterns/silent-config-fallback.md
  - docs/qa/known-bug-patterns/tenant-filter-missing.md
  - docs/qa/known-bug-patterns/read-filter-without-a-write-check.md
  - docs/qa/known-bug-patterns/assertion-without-a-check.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-386 — scheduled report template declared a variable the worker never passed (the same seam, other events)
  - REG-505 … REG-509 — reserved for this package (entries in the stream report)

TARGET_BRANCH:            develop (via agent/walkthrough2-email-templates; the orchestrator integrates)
TARGET_ENVIRONMENT:       PRODUCTION (TASK-0031 WP-08 releases it)
DEPLOYMENT_REQUIRED:      yes (as part of TASK-0031's release, not by this package)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api (seed:config runs in pre-deploy) -> web
ROLLBACK_CLASS:           DATA_MIGRATION (seed rewrites system template copy and re-keys legacy per-tenant auth rows; both reversible, see Rollback)
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes (WP-08)
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff (orchestrator)
KNOWN_CONCURRENT_WORK:    WP-06 agent/walkthrough2-providers-logs (notifications service/controller/module, seed-config provider section); WP-05 agent/walkthrough2-notification-events (rules/events page, lib/notifications-api.ts)
ENVIRONMENT_DEPENDENCIES: none

KNOWN_MISTAKES_TO_AVOID:
  - REG-386 / BUG-2683: `EmailTemplateRendererService.render` treats every declared `availableVariables` key as REQUIRED (`email-template-renderer.service.ts:41-55`). Declaring a variable an emitter does not pass does not blank it — it stops the email. Every authored template declares only the intersection of what its emitters pass, and a seam spec reads the emitters.
  - The two `sendTemplateEmail` callers in `auth.service.ts` (`:865`, `:1045`) pass neither `primaryColor` nor `logoUrl`; the current system reset template declares both (`notification-events.catalog.ts:762-775`). It works today only because per-tenant rows shadow it (below). Real copy must not reintroduce that failure.
  - `two-writers-one-field`: `NotificationsRepository.bootstrapSystemDefaults` (`notifications.repository.ts:1243-1280`) and `seedSystemEmailTemplates` (`seed-config.ts:875-914`) both upsert system templates. Both go through one guard.
  - Memory: CRLF makes source-reading specs pass vacuously; normalise line endings and assert the extracted set is non-empty.
  - Memory: guard the seam, not the ends — the web payload is validated against the real API DTO through a shared fixture.
  - Memory: no helper/explanatory UI copy (owner decision D5).

# ExecPlan — Email templates: real default copy and a visual editor

## Objective

Every seeded system email template carries real, event-specific copy, and a
template is ACTIVE only if something in the product actually sends it. No
placeholder body can be ACTIVE: the placeholder path is gone, the catalog throws
at load if an event names a system template with no authored copy, and both a
spec and the configuration seed fail on placeholder wording. Seeding stays
idempotent and never overwrites a tenant's template. Tenant administrators edit
templates through a visual editor with a variable picker, live preview and test
send. System templates open as a rendered preview with a single Customize
action, and the event picker lists only events that send email for this tenant.

## Business requirement

BUG-3500 (P1, go-live blocker) and ITEM-0181, TASK-0031 WP-04. Owner decisions
D4 and D9 (2026-09-13) and ADR-0015: the Architect drafts the copy and it ships
ACTIVE together with sink-provider retirement (WP-06). The owner reviews the copy
afterwards, from `docs/tasks/TASK-0031-streams/WP-04-email-copy-for-owner-review.md`.

## Existing behavior

- FACT: `SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS` (`notification-events.catalog.ts:554-557`) seeds one template per event with a `systemTemplateKey` (11 events). `createSystemTemplateSeed` authors five (activation, reset, invoice, report, support; `:562-738`). The other six fall through to a placeholder body with `status: ACTIVE` (`:740-759`): `auth.otp`, `PAYSLIP_AVAILABLE`, `leave.approval-request`, `leave.approved`, `timesheet.approval-request`, `payroll.processed`.
- FACT: `seedSystemEmailTemplates` (`seed-config.ts:875-914`) upserts all of them on every run, and its `update` branch rewrites body and status. `runSeedConfig` calls it at `:478` on every release.
- FACT: `seedTenantEmailTemplates` (`seed-config.ts:2169-2221`, called at `:501` and from `seed-demo.ts:131`) writes per-tenant rows at TENANT scope with `isSystem: true`, ACTIVE, for `AUTH_ACCOUNT_ACTIVATION`, `AUTH_PASSWORD_RESET` and `AUTH_OTP` (`AUTH_TEMPLATE_SEEDS`, `:102-197`), rewriting them every run. Tenant scope precedes SYSTEM in `notificationScopeChain` (`notifications.constants.ts:66-86`), so these hidden rows are what auth emails actually use. `visibleTemplateWhere` (`notifications.repository.ts:297-304`) hides them from the tenant list. They also hold the `(scopeKey, templateKey)` pair a tenant clone of an auth template needs (`@@unique([scopeKey, templateKey])`), so Customize on an auth template collides.
- FACT: which events really send email, by call site:
  - `AUTH_ACCOUNT_ACTIVATION`: `user-invitations.service.ts:439-466`
  - `AUTH_PASSWORD_RESET`: `auth.service.ts:865-889`, `auth.service.ts:1045-1068`, `employee-profiles.service.ts:1770-1791`
  - `BILLING_INVOICE_ISSUED`: `super-admin.service.ts:3253` with `buildInvoiceEmailVariables` `:5292-5318` (platform to customer)
  - `PAYSLIP_AVAILABLE`: `payslips.service.ts:562-580`
  - `REPORT_SCHEDULE_DELIVERY`: `report-scheduler.worker.ts:500-530`
  - `SUPPORT_CASE_UPDATE`: `support-cases.service.ts:594-606` (platform support agent to customer)
  - No email emitter: `AUTH_OTP` (none), `LEAVE_APPROVAL_REQUEST` and `LEAVE_APPROVED` (retired, `notification-events.catalog.ts:108-141`), `TIMESHEET_APPROVAL_REQUEST` (in-app `emit()` only, `timesheet-workflow.service.ts:866`; `emit()` never sends email, `notifications.service.ts:930-1090`), `PAYROLL_PROCESSED` (none; payroll dispatches IN_APP only, `payroll-notification.service.ts:68-72`).
- FACT: `PAYSLIP_AVAILABLE` passes `tenantName` = payroll calendar name and `actionUrl` = a relative path `/me/payslips/<id>` (`payslips.service.ts:575-577`). Neither is fit for an email body.
- FACT: tenant editing today uses raw HTML plus two JSON textareas (`email-template-create-form.tsx:250-273`, `email-template-editor.tsx:275-313,342-347`). System templates render disabled inputs (`email-template-editor.tsx:41,193-316`). The list shows the event code under the name and again in a Template Key column (`email-templates-table.tsx:75-86`).
- FACT: stored HTML is checked only for `<script` and `javascript:` (`email-safety.ts:7-27`). Variable values are HTML-escaped on render (`email-template-renderer.service.ts:88-95`).
- FACT: template create/update/clone/activate/archive write no audit rows (`notifications.service.ts:515-695`). `updateTenantTemplate` updates by bare id after a separate ownership read (`notifications.repository.ts:402-416`).

Must keep working: template resolution by scope chain; emitters' `templateKey` matching; `NotificationsRepository.listTemplates` (also used by `workflows.service.ts:80`); `SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS` import in `report-scheduler.worker.spec.ts:7` (kept as an alias).

## Existing architecture

- API: `services/api/src/modules/notifications/` — `notification-events.catalog.ts` (event and system template source of truth), `notifications.controller.ts`, `notifications.service.ts`, `notifications.repository.ts`, `email/email-template-renderer.service.ts`, `email/email-safety.ts`, `dto/email-template.dto.ts`, `dto/email-execution.dto.ts`.
- Seed: `services/api/prisma/seed-config.ts`, applied by `npm run release:api`.
- Plan gating: `FeatureAccessService.isFeatureEnabled` (`tenant-settings/feature-access.service.ts:89-92`), exported by `TenantSettingsModule`, which `NotificationsModule` already imports.
- Web: `apps/web/app/(authenticated)/settings/notifications/templates/{page,new/page,[id]/page}.tsx`; `_components/email-template-{create-form,editor}.tsx`, `email-templates-table.tsx`; shared `notification-ui.tsx`, `../_components/scope-picker.tsx`, `app/components/ui/{button,dialog,form-control,empty-state}.tsx`, `app/components/feedback/confirm-dialog.tsx`, `app/components/data-table/`.
- Patterns: `sanitize-html` allowlists already in use (`contracts.service.ts:5324`, `platform-communications.service.ts:68`); service specs built with `Object.create(Service.prototype)` (`notification-rules.spec.ts`).

## Requirements

1. R1 — Every system template has an authored subject, HTML body and text body specific to its event. No template body or description contains placeholder wording.
2. R2 — A system template's `availableVariables` is exactly its declared variable list, and every declared variable is passed by every emitter of that event (seam spec over the emitter call sites).
3. R3 — A system template is ACTIVE only when its event has an email emitter and is available. The five without one seed as DRAFT.
4. R4 — An event naming a `systemTemplateKey` with no authored copy fails at module load. The placeholder fallback no longer exists.
5. R5 — The seed updates a system row only when it is `tenantId: null`, `isSystem: true`, `updatedBy: null`. It never touches tenant rows. `bootstrapSystemDefaults` uses the same guard.
6. R6 — `seedTenantEmailTemplates` stops writing per-tenant auth duplicates and retires existing ones idempotently: re-key to `<key>.retired-tenant-default`, set ARCHIVED, only for `isSystem: true` rows at the tenant's own scope with `updatedBy: null`.
7. R7 — The configuration seed fails if any ACTIVE system template contains placeholder wording, and warns (without failing) for tenant-owned rows.
8. R8 — `GET /notifications/email-templates/authoring-events` lists only events that send email, are available, are not platform-sent, and whose plan feature is enabled for the caller's tenant. Each event carries `{ key, label, sample }` variables and default content.
9. R9 — Create derives the template key and `availableVariables` server-side from the event. Neither is typed by the user. Create and update reject tokens the event does not supply, and sanitise HTML with an allowlist.
10. R10 — Preview renders saved or unsaved content through the existing `:id/preview` route (optional content overrides) or a sibling draft route. Sample values come from the catalog server-side. Test send needs only a recipient.
11. R11 — Customize on a system template creates, or returns the existing, tenant-owned copy at tenant scope with the same key, so it overrides the default. Platform-sent templates cannot be customized.
12. R12 — The template list shows the key once, lists only sendable system templates for this tenant, and fits without horizontal clipping at 1440px.
13. R13 — The editor has no HTML/JSON textarea, a formatting toolbar, a variable picker that inserts at the caret in subject or body, live preview and test send. System templates show a rendered preview and one Customize action. No explanatory helper text.
14. R14 — State-changing template operations write audit rows with before/after snapshots. Every template query is tenant-scoped.

## Dependencies

- ADR-0015 (accepted). WP-06/BUG-3501 ships in the same release. Without it, a CONSOLE provider still swallows mail and this copy is simply unseen (harmless).
- ITEM-0180 (WP-05) defines the events page. This plan reuses the catalog `availability` field that page reads, not the page.
- No blocking dependency.

## Files / modules affected

API (`services/api`):
- `src/modules/notifications/system-email-templates.copy.ts` — NEW: authored copy and variables for all 11 templates
- `src/modules/notifications/notification-events.catalog.ts` — replace the placeholder fallback; export `SYSTEM_EMAIL_TEMPLATES` (+ alias), authoring helpers, placeholder guard, seed write guard
- `src/modules/notifications/system-email-templates.spec.ts` — NEW
- `src/modules/notifications/system-email-template-emitters.spec.ts` — NEW (seam over emitter call sites)
- `src/modules/notifications/email/email-template-authoring.service.ts` — NEW (template API logic moved out of `notifications.service.ts`)
- `src/modules/notifications/email/email-template-authoring.service.spec.ts` — NEW
- `src/modules/notifications/email/email-safety.ts` — add `sanitizeEmailTemplateHtml`
- `src/modules/notifications/dto/email-template.dto.ts`, `dto/email-execution.dto.ts` — optional key/variables, preview overrides, draft preview DTO
- `src/modules/notifications/dto/email-template-payload.spec.ts` — NEW (seam: web fixture against real DTO)
- `src/modules/notifications/notifications.controller.ts` — template routes call the authoring service; new routes
- `src/modules/notifications/notifications.module.ts` — register the authoring service
- `src/modules/notifications/notifications.service.ts` — remove the moved template methods
- `src/modules/notifications/notifications.repository.ts` — guarded system upsert; tenant-scoped template update
- `prisma/seed-config.ts` — email-template sections only

Web (`apps/web`):
- `app/(authenticated)/settings/notifications/templates/_lib/email-template-editing.ts` + `.spec.ts` — NEW pure logic
- `app/(authenticated)/settings/notifications/templates/_lib/email-template-payload.fixture.json` — NEW shared seam fixture
- `app/(authenticated)/settings/notifications/templates/_lib/email-template-client.ts` — NEW client for new/changed routes (keeps `lib/notifications-api.ts`, shared with WP-05/06, untouched)
- `_components/email-template-rich-text-editor.tsx`, `_components/email-template-composer.tsx`, `_components/email-template-preview.tsx` — NEW
- `_components/email-template-editor.tsx`, `_components/email-template-create-form.tsx`, `_components/email-templates-table.tsx` — rewritten
- `templates/page.tsx`, `templates/new/page.tsx`, `templates/[id]/page.tsx` — data and copy

Docs: this plan; `docs/tasks/TASK-0031-streams/WP-04-report.md`; `docs/tasks/TASK-0031-streams/WP-04-email-copy-for-owner-review.md`.

## Database impact

None to the schema. Data (seed): system template copy and status converge on the catalog. Legacy per-tenant auth rows are re-keyed and archived. Both are idempotent: a second run finds nothing to change. PROPOSAL: re-key rather than delete, because `EmailDeliveryLog.templateId` history is kept (it would `SetNull` on delete) and the change is reversible.

## Backend impact

- `GET  /notifications/email-templates` — tenant templates, plus system templates sendable for this tenant. Adds `customizable`. The rest of the shape is unchanged.
- `GET  /notifications/email-templates/authoring-events` — NEW. `{ items: [{ code, name, category, templateKey, variables: [{ key, label, sample }], defaultContent: { subjectTemplate, htmlTemplate, textTemplate } }] }`. Registered before `:id`.
- `GET  /notifications/email-templates/:id` — adds `variables` and `customizable`.
- `POST /notifications/email-templates` — `templateKey` and `availableVariables` become optional and are derived server-side.
- `PATCH /notifications/email-templates/:id` — rejects unknown tokens; `availableVariables` comes from the catalog.
- `POST /notifications/email-templates/:id/clone` — Customize semantics for system sources (R11).
- `POST /notifications/email-templates/:id/preview` — body `{ variables?, subjectTemplate?, htmlTemplate?, textTemplate? }`.
- `POST /notifications/email-templates/preview` — NEW draft preview `{ eventCode, subjectTemplate, htmlTemplate, textTemplate?, variables? }`.
- `POST /notifications/email-templates/:id/test-send` — `variables` optional (catalog samples).
- `EmailTemplateAuthoringService` injects `NotificationsRepository`, `EmailService`, `EmailTemplateRendererService`, `FeatureAccessService` and `AuditService`, and reuses all of them. The seam into provider logic is untouched (`EmailService.sendTemplateEmail`).
- Transactions: activation already archives in a transaction. Update becomes `updateMany { id, tenantId, isSystem: false }` followed by a scoped read.

## Frontend impact

- App: `apps/web`. The settings pages are bespoke `SettingsShell` screens today and stay so. The editor is a rich editing surface the settings runtime cannot express.
- Editor, PROPOSAL, no new dependency: a `contentEditable` surface with a toolbar (bold, italic, underline, heading, bulleted and numbered list, link) using `document.execCommand`. `@tiptap` exists only in `apps/admin/package.json`. Adding it to `apps/web` needs a lockfile change (`npm install`), which this package may not run. `execCommand` is deprecated in spec but implemented by every evergreen browser, and the server sanitiser, not the editor, decides what HTML is stored.
- Variable picker: a menu of the event's variables that inserts `{{key}}` at the saved caret of the last-focused field (subject or body). Subject is a raw input with the shared `inputClassName`, because `TextField` exposes no ref or selection.
- Plain text is derived from the edited HTML by a tested pure function.
- Live preview is debounced, rendered in a sandboxed `iframe`, and shows subject and text.
- System template: preview plus a Customize button (hidden when `!customizable` or `!canManage`).
- Reused: `Button`, `TextField`, `SelectField`, `ConfirmDialog`, `DataTable`, `EmptyState`, `ScopePicker`, `SettingsPanel`, `ErrorBanner`.
- States: route `loading.tsx`/`error.tsx` exist under `(authenticated)/settings/`. Preview has loading, error and empty states. The list keeps its empty state.
- Responsive: editor and preview stack under `xl`; table columns reduced (R12).
- Accessibility: toolbar buttons have `aria-label` and `aria-pressed`; the editor has `role="textbox"`, `aria-multiline` and a label; the archive confirmation uses the shared dialog.

## Permission / RBAC impact

- New keys: none. New routes reuse `notification.templates.read` + `SETTINGS read` (authoring-events, draft preview) and `notification.templates.manage` + `SETTINGS configure` (writes, test send), exactly as the existing routes do (`notifications.controller.ts:104-204`).
- Both decorators on every route. No row-level access levels apply (templates are tenant configuration). No elevated-role change. No `security-keys.ts` change.

## Tenant-isolation impact

- Every template read uses `visibleTemplateWhere(tenantId)` or `tenantOwnedTemplateWhere(tenantId)` with `tenantId` from `request.user`.
- Updates move from bare-id `update` to `updateMany { id, tenantId, isSystem: false }`.
- Customize looks up the occupant with `findFirst { scopeKey: tenant scope of user, templateKey, tenantId }`.
- Authoring-events and scope options read features for `user.tenantId` only.
- The seed's per-tenant retirement filters `tenantId` and that tenant's scope key explicitly.
- No platform-path access. A reviewer confirms by grepping `emailTemplate.` in the authoring service and repository for a `tenantId` predicate.

## Audit / event / logging impact

- `AuditService.log` with `entityType: 'EmailTemplate'`, `sourceModule: 'notifications'`: `EMAIL_TEMPLATE_CREATED` (after), `EMAIL_TEMPLATE_UPDATED` (before/after of name, subject, status, scope, version), `EMAIL_TEMPLATE_CUSTOMIZED` and `EMAIL_TEMPLATE_CLONED` (source id, after), `EMAIL_TEMPLATE_ACTIVATED`, `EMAIL_TEMPLATE_ARCHIVED` (before/after status). Canonical SCREAMING_SNAKE names per `common/constants/audit-actions.ts` (BUG-2046); written as literals, not added to that shared catalog.
- Snapshots exclude bodies, to keep audit rows small. The subject is included.
- Test send is logged by the existing delivery log. Never logged: rendered bodies, recipient lists beyond the existing delivery log.

## Integration impact

Email content only. No provider, gateway, desktop agent or Stripe change. Emitters are unchanged. This package only ever declares fewer variables than the emitters pass.

## Migration / data compatibility

- Existing tenant templates keep working. Their stored `availableVariables` are respected for events with no catalog variables. Tokens they already contain are validated only when edited.
- Old web against new API: create without `templateKey` fails in the old client only if it omits the key (it never did). The optional fields are backward compatible.
- New web against old API: the authoring-events and draft preview routes 404, so the create page errors. api deploys before web (DEPLOYMENT_ORDER).
- During rollout, auth emails switch from the hidden per-tenant rows to the system rows once `seed:config` runs, before the new API serves traffic.

## Parallel-safe tasks

- PARALLEL_SAFE: authored copy + catalog + specs (API).
- PARALLEL_SAFE: web pure logic + fixture + spec.

## Dependency-blocked tasks

- DEPENDENCY_BLOCKED: authoring service and controller on the catalog helpers.
- DEPENDENCY_BLOCKED: web editor and pages on the route contract.

## Integration tasks

- INTEGRATION: merge with WP-06 edits in `notifications.controller.ts`, `notifications.module.ts`, `notifications.service.ts` and `seed-config.ts` (orchestrator, WP-07).
- INTEGRATION: throwaway-DB browser QA: seed twice, open the list, Customize, edit, preview, test send (WP-07).

## Testing strategy

Commands (from AGENTS.md):
- `npm --workspace api run test -- notifications` (with a dummy `DATABASE_URL`)
- `npm --workspace api run test -- report-scheduler`
- `npm --workspace api run check-types`
- `npm --workspace web run test -- email-template`
- `npm --workspace web run check-types`
- `npx eslint --fix <changed files>` per workspace

New specs:
- `system-email-templates.spec.ts` — no placeholder wording in any body or description (fails today); used tokens ⊆ declared variables; ACTIVE iff emitter + available; one seed per `systemTemplateKey`; the seed write guard skips tenant, non-system and edited rows; `sanitizeEmailTemplateHtml` keeps every authored token and link.
- `system-email-template-emitters.spec.ts` — for each ACTIVE template, reads each emitter call site (CRLF-normalised) and asserts declared variables ⊆ keys passed, with a non-empty extraction guard. It fails against the current reset template, which declares `primaryColor`/`logoUrl`.
- `email-template-authoring.service.spec.ts` — authoring-events filtering (retired, unavailable, platform-sent, feature disabled); create derives key and variables and rejects unknown tokens; Customize returns an existing tenant copy, refuses platform-sent, and clones at tenant scope with the same key; update is tenant-scoped; audit written; preview uses catalog samples and escapes a hostile value.
- `dto/email-template-payload.spec.ts` + web `email-template-editing.spec.ts` — both assert the same fixture: web builder output equals the fixture, and the fixture passes `ValidationPipe` rules for the real DTOs with `forbidNonWhitelisted`.
- Existing: `notification-events.payslip.spec.ts`, `notification-events.loan.spec.ts`, `report-scheduler.worker.spec.ts` (delivery contract) stay green.

Manual, DB-backed (WP-07, throwaway DB): run `seed:config` twice and diff system rows (no change on the second run); confirm per-tenant auth rows are archived and re-keyed; confirm an edited tenant clone is untouched; browser steps in the stream report.

## Risks

1. HIGH likelihood / HIGH impact if missed: auth email failing on missing variables once the hidden per-tenant rows stop shadowing the system rows. Mitigation: declare only intersection variables; the seam spec over all three reset call sites.
2. MEDIUM / HIGH: seed retirement touching a row it should not. Mitigation: filter on `isSystem: true`, the tenant's own scope key, the auth keys and `updatedBy: null`; re-key rather than delete; idempotent.
3. MEDIUM / MEDIUM: `contentEditable` rewriting authored markup on save (attribute order, whitespace). Mitigation: the server sanitiser is the authority; tokens survive (spec); the preview shows exactly what is stored.
4. LOW / MEDIUM: merge conflicts with WP-06 in the controller, module and service. Mitigation: template logic moved to its own service file; edits confined to template blocks.
5. LOW / LOW: payslip email has no link because the emitter passes a relative URL. Mitigation: copy tells the reader where to find it; follow-up recorded in the stream report.

## Rollback considerations

- Code-only revert restores the old UI and API.
- Data: reverting the catalog and re-running `seed:config` rewrites system rows back to old copy (placeholders included). Retired per-tenant auth rows can be restored by renaming the key back and setting ACTIVE (a one-line `updateMany`, documented in the stream report).
- Frontend without API: the create page fails to load authoring events (errors rather than breaks the list).
- API without web: the old editor still works (optional fields).

## Definition of Done

- [ ] All specs above written, failing before the change where stated, passing after
- [ ] `api` and `web` check-types pass; eslint/prettier clean on changed files
- [ ] Both permission decorators on every new route; no new keys
- [ ] Tenant scoping verified on every template query; audit rows on every state change
- [ ] Owner review document and stream report (REG-505…REG-509 entries) written
- [ ] No files outside declared ownership; no helper text added; no new dependency
