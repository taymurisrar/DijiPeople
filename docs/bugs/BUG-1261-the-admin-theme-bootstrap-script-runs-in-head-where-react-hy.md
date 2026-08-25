---
ID: BUG-1261
aliases: [BUG-1261]
Title: The admin theme bootstrap script runs in head where React hydrates it against extension-injected scripts
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [apps/admin]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-251
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-theme-bootstrap-hydration
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
---

# BUG-1261 — The admin theme bootstrap script runs in head where React hydrates it against extension-injected scripts

## Summary

The console's theme bootstrap script — the inline script added by [[BUG-0495]]
so the page paints in the operator's theme rather than flashing light — was
placed inside an explicit `<head>` element in the admin root layout. React
reconciles `<head>` child by child, and browser extensions insert scripts of
their own at the top of `<head>` before React loads. React therefore hydrated
our inline bootstrap against the extension's `<script src="chrome-extension://…">`
and reported a hydration mismatch on the console in every full page load, for
every operator with such an extension installed.

## Expected Behavior

The console loads without a hydration error, whatever extensions the operator's
browser has, and still paints in their theme on the first frame.

## Actual Behavior

Every full load logged:

> A tree hydrated but some attributes of the server rendered HTML didn't match
> the client properties. This won't be patched up.

with a diff naming the bootstrap script:

```
  __html: "(function(){try{ var m=document.cookie.match(…"    ← server
  __html: ""                                                  ← client
  id="admin-theme-bootstrap"                                  ← server
  src="chrome-extension://lgblnfidahcdcjddiepkckcfdhpknnjh/…" ← client
```

The `src` is the tell: the node React hydrated onto was not ours.

## Reproduction

1. Install any extension that injects a content script into `<head>` — the one
   in the report is `lgblnfidahcdcjddiepkckcfdhpknnjh`.
2. Load any admin console page, e.g. `/login`.
3. Read the browser console.

Reproduced without a real extension by inserting an equivalent node at
`document_start`, which is what an extension does:

```js
await page.addInitScript(() => {
  const s = document.createElement("script");
  s.src = "chrome-extension://lgblnfidahcdcjddiepkckcfdhpknnjh/content/popups-script.js";
  document.head.insertBefore(s, document.head.firstChild);
});
```

## Evidence

- `apps/admin/app/layout.tsx:61-71` at `42435d59` — the `<head>` element and the
  inline `<script id="admin-theme-bootstrap">` inside it.
- Controlled A/B against `apps/admin` on `next dev --webpack` at port 3102, same
  server, same injected node, layout toggled between the two placements:
  - script in `<head>` → console error, one hydration message,
    `document.getElementById("admin-theme-bootstrap").parentElement.tagName === "HEAD"`,
    `document.head.firstElementChild` is the extension's script.
  - script first in `<body>` → no hydration message,
    `parentElement.tagName === "BODY"`, `document.head.firstElementChild` still
    the extension's script.
- With `dp-admin-theme=dark` set, the fixed layout resolves
  `data-admin-scheme="dark"`, `data-admin-theme="dark"` and paints
  `background-color: rgb(11, 18, 32)` — the dark token, not a light flash. The
  fix does not cost what [[BUG-0495]] bought.
- `apps/web/app/layout.tsx` — the same bootstrap, already outside `<head>`, with
  a comment stating this exact reason.

## Root Cause

Two decisions that are each correct on their own.

The script must be inline and blocking, because it resolves
`prefers-color-scheme` before the first paint and anything deferred runs after
the paint it exists to precede. That is settled and unchanged.

*Where* it goes is a separate question, and `<head>` is the intuitive answer and
the wrong one. React hydrates `<head>` positionally, Next owns most of what is in
it, and extensions write into it before React runs — so an inline script there is
matched against whatever the extension left in that slot. Nothing about the
script is wrong; its neighbours are not ours.

The deciding detail is that this was already known. `apps/web` hit it first and
its layout carries the reason in a comment — "browser extensions inject their own
scripts there, which React then tries to reconcile against ours and reports as a
hydration mismatch". The admin implementation was written later and put the
script in `<head>` anyway. **A comment in one app is not a constraint on
another.**

## Impact

Console noise on every full page load of the platform admin console, for anyone
running a `<head>`-injecting extension — which is most people. No functional
impact: the script has already executed during document parse by the time React
hydrates, so the theme is applied correctly either way. The cost is a recurring
red error that trains operators and engineers to ignore the console, and that
hides a real hydration mismatch behind a known-noisy one.

## Affected Areas

- `apps/admin/app/layout.tsx` — the root layout, so every console screen.
- No API, no schema, no permission surface.

## Proposed Resolution

Move the inline bootstrap out of `<head>` and make it the first child of
`<body>`, as `apps/web` already does. It still precedes the first paint, because
nothing below it has been parsed when it runs. Drop the now-empty explicit
`<head>` element and let Next own the head, and assert the placement in
`console-theme-bootstrap.spec.ts` so the rule stops being a comment in a
different app. No ExecPlan needed.

## Acceptance Criteria

- A full load of an admin page with a `<head>`-injecting extension present logs
  no hydration mismatch.
- `document.getElementById("admin-theme-bootstrap").parentElement` is `<body>`,
  and the script is the first element in it.
- With the theme cookie set to `dark`, the document carries
  `data-admin-scheme="dark"` and the body paints from the dark token.
- The spec fails if the script is moved back into `<head>`.

## Regression Coverage

REG-251 — `apps/admin/lib/console-theme-bootstrap.spec.ts`. Two of its ten cases
fail when the script is put back in `<head>`; the mutation was executed, not
argued.

## Dependencies

None.

## Related Items

- [[BUG-0495]] — put this script in the console in the first place; this bug is
  about where it was put, not whether it should exist.
- [`divergent-duplicate-guard`](../qa/known-bug-patterns/divergent-duplicate-guard.md)
  — the class this belongs to: two copies of one decision, one of which was
  never told what the other learned.

## Resolution

`agent/admin-theme-bootstrap-hydration`. The inline bootstrap is the first child
of `<body>`; the explicit `<head>` element is gone; `<body>` gained
`suppressHydrationWarning`, because extensions stamp their own attributes there
too and a warning the app cannot act on is a warning it learns to ignore. The
spec now asserts the placement and the body suppression.

## QA Retest

Verified in-browser during the fix, on a real Chromium with an injected
`chrome-extension://` script node, both before and after the change on the same
running server. `npm --workspace admin run test` — 30 suites, 241 tests, all
passing.

## History

- 2026-08-25 — created from user report at `42435d59`.
- 2026-08-25 — root cause established, fixed on
  `agent/admin-theme-bootstrap-hydration`, reproduced and verified in a browser,
  REG-251 recorded.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-251 (see the regression register)

<!-- GRAPH:END -->
