---
ID: BUG-1965
aliases: [BUG-1965]
Title: The leave request form sends ownerId and status, which the API rejects as forbidden properties
Status: IN_PROGRESS
Severity: HIGH
Priority: P1
Type: BUG
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

# BUG-1965 — The leave request form sends ownerId and status, which the API rejects as forbidden properties

## Summary

The new-leave-request form serialises its "Record Status" widget — owner and
status — into the request body. `SubmitLeaveRequestDto` whitelists neither field
(this record originally named it `CreateLeaveRequestDto`; the class is
`SubmitLeaveRequestDto`) and the global `ValidationPipe` runs with
`forbidNonWhitelisted: true`, so the whole request is rejected. No employee can
submit a leave request through the UI.

**Half fixed as of `d3ffb3aa`.** `ownerId` no longer travels; `status` still
does, so the request is still rejected. See Resolution.

(The absence of any error message on screen is a second, separate defect —
BUG-1966 — because it is generic to the runtime form layer rather than to this
payload.)

## Expected Behavior

The form sends the fields the create DTO declares. Owner and status are the
server's to decide: a leave request is created for the authenticated employee in
the initial state the domain defines, and the client does not get to propose
either — `AGENTS.md` is explicit that the server never trusts a client-sent
approval state, and that a DTO and the frontend payload must change together.

## Actual Behavior

The UI posts:

```json
POST /api/leave-requests
{"ownerId":"e0302ffb-…","leaveTypeId":"…","startDate":"2026-09-07",
 "endDate":"2026-09-09","reason":"…","status":"PENDING"}
```

and the API answers `400`:

```
property ownerId should not exist, property status should not exist
```

Removing those two fields makes the same request pass DTO validation.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace as an employee with an employee record.
2. Open `/leaves/new`.
3. Fill in leave type, start date, end date and reason. The form shows a
   "RECORD STATUS — Pending / Taimur Israr" widget, which is not an input the
   user filled in.
4. Save. The page stays on `/leaves/new`; the network entry shows the request and
   400 response quoted above.
5. Replay the same request without `ownerId` and `status`: DTO validation passes.

## Evidence

The request and response bodies quoted above, captured from the production
tenant workspace.

`AGENTS.md` records the pipe configuration that makes this a 400 rather than a
silently-ignored field: `whitelist: true, transform: true,
forbidNonWhitelisted: true` — "an unknown request field is a 400, so DTO and
frontend payload must change together."

No file:line evidence was collected for the form's payload assembly or for the
create DTO at filing time; both should be located before the fix.

**Located**, and both are in Root Cause. The payload assembly is
`sanitizeStandardMutationValues` (`standard-module-data.adapter.ts:811`) reading
the draft record seeded at `module-record-page.tsx:586`; the DTO is
`SubmitLeaveRequestDto`, not `CreateLeaveRequestDto`. Locating them is what
showed the fix at `d3ffb3aa` to be half a fix.

**Both halves are now in.** `status` carries `isReadOnly: true` on
`leaveRuntimeSpec` alongside `ownerId`, so neither survives
`sanitizeStandardMutationValues` regardless of the draft `/leaves/new` seeds.
See Regression Coverage — the assertion is on the request body, and it was
checked against the half-fix.

## Root Cause

**Established**, and it is two separate sources feeding one filter — which is
why fixing one of them was not enough.

The create body is built by `sanitizeStandardMutationValues`
(`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:811`), which keeps
every declared field that is **not** `isReadOnly` and is present in the submitted
values:

```ts
const writableFields = spec.fields.filter(
  (field) => !field.isReadOnly && field.logicalName !== (spec.primaryIdField ?? "id"),
);
```

The submitted values are the record page's `draftRecord`
(`module-record-page.tsx:586`, read by `readValues` at
`module-adapter-command-handlers.ts:491`), which is seeded from the page's
`record` prop and then edited. So a field reaches the body when it is both
writable on the spec *and* present in the draft.

- **`ownerId`** was writable on `leaveRuntimeSpec` and populated by the
  record-status header. **Fixed** — see Resolution.
- **`status`** is still writable on `leaveRuntimeSpec`
  (`standard-module-specs.ts:1129`, `isStatus: true` with no `isReadOnly`), and
  `apps/web/app/(authenticated)/leaves/new/page.tsx` seeds the draft with
  `record={{ status: "PENDING" }}` literally. **Not fixed.**

The receiving DTO is `SubmitLeaveRequestDto`
(`services/api/src/modules/leave/dto/submit-leave-request.dto.ts`) — note the
name, which this record originally gave as `CreateLeaveRequestDto`. It declares
`leaveTypeId`, `startDate`, `endDate`, `reason` and `attachmentReference`, and
neither `ownerId` nor `status`, so under `forbidNonWhitelisted` either one is a
400 on its own.

## Impact

Release-blocking for the Starter plan: leave is an entitled module and no
employee can submit a request through the product. Combined with BUG-1966 the
user gets no explanation at all, so the failure reads as the button not working.
Rated HIGH — a primary journey is blocked on production for every tenant.

## Affected Areas

`apps/web` leave request create form and the runtime record-status widget;
`services/api/src/modules/leave` create DTO. Any other create form that renders
the same widget is likely to send the same two fields.

## Proposed Resolution

