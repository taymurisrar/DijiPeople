---
ID: BUG-1966
aliases: [BUG-1966]
Title: A failed save in the runtime form is swallowed with no message, toast or inline error
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-307
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1966 — A failed save in the runtime form is swallowed with no message, toast or inline error

## Summary

A save that fails with an HTTP 400 produces nothing on screen. No toast, no
banner, no inline field error, no change of state — the page simply stays where
it was. The only evidence the request happened at all is a console entry and a
network row. A user cannot tell a failed save from a slow one, or from a button
that does nothing.

This is the generic half of the leave-request observation in BUG-1965: that
record covers the bad payload, this one covers the runtime form layer discarding
the failure. It is filed separately because the swallow is not specific to leave
and is arguably the worse of the two.

## Expected Behavior

Every failed save tells the user it failed, in the terms of the screen, and the
form stays populated so the user can correct and retry. `AGENTS.md` requires
loading, error and empty states for every data surface; a save is a data surface.

## Actual Behavior

After pressing Save on `/leaves/new` with a payload the API rejects with 400:

- the page stays on `/leaves/new`;
- `main` contains **zero** `[role=alert]` nodes and no error nodes of any kind —
  verified in the live DOM;
- no toast is rendered;
- no field is marked invalid;
- the only trace is the console 400 and the network entry.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace as an employee with an employee record.
2. Open `/leaves/new`, fill in leave type, start date, end date and reason.
3. Save. The request fails 400 with
   `property ownerId should not exist, property status should not exist`
   (see BUG-1965).
4. Inspect the DOM: no `[role=alert]`, no error text anywhere in `main`.
5. Nothing distinguishes this from a successful save except that the page did not
   navigate.

Any 400 from this form reproduces it; the payload defect in BUG-1965 is simply
the one that was available.

## Evidence

The live DOM check above (`main` contains no `[role=alert]` or error nodes after
the failed save), together with the console 400 and network entry, on the
production tenant workspace.

No file:line evidence was collected for the form's submit handler at filing time;
it should be located before the fix, since the point of this record is that the
handler discards the rejection.

**Located.** It is
`apps/web/app/components/runtime/module-runtime-command-handler.tsx:310`, and the
handler does not discard the rejection — it suppresses the dialog that would have
shown it. See Root Cause.

## Root Cause

**Established.** The submit path did not discard the rejection — it deliberately
suppressed the surface that would have shown it.

`ModuleRuntimeCommandHandler` (`apps/web/app/components/runtime/module-runtime-command-handler.tsx`)
routed a failed command to the runtime's technical error dialog **only** when the
failure carried no field-level errors:

```ts
if (result.status === "failure" && !hasFieldValidationErrors(result.data)) {
```

The reasoning is sound and is why it survived review: a field error belongs
against its own control, not in a modal. It is only safe while the form renders
a control for every field the server can name, and nothing checked that. The
leave request was rejected with `details.fields: [{field: "ownerId"},
{field: "status"}]`; both live in the record-status header and appear in no form
section, so the inline path had nothing to draw and the dialog had already been
turned off. Neither surface rendered, and the save failed in silence.

This is the `silent-degradation` class: the interface reverted to a weaker
version of itself — here, to nothing — on an assumption that was never tested.

## Impact

Severe out of proportion to its simplicity: any save that fails for any reason —
validation, authorization, a network error — is invisible. The user believes the
system is unresponsive, retries, and produces duplicate attempts or abandons the
journey. It also hides other defects from QA and from support, because the only
symptom reaching the user is "nothing happens".

Rated HIGH: it affects every runtime form in the tenant product, and it converts
every recoverable failure into an unexplained dead end.

## Affected Areas

`apps/web` metadata form runtime submit handling — every module rendered through
the runtime, not only leave.

## Proposed Resolution

Make the runtime form's submit path surface every rejection: an accessible,
announced error region (`role="alert"`), field-level reasons attached to their
inputs where the contract supplies them, and the form's values preserved. Fix it
in the shared runtime so every module inherits it, and pair it with BUG-1963 so
the message shown is the contract's `description` rather than its raw `message`.

