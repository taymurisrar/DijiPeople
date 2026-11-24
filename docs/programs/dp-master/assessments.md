# DP-MASTER baseline assessments (2026-11-24, base 47eadf74)

Evidence from code reads at the base SHA. FACT = read in code; INFERENCE = not
confirmed. These feed WP-05.S1, WP-17.S1 and the traceability register.

## WP-05.S1 - inert recruitment settings (ITEM-0245)

- FACT: `tenant-settings-dispositions.ts:233-265` marks these `NOT_IMPLEMENTED`:
  `defaultOnboardingPlanId`, `automaticallyActivateEmployeeAfterSuccessfulOnboarding`,
  `automaticallyStartOnboardingAfterHiring`, `automaticallyScheduleOnboardingTasks`,
  `requireMandatoryOnboardingTasksBeforeActivation`, the four default email/offer
  template ids, `notifyHiringManagerWhenCandidateHired`,
  `notifyEmployeeWhenOnboardingStarts`, `requireOfferApprovalBeforeHiring`,
  `requireBackgroundVerificationBeforeHiring`,
  `requireDocumentVerificationBeforeEmployeeActivation`, `duplicateCandidateDetection`,
  `automaticallyMoveRejectedCandidatesToTalentPool`,
  `automaticallyCloseJobOpeningWhenPositionsFilled`, plus numbering/source/retention rules.
- FACT: `recruitment.service.ts` reads only `resumeParsingEnabled`,
  `defaultRecruitmentPipelineId`, `autoCreateEmployeeFromCandidate`, and the employee
  settings `keepEmployeeAsDraftUntilOnboardingComplete` / `autoCreateDraftOnHire`.
- INFERENCE: `onboardingWorkflow`, `onboardingChecklistTemplate` and
  `preventEmployeeActivationUntilMandatoryFieldsCompleted` are also unread.
- FACT: `common/constants/tenant-modules.ts` has 14 keys and no `projects`;
  `projects` is a feature key in `tenant-features.ts:21`.
- Disposition: settings need a reader or an "unavailable" marker (WP-05 AC). Needs an
  ExecPlan together with WP-07/WP-08.

## WP-17.S1 - desktop agent privacy assessment against D16

- FACT: no keylogger; the only input signal is idle time
  (`apps/agent-desktop/src/main/activity-tracker.ts:113`).
- FACT: clipboard/screenshot capture is rule-triggered, gated by tenant flags that
  default false, re-checked at ingest (`dlp.service.ts:76-86,153-162`); full clipboard
  text only when `clipboardFullContent` is set, stored encrypted; content reads need
  `dlp.review` and are audited; retention is enforced (`dlp.service.ts:452-473`).
- FACT: DLP content is not used in `DailyProductivitySummary`.
- GAP: `captureActiveApp` and `captureWindowTitle` default true; `dlpConsentRequired`
  defaults false; no employee-visible disclosure was found in the agent UI (INFERENCE:
  search miss). Browser tab title is derived from the window title.
- GAP: no client-generated event id; dedupe key is `tenant:session:occurredAt`
  (`agent.service.ts:1130`), so same-timestamp samples collapse (ITEM-0032 partly met).
- Decision OD-DLP-DEFAULTS approved for ALL tenants (owner, 2026-11-24): becomes
  slice WP-17.S2 (audited, reversible data change; per-tenant override kept).
- Entitlement: desktop agent is gated server-side (`@RequireEntitlement(DESKTOP_AGENT)`
  on Agent and Dlp controllers; login/refresh checked in `agent.service.ts:155-166`);
  plan catalogue: Enterprise or entitled Custom only.

## WP-21 - package engine scope

- FACT: portable types are environmentVariable, table, column, optionSet, lookup, form,
  view, widget, actionBar (`customization/package-artifact.ts:66-75`); identity
  `<type>:<objectKey>`. Workflows, templates, navigation are not portable and
  `Workflow` has no logical key (`@@unique([tenantId, name])`).

## WP-03.S3 design - durable workflow actions on the existing outbox (A02, A07)

Reuse, do not build a second queue. `modules/outbox` already provides a transactional
outbox (`OutboxService.emit` inside the caller's transaction, `idempotencyKey`,
`availableAt`, `maxAttempts`), a leased dispatcher/worker, per-consumer consumption
rows (`OutboxEventConsumption`) and an `OutboxHandler` contract
(`consumerKey`, `handles`, `handle(event, payload)` returning PROCESSED / SKIPPED /
MANUAL_ACTION_REQUIRED).

- The emitting domain command writes its record and calls `OutboxService.emit` in the
  same transaction: event id = outbox idempotency key, so a replay cannot enqueue twice.
- A `WorkflowActionHandler` (consumerKey `workflow-actions`) resolves matching
  workflows, pins the published version, and executes each action as its own step
  with key `eventId:workflowVersion:actionId:recipient`; a step ledger row per step
  records state, attempts and a safe summary. Retry re-runs only failed steps.
- Synchronous (pre/post-operation) actions stay in-transaction and are limited to an
  allow-list with no external calls; email/HTTP/waits only ever go through the outbox.
- Needs: a `DomainEventType` value for workflow events and the step-ledger table
  (schema lease), after WP-03.S2 delivers stable keys and immutable versions.
- Today `NotificationsService.emit` calls the workflow runtime inline after the
  business write; WP-03.S3 replaces that call with the outbox emit.
