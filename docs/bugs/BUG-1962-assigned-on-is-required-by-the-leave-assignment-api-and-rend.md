---
ID: BUG-1962
aliases: [BUG-1962]
Title: Assigned On is required by the leave assignment API and rendered as an optional field
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-333
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
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

**Established, in two parts.** The field metadata and the DTO disagreed about
optionality, and behind that the dialog had no way to act on the answer even
once they agreed.

The product question the original text left open — is an assignment's effective
date genuinely mandatory — is settled by the API: `CreateLeavePolicyAssignmentDto`
requires `effectiveFrom`, so the form must too. It is not defaulted to today,
because an assignment's effective date is a decision an administrator makes
(a policy can be assigned to take effect at the start of the next cycle), and
silently substituting today would make a wrong date the easiest one to produce.

The second part is why marking the field required was not enough. The
quick-create dialog runs no client-side validation: its Save and Save & Close
buttons are `type="button"` with plain click handlers, so there is no form
submit for the browser's native `required` to gate, and the panel passed the
renderer neither `fieldErrors` nor `touchedFields`. `validateRuntimeForm`
produces exactly the wanted sentence, "Assigned On is required.", and was
imported by `module-record-page.tsx` and by nothing else. The related-list path
never reached it — so this was not a leave defect but a gap under every
related-list dialog in the product.

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

REG-333. `apps/web/lib/runtime/quick-create-validation.spec.ts` — the gate the
dialog runs before saving, driven from the subgrid metadata the settings tabs
actually declare. Mutation-tested at 3 failed / 4 passed with the gate
neutered. Detail in Resolution.

## Dependencies

None. Independent of BUG-1961 despite sharing the dialog.

## Related Items

BUG-1961 (the parent id is never sent) and BUG-1963 (raw server messages shown to
the user) were found in the same dialog. BUG-1546 and BUG-1746 cover the related
theme of required fields being undiscoverable in the admin console.

## Resolution

**Fixed. All three acceptance criteria are met, and the fix is the dialog's
rather than this field's.**

Criterion 1 was already met before this session: `required: true` on the
`effectiveFrom` quick-create field of **both** leave-policy assignment tabs in
`apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts` — the
Eligibility tab and the Assignments tab, which are separate declarations of the
same relationship. That is what produces the asterisk and
`input.required === true`.

Criteria 2 and 3 are what this session closed, together, by giving the dialog a
gate:

- `apps/web/lib/runtime/quick-create-metadata.ts` — new module.
  `buildSubgridQuickCreate` moved here **unchanged** from
  `module-related-subgrid.tsx`, where nothing could reach it: `apps/web` runs
  its tests in a node environment with no jsdom, so importing that component to
  check what the dialog does is not possible. Alongside it,
  `resolveQuickCreateSubmission` wraps `validateRuntimeForm` and returns either
  `valid` or `blocked` with the per-field errors and a summary. Absent metadata
  returns `valid`, because the panel already renders its own "form metadata is
  not available yet" state and refusing to save would strand it.
- `apps/web/app/components/runtime/module-quick-create-panel.tsx` — both Save
  buttons now go through `handleSave`, which runs the gate before `onSave`. A
  blocked submission sets `fieldErrors`, marks every offending field touched —
  otherwise the renderer holds the error back waiting for a blur that never
  comes — and shows the summary in the dialog's existing `role="alert"` region.
  The renderer already accepted `fieldErrors` and `touchedFields`; they were
  simply never passed.

So the user now reads "Assigned On is required." against the control, before any
request is sent. `effectiveFrom` and `ISO 8601` never reach the screen.

Because the gate belongs to the dialog rather than to this field, it closes the
same hole for **every** required quick-create field in settings, which is the
scope the "To finish it" note asked for.

### Regression coverage

`apps/web/lib/runtime/quick-create-validation.spec.ts`, seven cases, driving the
real path: the subgrid metadata a settings tab declares, the quick-create entity
and form the dialog builds from it, and the gate itself. It asserts the message
the user reads — that the error is `Assigned On is required.` on `effectiveFrom`,
and that nothing shown anywhere contains `effectiveFrom` or `ISO 8601`, which is
the whole of criterion 3 and would pass unnoticed by a test asserting only that
validation ran. It also asserts both leave-policy tabs are found, so relabelling
one cannot silently halve the check, and sweeps every other registry-declared
required quick-create field.

**Mutation-tested.** With `resolveQuickCreateSubmission` forced to return
`valid`, the suite reports 3 failed / 4 passed — both tab cases and the
class sweep fail, the controls pass. The one thing no node-environment test can
reach is the two-line wiring inside the panel component; `tsc` covers its shape,
and the gate it calls is covered here.

## QA Retest

Not performed live. This task did not touch `main`, so nothing here is verified
in production.

The retest is the Reproduction section: open the Assignments dialog, confirm
"Assigned On" carries the required marker and `input.required === true`, then
Save & Close with it empty. Expect the dialog to stay open showing
"Assigned On is required." against the control and a count in the alert region,
with **no** network request made — check the network panel, because a visible
message over a request that still went out is the state this record was in
before. Repeat on the Eligibility tab, which is the second declaration of the
same relationship.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — same dialog, same fix window.
- 2026-08-29 — partially fixed in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`: `effectiveFrom` is now `required: true` on both leave-policy assignment tabs. Status OPEN to IN_PROGRESS, not FIXED — the quick-create dialog runs no client-side validation, so the field is marked required but nothing blocks an empty submission and the raw DTO message still reaches the user. **Not deployed** — production runs `main` at `949f461c`.
- 2026-08-29 — **fixed** in SESSION-0076 on `agent/bugfix-leave`. Criteria 2 and 3 closed by giving the quick-create dialog a validation gate rather than by changing this field again: `resolveQuickCreateSubmission` runs before `onSave`, and the panel passes `fieldErrors` and `touchedFields` the renderer already accepted. `buildSubgridQuickCreate` moved to `lib/runtime/quick-create-metadata.ts` unchanged so the behaviour could be tested at all. Covered by `quick-create-validation.spec.ts`, mutation-tested at 3 failed / 4 passed with the gate neutered. Status IN_PROGRESS to FIXED.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-333 (see the regression register)

<!-- GRAPH:END -->
