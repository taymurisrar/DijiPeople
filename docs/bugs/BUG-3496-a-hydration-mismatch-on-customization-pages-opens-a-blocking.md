---
ID: BUG-3496
aliases: [BUG-3496]
Title: A hydration mismatch on Customization pages opens a blocking raw React error modal and logs a 500
Status: FIXED
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
RegressionId: REG-486
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: [docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md, apps/web/app/components/errors/runtime-error-classification.ts, apps/web/app/components/errors/error-provider.tsx, apps/web/app/(authenticated)/settings/customization/_components/publish-center.tsx, apps/web/app/(authenticated)/settings/customization/_components/packages-list.tsx, apps/web/app/(authenticated)/settings/customization/_components/package-detail-shell.tsx]
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

Established during TASK-0031 WP-01 (line numbers at `88f33c6e`):

- **Mismatch.** `publish-center.tsx:576`, `packages-list.tsx:718` and
  `package-detail-shell.tsx:1274` formatted dates during render with
  `new Intl.DateTimeFormat(undefined, …)`: the server's locale and timezone
  during SSR, the browser's after hydration. That is the pattern documented in
  `apps/web/app/components/filters/use-formatting-context.ts`. The module detail
  page shows metadata tables whose Modified column went through the same kind of
  render-time formatting (`tables-list.tsx:557` used a fixed `"en"` locale but the
  runtime default timezone). The module detail source was identified by code
  reading, not by a development-build reproduction.
- **Modal and false 500.** `apps/web/app/components/errors/error-provider.tsx:58-75`
  sent every window error, recoverable hydration errors included, to the blocking
  modal and to `persistClientError` as a 500.

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

REG-486, QA scenario QA-SETTINGS-025:
`apps/web/app/components/errors/runtime-error-classification.spec.ts` — hydration
errors are ignored, an ordinary runtime error is still reported, and a
non-hydration minified React error is reported with a plain message.
Mutation-checked: hydration errors no longer ignored fails 6 tests.

The classifier is tested as a pure function rather than through
`ErrorProvider`'s event listeners. No render test for the mismatching component
exists: the source was fixed by moving every Customization date onto the explicit
formatting context, and the browser scenario compares server and hydrated dates.

As filed, the record required:

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

Fixed in TASK-0031 WP-01 (commit 811a915c on `agent/walkthrough2-customization`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0045). Both composed
defects were addressed.

- **Mismatch source.** Every Customization date now renders through
  `useFormattingContext()` with `formatDate`/`formatDateTime` from
  `lib/formatting-context.ts`: Publish Center, packages list, package detail and
  modules list. No `Intl.DateTimeFormat(undefined` remains under
  `settings/customization`.
- **Interceptor.** `apps/web/app/components/errors/runtime-error-classification.ts`
  (`classifyRuntimeError`) ignores React hydration errors (#418, #419, #422,
  #423, #425 and their development messages): no modal, nothing persisted. Other
  minified React errors are shown and logged with a plain message instead of
  React's text; ResizeObserver noise and aborts stay ignored.
  `error-provider.tsx` routes window `error` and `unhandledrejection` through it.

The module detail page's mismatch source was identified by code reading
(`tables-list.tsx` formatted with a fixed locale but the runtime default
timezone), not by a development-build reproduction. If #418 still appears there
in the browser, the classifier keeps it silent and the remaining source must be
found with a development build.

## QA Retest

Pending — browser verification on a throwaway database and on production in
TASK-0031 WP-07/WP-08. Scenario QA-SETTINGS-025:

1. Load `/settings/customization/tables/<key>` and
   `/settings/customization/publish-center` with the console open: no React
   #418, no error modal, no `POST /api/error-logs/client`.
2. Compare server HTML and hydrated DOM dates on the packages list and Publish
   Center: identical.
3. Force an ordinary runtime `TypeError`: the modal still opens and it is logged.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-01; unit-tested; browser verification pending.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Implementation — [[EXECPLAN-0045-customization-end-to-end-for-permission-holders]]
- Regression — REG-486 (see the regression register)

<!-- GRAPH:END -->