## Acceptance Criteria

- A save rejected with 400 renders a visible, announced error on the form.
- The form retains the user's input after the failure.
- The error is discoverable by a screen reader (`role="alert"` or an equivalent
  live region).
- The behaviour holds for a network failure and a 500, not only a validation 400.

## Regression Coverage

REG-307 — `apps/web/lib/runtime/command-failure-visibility.spec.ts`, six cases,
promoted as QA-RUNTIME-018.

The spec pins both directions of the decision: `false` for the exact production
payload against the real leave form, `true` when any named field is on the form,
`true` for both supported error shapes, and `false` when there are no field
errors or no active form at all. Under the predicate it replaced, the first case
returned `true` — that inversion is the proof.

The coverage is unit-level and deliberately narrow. A component test that mounts
the form, stubs a rejected save and asserts an announced `role="alert"` with the
values preserved is still missing, and is what the remaining acceptance criteria
need.

## Dependencies

None. BUG-1965 is the payload defect that exposed this and is independent.

## Related Items

BUG-1965 (the bad payload on the same save) and BUG-1963 (raw server message and
endpoint shown when a dialog *does* render an error). BUG-1422 is the Platform
Admin runtime's analogue, where the server sent no field reasons; here the client
discards a message it was given.

## Resolution

Fixed on branch `agent/starter-blocker-fixes`, commit `the SESSION-0072 fix commit` — on that branch only, not yet on `develop` or `main`.

The suppression condition now asks whether the errors will actually be seen
rather than whether they exist. A new pure module,
`apps/web/lib/runtime/command-failure-visibility.ts`, exports
`fieldValidationErrorsAreVisible(data, form)`, which reads the named fields from
either supported error shape — the array form the API contract emits and the map
form, at the root and under `details` — and returns true only when at least one
of them is rendered by a section of the active form.
`module-runtime-command-handler.tsx` calls it in place of
`hasFieldValidationErrors`, so the dialog is withheld only when something inline
can take its place.

Files changed: `apps/web/lib/runtime/command-failure-visibility.ts` (new),
`apps/web/app/components/runtime/module-runtime-command-handler.tsx`,
`apps/web/lib/runtime/command-failure-visibility.spec.ts` (new).

Two of the four acceptance criteria are met by construction — a failure with
nothing renderable now reaches the dialog, and a plain failure or a 500 was
never suppressed in the first place, since neither carries field errors. The
other two — that the error is announced through `role="alert"` and that the
form retains the user's input — are properties of the dialog and the form, not
of this decision, and neither is asserted by a test yet. They are the reason
this record is `FIXED` rather than `VERIFIED`.

## QA Retest

Not yet performed, and it cannot be performed today: the fix is not on `develop`
and production runs `main` at `949f461c`, which does not contain it. This task
did not touch `main`, so **nothing here is verified in production** and the
demo tenant still reproduces the silent failure exactly as recorded above.

Live verification on the demo tenant is pending a release. When it happens, the
retest is the Reproduction section, with one correction to the expectation: the
leave request will still be rejected, because BUG-1965 is only half fixed and
`status` is still serialised into the create body. The correct outcome after
this fix is a **visible** 400, not a successful save. Check that `main` contains
`[role=alert]`, that the message names the failure, and that leave type, dates
and reason are still populated.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Split from the leave-request payload finding because the swallow is generic to the runtime form layer.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — release blocker and generic to the whole runtime form layer; arguably the highest-leverage single fix in this batch.
- 2026-08-29 — fixed in SESSION-0072 at `the SESSION-0072 fix commit` on `agent/starter-blocker-fixes`, on `agent/starter-blocker-fixes`. Root Cause rewritten from "not established" to the suppression condition in `module-runtime-command-handler.tsx`; Status OPEN to FIXED; RegressionId REG-307; QA-RUNTIME-018 promoted. Specs re-run locally at `the SESSION-0072 fix commit`: 6 cases, all passing. **Not deployed** — production runs `main` at `949f461c` and this task did not touch `main`, so the record is FIXED and not VERIFIED.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-307 (see the regression register)

<!-- GRAPH:END -->
