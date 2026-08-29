---
ID: BUG-1963
aliases: [BUG-1963]
Title: Runtime dialogs show the end user the raw server message and the HTTP method and path
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1963 — Runtime dialogs show the end user the raw server message and the HTTP method and path

## Summary

When a save fails, the tenant product's runtime dialog renders the API's
developer-facing `message` with the HTTP method and endpoint path appended. A
customer sees DTO property names and internal route shapes. The standard error
contract carries a `description` field written for exactly this audience, and a
`fieldErrors` structure for putting reasons on the inputs they belong to; the
dialog uses neither.

## Expected Behavior

The dialog shows the contract's `description` — for a validation failure, "Review
the highlighted fields and submit again." — and maps each field-level reason onto
the input it concerns. Method, path and property names stay in the console and
the error log.

## Actual Behavior

Verbatim, in the dialog body:

```
leavePolicyId must be a UUID (POST /api/leave-policies/assignments)
```

and, before "Assigned On" was filled in:

```
leavePolicyId must be a UUID, effectiveFrom must be a valid ISO 8601 date string
(POST /api/leave-policies/assignments)
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Settings > People Configuration > Leave Configuration > Leave Policies, open a
   policy.
2. Assignments tab > New > Scope Type = Tenant > Save & Close.
3. Read the dialog: it shows the strings above, including the method and path.

Any runtime dialog whose save returns a validation failure will do; this is the
one the QA run had in front of it.

## Evidence

The verbatim dialog text above, captured on the production tenant workspace.

`AGENTS.md` documents the contract the dialog is ignoring: `HttpExceptionFilter`
renders `success`, `traceId`, `statusCode`, `errorCode`, `message`,
`description`, `fieldErrors`, `support`. The dialog is showing `message` plus the
endpoint rather than `description`, and is not mapping the field-level reasons
onto individual inputs.

No file:line evidence was collected for the dialog's error rendering; it should be
located before the fix.

## Root Cause

Not established.

## Impact

Customer-facing exposure of internal contract detail — property names and route
paths — and an unactionable message: the user is told a field they cannot see is
invalid. Rated MEDIUM: it is a UX defect with a minor information-disclosure
element, not an authorization or data defect. Nothing secret is leaked; the route
shape is already visible to anyone reading network traffic.

## Affected Areas

`apps/web` metadata runtime dialogs and their error rendering — every module the
runtime serves, not only leave.

## Proposed Resolution

Render `description` as the dialog's message, attach `fieldErrors` entries to the
matching inputs, and keep `message`, `traceId`, method and path for the console
and the error log. Fixing it in the shared runtime covers every module at once.

## Acceptance Criteria

- A failed runtime save shows the contract's `description`, not its `message`.
- No HTTP method or endpoint path appears in text the user reads.
- Field-level reasons appear against their inputs.
- The `traceId` remains available to support, in the log if not on screen.

## Regression Coverage

None yet.

## Dependencies

None identified.

## Related Items

BUG-1422 (runtime form validation discards every field reason and shows the user
"Bad Request Exception") is the Platform Admin runtime's version, VERIFIED, and
was a server-side omission; BUG-1549 (database and validator internals surfaced
in user-facing errors) is the admin console's error modal. This record is the
tenant product's runtime dialog and a client-side rendering choice — same theme,
different app and different layer.

## Resolution

Fixed on `agent/bugfix-webux` (commit `fdce2fea`), in the shared layer rather
than on the dialog, so every module the runtime serves is covered at once.

**Where the method and path came from.**
`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:640` threw
``new Error(`${message} (${init?.method ?? "GET"} ${path})`)``, and
`apps/web/lib/runtime/command-execution.service.ts:101` puts a caught handler's
`error.message` straight into the command result, which the record page then
renders. That is the whole of
`leavePolicyId must be a UUID (POST /api/leave-policies/assignments)`. The
adapter now throws the server's message alone; the method and the path stay on
`error.data`, which is what the error log and the downloadable report already
carry, and are written to `console.warn` at the point of failure.

**Where the DTO property name came from.**
The dialog rendered the contract's `message`, which is the developer-facing
half. `resolveUserFacingMessage` in `apps/web/lib/api-error.ts` now decides:
the contract's `description` for a validation failure or whenever field-level
reasons are present, and `message` otherwise — a domain refusal such as
"An attendance entry already exists for this employee on this date." is more
use to the reader than a generic sentence, and telling those two cases apart is
what the contract's two fields are for.

Changed:

- `apps/web/lib/api-error.ts` — `sanitizeUserFacingMessage` (strips a trailing
  method+path, refuses markup and over-long strings) and
  `resolveUserFacingMessage`; both applied inside `normalizeApiError`.
- `apps/web/lib/runtime/command-failure-message.ts` — new; one reader for the
  failure contract, shared by the command handler and the record page.
- `apps/web/app/components/errors/error-modal.tsx:34` — the headline is the
  resolved user-facing message; `formatFieldMessages` now also reads root-level
  `fieldErrors`, which it never did, and humanises the property name.
- `apps/web/app/components/runtime/module-record-page.tsx:441` — the toast on a
  failed save carries the description, not the raw message.
- `apps/web/app/components/runtime/module-runtime-command-handler.tsx` —
  `readCommandFailureError` delegates to the shared reader.

The `traceId` is untouched on every path: it is the only thing joining a
customer's screenshot to a log row.

Covered by `apps/web/lib/api-error.spec.ts` — 13 cases, including that no
resolved message contains `/api/` or a DTO property name for a validation
failure.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — use the description field the error contract already provides.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
