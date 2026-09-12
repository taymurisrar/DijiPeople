---
ID: BUG-3496
aliases: [BUG-3496]
Title: A hydration mismatch on Customization pages opens a blocking raw React error modal and logs a 500
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, error-logs]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3496 — A hydration mismatch on Customization pages opens a blocking raw React error modal and logs a 500

## Summary

On the Customization module detail page and on Publish Center, the browser
raises React error #418: text rendered on the server does not match the client
render. The tenant app's global client error handler treats this recoverable
warning as a fatal error. It covers the page with a full-screen modal showing
"ERROR SYSTEM_UNEXPECTED_ERROR" and the raw minified React message, and posts a
SYSTEM_UNEXPECTED_ERROR / 500 row to the production client error log. This
happens on every load of those pages.

Two defects compose here: a hydration mismatch whose source is not yet
identified, and an interceptor that turns it into a blocking modal and a false
500.

## Expected Behavior

Customization pages render the same text on the server and the client, so no
hydration error occurs. Independently, a recoverable hydration warning is not
presented as a blocking system error and is not logged as a 500.

## Actual Behavior

- A full-screen modal reads "ERROR SYSTEM_UNEXPECTED_ERROR / Minified React
  error #418; visit https://react.dev/errors/418…" and blocks interaction until
  dismissed.
- Each load writes one SYSTEM_UNEXPECTED_ERROR row with status 500 to the client
  error log. About 15 such rows were written during this walkthrough.
- The page underneath does render once the modal is closed.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner.
2. Open a Customization module detail page, for example
   `/settings/customization/tables/qaAsset`.
3. Observe React error #418 in the console, then the full-screen error modal.
4. Observe a POST to the client error log endpoint with SYSTEM_UNEXPECTED_ERROR
   / 500.
5. Repeat on `/settings/customization/publish-center`. You get the same result.

Reproduced on each load on the live demo tenant at `df0f84f1`.

## Evidence

- `apps/web/app/components/errors/error-provider.tsx:58-75` registers
  `window` `error` and `unhandledrejection` listeners.
- `handleRuntimeError` (lines 59-62) forwards every runtime error to
  `showError`, except `ResizeObserver loop`.
- `showError` (lines 36-46) normalises the error, sets it as the displayed
  modal (`ErrorModal`, line 82), and calls `persistClientError`, from
  `apps/web/app/components/errors/client-error-log.ts`.
- Recoverable hydration errors reach that path unfiltered, which matches the
  modal and log row observed.
- The text node that differs between server and client has not been identified.

## Root Cause

## Impact

Administrators hit a blocking, alarming modal with a raw developer message on
every visit to two core Customization pages. The production client error log
fills with false 500s, which hides real failures and misleads anyone triaging
it. Similar hydration warnings on any other page would behave the same way.
Reachable in production.

## Affected Areas

- Web: Customization module detail (`table-detail-shell`) and Publish Center;
  the global `ErrorProvider` and client error logging used across the tenant
  app.
- API: `error-logs`, which receives the false rows.

## Proposed Resolution

- Find and remove the source of the mismatch. Likely candidates are
  locale- or time-dependent formatting rendered in both environments without a
  shared formatting context. Confirm by reproducing with a development build,
  which names the differing text, before recording a cause.
- Separately, have the global runtime error handler classify recoverable React
  hydration errors apart from fatal ones: never show the blocking modal for
  them, and never log them as a 500 SYSTEM_UNEXPECTED_ERROR.

No ExecPlan needed.

## Acceptance Criteria

- Loading `/settings/customization/tables/<tableKey>` and
  `/settings/customization/publish-center` produces no React #418 in the
  console.
- Loading those pages shows no error modal and writes no client error log row.
- A forced hydration mismatch on a test page does not open the blocking modal
  and is not persisted as a SYSTEM_UNEXPECTED_ERROR / 500.
- A genuine uncaught runtime error still opens the modal and is logged.

## Regression Coverage

- A unit test on `ErrorProvider`'s runtime error path. It dispatches a
  hydration-mismatch error event and asserts no modal and no
  `persistClientError` call. It dispatches an ordinary error and asserts both
  still happen. It fails against the current handler.
- A render test for the identified mismatching component, once found, asserting
  identical server and client output.

A REG entry follows once written.

## Dependencies

None.

## Related Items

- [[BUG-3493]]: Publish Center, where this also appears.
- [[BUG-3491]]: access to the pages where this was observed.
- [[ITEM-0184]]: other Customization presentation defects on the same pages.

## Resolution

## QA Retest

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
