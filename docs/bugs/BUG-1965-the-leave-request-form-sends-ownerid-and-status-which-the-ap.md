---
ID: BUG-1965
aliases: [BUG-1965]
Title: The leave request form sends ownerId and status, which the API rejects as forbidden properties
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-332
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1965 — The leave request form sends ownerId and status, which the API rejects as forbidden properties

## Summary

The new-leave-request form serialised its "Record Status" widget — owner and
status — into the request body. `SubmitLeaveRequestDto` whitelists neither field
(this record originally named it `CreateLeaveRequestDto`; the class is
`SubmitLeaveRequestDto`) and the global `ValidationPipe` runs with
`forbidNonWhitelisted: true`, so the whole request was rejected. No employee
could submit a leave request through the UI.

**Fixed.** Both fields are read-only on `leaveRuntimeSpec`, the payload
assertion is in place, and the fourth acceptance criterion — the other create
forms that render the same widget — is now closed by a sweep that found and
fixed one more instance. See Resolution.

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
- **`status`** was writable on `leaveRuntimeSpec` while
  `apps/web/app/(authenticated)/leaves/new/page.tsx` seeded the draft with
  `record={{ status: "PENDING" }}` literally, which is why marking only
  `ownerId` was half a fix. **Fixed** — `standard-module-specs.ts:1129-1148` now
  carries `isReadOnly: true`. The seed stays; it is display state for the
  record-status header, and read-only keeps the value out of the body anyway.

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

That wider assertion now exists:
`apps/web/lib/runtime/modules/record-status-create-payload.spec.ts` runs the same
kind of check over every `StandardModuleRuntimeSpec`, and it did find another
module sending an owner. See Resolution.

The fourth acceptance criterion is now closed too — see Resolution.
REG-332 covers both specs: `leave-create-payload.spec.ts` for the payload and
`record-status-create-payload.spec.ts` for the widget class.

## Dependencies

None. BUG-1966 (the silent failure) is independent and must be fixed too.

## Related Items

BUG-1966 is the silent-failure half of the same observation. BUG-1743 (customers
and partners cannot be edited: the runtime form echoes fields the update DTO
forbids) and BUG-0220 are the same class of defect in the Platform Admin runtime,
both VERIFIED — this is the tenant product's runtime and the create path.
BUG-1967 and BUG-1968 block the same journey further down.

## Resolution

**Fixed.** Both halves of the payload defect are on `develop`, and the widget
class the record left open has been swept.

### The payload

Marking `ownerId` read-only on `leaveRuntimeSpec` was half a fix, as this record
recorded; the other half — `status` — landed with it before this session picked
the record up. Verified in the tree at `1c711dff`:
`apps/web/lib/runtime/modules/standard-module-specs.ts:1106-1113` carries
`isOwner: true, isReadOnly: true` and `:1129-1148` carries
`isStatus: true, isReadOnly: true`, each with the comment naming
`SubmitLeaveRequestDto`. So `sanitizeStandardMutationValues`
(`standard-module-data.adapter.ts:809-833`) treats neither as writable, and
neither survives into the create body regardless of the draft `/leaves/new`
seeds.

`record={{ status: "PENDING" }}` on the create page was left in place
deliberately, for the reason the "To finish it" note allowed: it is display
state for the record-status header before the record exists, and read-only on
the field keeps it out of the body either way.

### The fourth acceptance criterion

The record's own words: "Other create forms rendering the record-status widget
are checked and covered." That is now a test rather than an inspection.

`apps/web/lib/runtime/modules/record-status-create-payload.spec.ts` sweeps
**every** exported `StandardModuleRuntimeSpec`, drives the real adapter's
`create()` with a draft carrying an owner under the spec's own `ownerField` and
under both spellings the widget has used, and asserts the request body carries
none of them. `AGENTS.md` lists `createdById` beside `tenantId` and `id` among
the fields a client must never set, so the invariant is not leave-specific. The
sweep guards itself with a count assertion, because an empty or halved spec list
would make every case vacuous while still reporting green.

It found one more instance. `attendanceRuntimeSpec` declared `ownerId` with
`isOwner: true` and no `isReadOnly`, and no attendance DTO whitelists `ownerId`
— so a runtime create there would have been rejected exactly as the leave one
was. Fixed at `standard-module-specs.ts:1327-1339`. Attendance's `/attendance/new`
page uses a bespoke `ManualAttendanceForm` rather than the runtime record page,
which is why nobody had hit it; the latent defect is closed anyway.

Every other spec already passed: `customerRuntimeSpec` and `projectRuntimeSpec`
mark their `createdById` owner field read-only, and the remaining specs declare
no owner field at all.

`status` was not swept the same way. It reaches a create body only when a page
seeds it into the draft, and `/leaves/new` is the only one that does — asserting
its absence everywhere would have forced read-only onto status fields that edit
forms legitimately write.

### Regression coverage

- `apps/web/lib/runtime/modules/leave-create-payload.spec.ts` — unchanged, two
  cases, asserting the request body.
- `apps/web/lib/runtime/modules/record-status-create-payload.spec.ts` — new, the
  class assertion above. It fails against the tree as it stood: eleven specs
  pass and `attendanceRuntimeSpec` fails, which is how the sibling was found.

Against the acceptance criteria: 1 and 2 met by the read-only flags and the
payload spec, 3 unchanged (the DTO still declares only its five fields, so it
still rejects both), 4 met by the sweep.

The register entry is REG-332, drafted in `docs/qa/regressions/_incoming/leave.md`
for central merge into the register.

## QA Retest

Not performed live. This task did not touch `main`, so nothing here is verified
in production.

The retest is the Reproduction section with the acceptance criteria as written —
in particular that the request body contains neither `ownerId` nor `status`,
read in the network panel rather than inferred from the request succeeding. Add
one step for the sibling: a runtime-driven attendance create, if one is ever
routed through `StandardModuleRecordPage`, must not carry `ownerId` either.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — release blocker; small fix.
- 2026-08-29 — **partially fixed** in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`. `ownerId` is now read-only on `leaveRuntimeSpec`; `status` is not, and `/leaves/new` still seeds `record={{ status: "PENDING" }}`, so the create body still carries it and the API still answers 400. Status OPEN to IN_PROGRESS, not FIXED. Root Cause rewritten from "not established" to the two sources feeding `sanitizeStandardMutationValues`, and the receiving DTO corrected from `CreateLeaveRequestDto` to `SubmitLeaveRequestDto`. Established by reading the code at `d3ffb3aa`, not by a live request — production does not contain either half of the fix.
- 2026-08-29 — **fixed** in SESSION-0076 on `agent/bugfix-leave`. The payload half was already complete on `develop` at `1c711dff` — both `ownerId` and `status` read-only on `leaveRuntimeSpec`, with the body assertion in place — so this session closed the fourth acceptance criterion instead: a sweep over every `StandardModuleRuntimeSpec` now asserts no owner field reaches a create body, and it found `attendanceRuntimeSpec` sending `ownerId`, which is fixed. Status IN_PROGRESS to FIXED.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-332 (see the regression register)

<!-- GRAPH:END -->