Stop the record-status widget contributing to create payloads — the owner and
status of a new record are server decisions. Then check the other create forms
that render it, because the widget is shared. Do **not** fix this by widening the
DTO to accept `ownerId` and `status`: that would let a client propose its own
approval state, which is the thing the security checklist forbids.

## Acceptance Criteria

- Submitting `/leaves/new` with valid values creates a leave request.
- The request body contains no `ownerId` and no `status`.
- The create DTO still rejects both fields if a client sends them.
- Other create forms rendering the record-status widget are checked and covered.

## Regression Coverage

`apps/web/lib/runtime/modules/leave-create-payload.spec.ts`, two cases.

It drives `createStandardModuleDataAdapter(leaveRuntimeSpec).create()` with a
draft seeded exactly as `/leaves/new` seeds it — the user's four answers plus
`ownerId` from the record-status header and a literal `status: "PENDING"` — and
asserts the **request body**: no `ownerId`, no `status`, and the four real fields
still present.

It was checked against the half-fix rather than assumed to work. With
`isReadOnly` removed from `status` and left on `ownerId`, the suite fails on
`expect(captured!.body).not.toHaveProperty("status")` — which is precisely the
state that shipped in `d3ffb3aa` and read as fixed. A test asserting the spec's
field flags, or one a level above the payload, would have passed there; that is
why the assertion is on the body.

Still outstanding: the fourth acceptance criterion. This covers `leaveRuntimeSpec`
only. A wider version of the same assertion, run over every
`StandardModuleRuntimeSpec` that renders the record-status widget and has a known
create endpoint, would close it — and would say whether any other module is
sending owner or status to a DTO that forbids them.

No regression-register entry yet, which is why this record is `IN_PROGRESS`
rather than `FIXED`: `backlog:check` requires an active REG naming the bug, and
the REG has not been written.

## Dependencies

None. BUG-1966 (the silent failure) is independent and must be fixed too.

## Related Items

BUG-1966 is the silent-failure half of the same observation. BUG-1743 (customers
and partners cannot be edited: the runtime form echoes fields the update DTO
forbids) and BUG-0220 are the same class of defect in the Platform Admin runtime,
both VERIFIED — this is the tenant product's runtime and the create path.
BUG-1967 and BUG-1968 block the same journey further down.

## Resolution

**Partially fixed. This record stays open, and the journey it blocks is still
blocked.**

Commit `d3ffb3aa` on `agent/starter-blocker-fixes` — on that branch only, not yet on `develop` or `main`
marked `ownerId` read-only on `leaveRuntimeSpec`
(`apps/web/lib/runtime/modules/standard-module-specs.ts:1107`), with a comment
explaining that neither owner nor status is the client's to propose. That
removes `ownerId` from the create body.

`status` was **not** changed and is still sent. The comment covers both fields;
the code covers one. Two things have to be true for `status` to stop reaching
the API, and neither is:

1. `status` on `leaveRuntimeSpec` (`standard-module-specs.ts:1129`) carries no
   `isReadOnly: true`, so `sanitizeStandardMutationValues` still treats it as
   writable.
2. `apps/web/app/(authenticated)/leaves/new/page.tsx` still passes
   `record={{ status: "PENDING" }}`, so the value is present in the draft for
   that filter to find.

The consequence is that `POST /api/leave-requests` still carries
`{"status":"PENDING"}` and `SubmitLeaveRequestDto` still rejects it with
`property status should not exist`. The observable symptom on the demo tenant is
unchanged apart from its visibility: BUG-1966's fix, in the same commit, means
the 400 now reaches the error dialog instead of failing in silence. **A visible
400 is not a fixed submission.**

Marking one of two fields read-only and leaving the other is a small instance of
the class this record already names in Related Items — the form and the DTO have
to be reconciled as a set, not field by field.

### To finish it

- Mark `status` `isReadOnly: true` on `leaveRuntimeSpec`, for the reason already
  written in the `ownerId` comment: the status of a leave request belongs to the
  approval workflow.
- Decide what `record={{ status: "PENDING" }}` on the create page is for. If it
  exists only to make the record-status header read "Pending" before the record
  exists, it is display state and should not be in the draft the save serialises;
  read-only on the field is enough to keep it out of the body either way, and the
  seed can stay.
- Add the key-set assertion described under Regression Coverage, and only then
  move this record to `FIXED`.
- The fourth acceptance criterion is still untouched: no other create form
  rendering the record-status widget has been checked, and the widget is shared.

## QA Retest

Not performed, and there is nothing to pass yet. The fix is partial, and it is
also not deployed: production runs `main` at `949f461c`, which contains neither
half, and this task did not touch `main`. **Nothing here is verified in
production.**

When the remaining half lands and a release goes out, the retest is the
Reproduction section with the acceptance criteria as written — in particular
that the request body contains neither `ownerId` nor `status`, checked in the
network panel rather than inferred from the request succeeding.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — release blocker; small fix.
- 2026-08-29 — **partially fixed** in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`. `ownerId` is now read-only on `leaveRuntimeSpec`; `status` is not, and `/leaves/new` still seeds `record={{ status: "PENDING" }}`, so the create body still carries it and the API still answers 400. Status OPEN to IN_PROGRESS, not FIXED. Root Cause rewritten from "not established" to the two sources feeding `sanitizeStandardMutationValues`, and the receiving DTO corrected from `CreateLeaveRequestDto` to `SubmitLeaveRequestDto`. Established by reading the code at `d3ffb3aa`, not by a live request — production does not contain either half of the fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
