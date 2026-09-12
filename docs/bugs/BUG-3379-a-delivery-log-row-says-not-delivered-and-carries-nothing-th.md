---
ID: BUG-3379
aliases: [BUG-3379]
Title: A delivery log row says Not delivered and carries nothing that explains why
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [notifications, apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-461
RelatedBacklogItem: ITEM-0168
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3379 — A delivery log row says Not delivered and carries nothing that explains why

## Summary

The email delivery log shows rows with status `NOT_DELIVERED` and gives an
operator no way to find out why. There is no reason field, no provider type, no
link to the provider that handled the message, and nothing on the screen that
explains what the status means. The record form shows five fields — subject,
recipient, status, provider id, created — and none of them answers the question
the status raises.

In this workspace the answer is benign: `NOT_DELIVERED` means the message was
handed to a sink provider that logs and discards it, which is exactly what
[[BUG-2741]] introduced the status to express, and the workspace runs a Console
provider by owner decision. The operator reading the log has no way to know
that. The reporter read these rows as delivery failures, which is the natural
reading and the reason this record exists.

**This is not a re-filing of the failures themselves.** The rows are correct.
The defect is that the screen showing them is not diagnosable.

## Expected Behavior

A delivery row whose message did not reach anybody explains why on the row or on
the record: the provider type that handled it, and a short reason. An operator
can go from "not delivered" to "because this workspace uses a Console provider,
here it is" without reading source code.

## Actual Behavior

The status is shown and nothing else. The grid renders the raw enum member
`NOT_DELIVERED`; the record form renders `Not delivered`. The same field is
presented two different ways on two screens.

## Reproduction

1. Open `/settings/notifications/delivery/delivery-logs` on the tenant product.
2. Observe rows with status `NOT_DELIVERED`, rendered as the raw enum member.
3. Open one of those rows.
4. Observe the form shows Subject, Recipient, Status (`Not delivered`), Provider
   ID and Created, and no reason of any kind.
5. Look for anything on either screen that explains the status. There is
   nothing.

## Evidence

Observed on the live demo workspace at `cbd9b812`. Twelve rows exist; three read
`NOT_DELIVERED` and nine read `SENT`. Every provider id from 31 August onward has
the form `console_1789117207642_ns3q1kh7e7`; the single row from 27 August
carries a real SMTP message id, `<f48dee24-...@dijipeople.com>`. The status
change is the deployment boundary of the [[BUG-2741]] fix, not a regression.

- `services/api/prisma/schema.prisma:789-805` — `EmailDeliveryStatus` has ten
  members: `REQUESTED`, `PENDING`, `PROCESSING`, `QUEUED`, `SENT`, `DELIVERED`,
  `FAILED`, `SKIPPED`, `DRY_RUN`, `NOT_DELIVERED`.
- `services/api/src/modules/notifications/email/email-execution.service.ts:476-479`
  — the only place the status is chosen:
  `const delivered = !isSinkProvider(resolvedProvider.providerType)`, then
  `SENT` or `NOT_DELIVERED`. `isSinkProvider`
  (`services/api/src/modules/notifications/email/providers.ts:29-34`) is true
  only for `CONSOLE` and `DEV`.
- The same block at `:481-494` sets `retryable: false` and **never** sets
  `errorMessage`. By contrast the thrown-error path at `:535-551` does store
  `errorMessage`. So a `NOT_DELIVERED` row is stored with no reason by design.
- `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts:6620-6642`
  — the screen is a read-only settings-runtime adapter keyed
  `notification-email-logs`, with fields limited to subject, recipient, status,
  `providerMessageId` and `createdAt`. There is no field for a reason and no
  field for the provider type.

The Providers screen, by contrast, is clear. It already states
"Console provider does not send real emails. Rendered emails are written to
server logs. Use only for development, staging, or temporary..." and banners
"Mail leaves as DijiPeople Demo no-reply@dijipeople.local over CONSOLE". The
explanation exists — it is just on a different screen from the symptom.

The record form also offers `Edit` and `Delete` buttons in a disabled state on
what is an immutable log, and `Share` and `Export` actions whose meaning on a
single delivery row is unclear.

**The Created column also disagrees with the record form, and loses the time.**
Re-measured at `06ed3592`:

| Surface | Created renders as |
|---|---|
| List | `09/12/2026` |
| Record form | `2026-09-11, 12:00 PM` |

Two formats for one field, and the list drops the time entirely. On a delivery
log the time is most of the value — it is how an operator correlates a message
with a deployment, a schedule run or an outage window. This is the same
list-versus-form divergence as the status rendering above and should be fixed
in the same pass.

One thing that was suspected and is **not** a defect: the list table is wider
than its container but sits inside a `w-full min-w-0 overflow-x-auto` wrapper,
and the document itself does not scroll horizontally (`scrollWidth` equals
`clientWidth` at 1425 px). That is exactly the arrangement `apps/web/AGENTS.md`
permits for a wide table. No record is warranted for it.

## Root Cause

[[BUG-2741]] correctly stopped the system claiming a discarded message was sent,
and put the explanation on the Providers screen. It did not extend the delivery
log's read model, so the screen that shows the symptom cannot show the cause.

## Impact

An operator investigating undelivered mail cannot diagnose it from the log and
will reasonably report a delivery outage that is not occurring — which is what
happened here. Low severity because no message is lost that was not already
intentionally discarded, and because the information exists one screen away.

## Affected Areas

`/settings/notifications/delivery/delivery-logs`, list and record form; the
delivery log read model in the `notifications` module.

## Proposed Resolution

Three contained changes:

1. Surface the provider type on the delivery log read model and show it as a
   column and a field. `providerType` is already persisted; it is simply not
   selected by the adapter.
2. Give `NOT_DELIVERED` a stored reason at the point it is set in
   `email-execution.service.ts:476-494`, for the same cost as the `FAILED` path
   already pays, and display it.
3. Render the status through the shared `StatusPill` with a human label in the
   grid, so the list and the record form agree. A raw enum member should not
   reach a tenant administrator's screen. Format Created through the same
   tenant formatting context on both surfaces, and keep the time.

While there, remove the disabled `Edit` and `Delete` controls from an immutable
log rather than showing dead buttons.

A retry action is a separate, larger piece of work and is tracked as
[[ITEM-0168]].

## Acceptance Criteria

- A `NOT_DELIVERED` row shows the provider type that handled it and a reason.
- The status label is identical in the list and on the record form, and is not a
  raw enum member.
- The Created value is identical in the list and on the record form, and carries
  the time as well as the date.
- An operator can reach the provider explanation from the delivery log without
  prior knowledge.
- No disabled Edit or Delete control appears on a delivery log record.

## Regression Coverage

Needs a test asserting that a delivery written through a sink provider persists
a non-empty reason and that the read model exposes the provider type. A register
entry follows once written.

## Dependencies

None.

## Related Items

[[BUG-2741]] introduced this status and fixed the Providers screen; it is FIXED
and this record is additive to it, not a duplicate. [[BUG-3200]] covers the
synchronous notification queue and is the broader delivery work. [[ITEM-0168]]
is the retry action. [[ITEM-0129]] built the platform provider inheritance
fallback.

## Resolution

All three proposed changes implemented, plus the disabled controls:

1. **Provider type surfaced.** `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts`'s
   `notification-email-logs` adapter now declares a `providerType` field
   (already persisted, previously unselected by the adapter) and lists it as
   a column and a record field.
2. **`NOT_DELIVERED` now stores a reason.** `EmailExecutionService.execute()`
   (`email-execution.service.ts`, the sink branch) sets `errorMessage` to a
   sentence naming the provider type and pointing at the Providers screen,
   for the same cost the `FAILED` path already paid. The field is relabelled
   "Reason" on the adapter, since "Error Message" reads wrong on a row that
   did not fail.
3. **Status and Created now agree between list and record.** Two shared,
   pre-existing bugs in `apps/web/app/components/runtime/module-data-table.tsx`
   were the actual cause, both fixed at the shared helper (so every other
   read-only settings-runtime list benefits, not only this one):
   - `formatDateValue` collapsed `"date"` and `"datetime"` into the same
     date-only formatter; it now branches on the field's declared
     `dataType` and calls `formatDateTimeWithTenantSettings` for `"datetime"`,
     matching what the record form (`runtime-value-formatter.ts`) already did.
   - `displayValue`'s `optionset` branch printed the raw stored value when no
     option label was declared; it now falls back to `humanizeEnumValue`,
     matching the same BUG-2009 floor `formatRuntimeFieldValue` already
     applied on the record form.
4. **Disabled Edit/Delete removed.** `standard-module-runtime.ts`'s
   `buildStandardCommands` showed `system.edit`/`system.delete` unconditionally,
   disabled, whenever a module set `adapterCapabilities.disableEdit`/lacked
   `softDelete` — the same shape already fixed for `system.new` via
   `disableCreate`. `system.edit` now follows that same omit-rather-than-
   disable pattern for `disableEdit`; a new `disableDelete` capability
   (additive, opt-in, set only for `mode: "read-only"` adapters in
   `settings-adapter-registry.ts`) does the same for Delete without changing
   any other module's existing disabled-Delete behaviour.

Not addressed in this pass, and explicitly not claimed as fixed: no dedicated
automated browser test for the list/record formatting agreement (see
QA-SETTINGS-019's Notes) — the fix is covered at the unit level for the reason
capture only.

## QA Retest

QA-SETTINGS-019 is the reusable scenario. The backend half (reason capture)
is pinned by `email-sink-delivery-status.spec.ts`, run and passing (see the
task's final validation report). The frontend half (status/Created
formatting, disabled-control removal) has not been executed against a live
browser in this session — no database or running app was available for this
task.

## History

- 2026-09-11 — created at `cbd9b812`. The reported "not delivered email logs"
  were measured first and found to be the [[BUG-2741]] fix behaving correctly;
  this record is the residual observability gap rather than the reported
  failure.
- 2026-09-12 — extended at `06ed3592` with the Created column divergence found
  in the residual-observation sweep. A suspected horizontal-overflow defect on
  the same table was measured and disproved; that is recorded above so it is
  not re-raised.
- 2026-09-12 — fixed in SESSION-0103. Regression register entry REG-461.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0168]]
- Modules — [[notifications]], [[tenant-application]]
- Regression — REG-461 (see the regression register)

<!-- GRAPH:END -->
