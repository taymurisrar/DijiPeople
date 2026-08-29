---
ID: BUG-1965
aliases: [BUG-1965]
Title: The leave request form sends ownerId and status, which the API rejects as forbidden properties
Status: OPEN
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
status — into the request body. `CreateLeaveRequestDto` whitelists neither field
and the global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so the
whole request is rejected. No employee can submit a leave request through the UI.

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

No file:line evidence was collected for the form's payload assembly or for
`CreateLeaveRequestDto`; both should be located before the fix.

## Root Cause

Not established in code. The observable mechanism is that the runtime form
includes its record-status widget's bound values (owner and status) in the create
payload, and the create DTO does not declare them.

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

None yet. An e2e test that submits the leave request form would fail today, and a
unit test asserting the create payload's key set would pin it.

## Dependencies

None. BUG-1966 (the silent failure) is independent and must be fixed too.

## Related Items

BUG-1966 is the silent-failure half of the same observation. BUG-1743 (customers
and partners cannot be edited: the runtime form echoes fields the update DTO
forbids) and BUG-0220 are the same class of defect in the Platform Admin runtime,
both VERIFIED — this is the tenant product's runtime and the create path.
BUG-1967 and BUG-1968 block the same journey further down.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — release blocker; small fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
