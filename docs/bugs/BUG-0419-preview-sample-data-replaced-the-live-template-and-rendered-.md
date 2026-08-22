---
ID: BUG-0419
aliases: [BUG-0419]
Title: Preview sample data replaced the live template and rendered one paint late
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: fb7c771
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-186
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0419 — Preview sample data replaced the live template and rendered one paint late

## Summary

"Preview sample data" substituted example values into the template HTML and fed
the **result back into the editor as its content**, keeping the real template in
a second piece of state to restore on exit. It also rendered the preview from
`editor.getHTML()` read during render, so the first paint after each toggle
showed the previous content.

## Expected Behavior

A preview shows what the document would say. It does not modify what is being
previewed, and it is correct on the first paint.

## Actual Behavior

Reported as "unstable". Two distinct faults:

- **Stale by one paint.** `dangerouslySetInnerHTML={{ __html: editor.getHTML() }}`
  is read during render; the effect that swaps the editor's content runs after
  it. The corrected content appeared only when something unrelated re-rendered.
- **Destructive.** The template survived only as long as the restore path ran.
  Saving while previewing wrote resolved sample values — "Gulf Horizon" in place
  of `{{customer.companyName}}` — into the stored template.

Separately, the substitution used `exampleValue` as a raw string, so the preview
printed `["Employees","Attendance","Payroll"]` where the real document renders a
list. A preview that disagrees with the document is worse than none: it is
checked, believed, and wrong.

## Reproduction

1. Open a contract template in Platform Admin.
2. Press **Preview sample data**, then **Return to editing**, then preview again
   — the first paint of each toggle shows the prior content.
3. Press **Preview sample data** and save without returning to editing.

## Evidence

- `apps/admin/app/_components/documents/contract-template-editor.tsx` —
  `value={previewHtml}` with `editingHtmlBeforePreview` holding the original.
- `apps/admin/app/_components/documents/contract-document-editor.tsx` — the
  `<article>` reading `editor.getHTML()` during render.

## Root Cause

The preview was implemented as a *mode of the editing document* rather than as a
separate rendering of it. Everything else follows: the restore dance exists only
because the live value was overwritten, and the staleness exists only because
the preview had no value of its own to render from.

## Impact

Every template author. The stale paint is cosmetic and constant; the overwrite
is rare and destroys work.

## Affected Areas

`apps/admin` — the contract template editor and the document editor.

## Proposed Resolution

Pass the preview as its own `previewHtml` prop. The editor keeps the true
template at all times, the toggle becomes one boolean with nothing to restore,
and the substitution uses `exampleHtml` from the API — produced by the same
renderer the real document uses.

## Acceptance Criteria

- Toggling the preview repeatedly never changes the stored template.
- Saving while previewing saves the template, not the sample values.
- The first paint after each toggle is correct.
- The preview renders collections, percentages and dates as the document does.

## Regression Coverage

REG-186 — `apps/admin/lib/documents/template-preview.spec.ts`.

## Dependencies

Depends on `exampleHtml` from `/contracts/placeholder-definitions`; falls back
to the raw example against an API that predates it.

## Related Items

[[BUG-0418]] — the formatting the preview must agree with.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Not opened in a browser.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-186 names `apps/admin/lib/documents/template-preview.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, apps/admin   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — reported as "'Preview sample data' is unstable".
