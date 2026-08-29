---
ID: BUG-1962
aliases: [BUG-1962]
Title: Assigned On is required by the leave assignment API and rendered as an optional field
Status: IN_PROGRESS
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1962 — Assigned On is required by the leave assignment API and rendered as an optional field

## Summary

In the leave policy Assignments dialog, "Assigned On" carries no required marker
and its input is not marked required, but the API rejects the request when it is
missing. The user learns the field was mandatory only from a raw server
validation string after pressing Save.

## Expected Behavior

A field the API requires is marked required in the form, and a missing value is
caught by inline client validation naming that field — the same way the
department form already does it ("Department Name is required.", "Business Unit
is required.").

## Actual Behavior

The "Assigned On" control renders with no asterisk and `input.required === false`.
Submitting without it returns, verbatim:

```
effectiveFrom must be a valid ISO 8601 date string
```

which names the DTO property, not the label on screen.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Settings > People Configuration > Leave Configuration > Leave Policies, open a
   policy (for example `0f32d305-adc3-4277-b31c-c318ead8e26d`).
2. Assignments tab > New.
3. Inspect the "Assigned On" control: no required marker, `input.required` is
   `false`.
4. Set Scope Type = Tenant, leave "Assigned On" empty, Save & Close.
5. The API answers `effectiveFrom must be a valid ISO 8601 date string`.

Note: on this tenant the same save also fails for BUG-1961 (the parent id is
never sent). The two are independent — supplying `leavePolicyId` directly and
omitting `effectiveFrom` reproduces this error on its own.

## Evidence

The rendered control state and the verbatim API message above. The API's
requirement is confirmed by the successful direct call recorded in BUG-1961,
which had to include `"effectiveFrom":"2026-01-01T00:00:00.000Z"` to get a 201.

No file:line evidence was collected for the DTO or the field metadata; both
should be located before the fix so the two can be made to agree at one source.

## Root Cause

Not established. The form metadata for this field and the `class-validator` rule
on the DTO disagree about optionality; which one is intended is a product
question (is an assignment's effective date genuinely mandatory, or should it
default to today?).

## Impact

A user filling in the dialog correctly by every visible cue gets a failure they
could not have anticipated, phrased in the API's vocabulary rather than the
screen's. It will still bite after BUG-1961 is fixed, which is why it is a
separate record. Rated MEDIUM: missing validation with a user-visible dead end,
no data risk.

## Affected Areas

`apps/web` leave policy Assignments dialog field metadata;
`services/api/src/modules/leave` create-assignment DTO.

## Proposed Resolution

Decide whether `effectiveFrom` is required or defaulted, then make the form and
the DTO express the same answer: required and marked required with inline
validation, or optional with a server-side default. Whichever way it goes, the
message the user sees must name "Assigned On", not `effectiveFrom`.

## Acceptance Criteria

- The "Assigned On" control is marked required if the API requires it.
- Submitting the dialog without it produces an inline error on that field before
  any request is sent.
- No API property name appears in the message the user reads.

## Regression Coverage

None yet.

## Dependencies

None. Independent of BUG-1961 despite sharing the dialog.

## Related Items

BUG-1961 (the parent id is never sent) and BUG-1963 (raw server messages shown to
the user) were found in the same dialog. BUG-1546 and BUG-1746 cover the related
theme of required fields being undiscoverable in the admin console.

## Resolution

**The field is now marked required; nothing yet stops the submission. One of
three acceptance criteria is met, so this record stays open.**

Commit `d3ffb3aa` on `agent/starter-blocker-fixes` — on that branch only, not yet on `develop` or `main`,
added `required: true` to the `effectiveFrom` quick-create field on **both**
leave-policy assignment tabs in
`apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts` — the
Eligibility tab at `:2985` and the Assignments tab at `:3191` — each with a
comment naming `CreateLeavePolicyAssignmentDto` as the reason. Both were needed:
the two tabs are separate declarations of the same relationship and fixing one
would have left the other rendering the field as optional.

`required` propagates into the generated quick-create form metadata as
`requirementLevel: "required"` (`module-related-subgrid.tsx:1424` and `:1498`),
which the form renderer passes down to `FormControl`, producing the `*` marker
and `input.required === true`.

Against the acceptance criteria:

- **1, the control is marked required** — met. This is the exact inverse of the
  Actual Behavior recorded above, where `input.required` was `false`.
- **2, an inline error on the field before any request is sent** — **not met.**
  The quick-create dialog runs no client-side validation at all. Its Save and
  Save & Close buttons are `type="button"` with plain click handlers
  (`module-quick-create-panel.tsx:65-80`), so there is no form submit for the
  browser's native `required` to gate, and the panel passes neither `fieldErrors`
  nor `touchedFields` to the renderer. `runtime-form-validation.ts` — which does
  produce exactly the wanted message, "Assigned On is required." — is imported by
  `module-record-page.tsx` and by nothing else. The related-subgrid path never
  reaches it.
- **3, no API property name in the message the user reads** — **not met**, and it
  follows from 2. With no client gate the request still goes out empty and the
  API still answers `effectiveFrom must be a valid ISO 8601 date string`. What
  changed, from BUG-1966's fix in the same commit, is that this message is now
  reliably shown rather than sometimes swallowed.

### To finish it

Wire the quick-create panel to `validateRuntimeForm` before calling `onSave`,
surfacing the result through the `fieldErrors` and `touchedFields` props the
renderer already accepts. That closes 2 and 3 together, for every related-list
dialog rather than for this field, and it is the same gap that lets any other
required quick-create field reach the API empty.

## QA Retest

Not yet performed, and it cannot be performed today: the fix is not on `develop`
and production runs `main` at `949f461c`, which does not contain it. This task
did not touch `main`, so **nothing here is verified in production** and the
field still renders optional on the demo tenant.

Live verification is pending a release: open the Assignments dialog, confirm
"Assigned On" carries the required marker and `input.required === true`, then
submit without it. Expect the raw DTO message — criteria 2 and 3, still open,
not a new finding. Repeat on the Eligibility tab, which is the second
declaration and was fixed in the same change.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — same dialog, same fix window.
- 2026-08-29 — partially fixed in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`: `effectiveFrom` is now `required: true` on both leave-policy assignment tabs. Status OPEN to IN_PROGRESS, not FIXED — the quick-create dialog runs no client-side validation, so the field is marked required but nothing blocks an empty submission and the raw DTO message still reaches the user. **Not deployed** — production runs `main` at `949f461c`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
