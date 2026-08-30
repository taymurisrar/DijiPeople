---
ID: BUG-2464
aliases: [BUG-2464]
Title: Three tenant screens crash the React tree with hydration errors 418 and 441
Status: DUPLICATE
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [web:inbox, web:users, web:approvals]
OwnerAgent: architect
ArchitectDisposition: DUPLICATE
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2464 — Three tenant screens crash the React tree with hydration errors 418 and 441

## Summary

**Closed as a duplicate on the day it was opened.** The production monitoring
queue carries three client-reported React crashes, one occurrence each. All
three were investigated during this triage; none is a new defect. Two already
have records that were fixed the day after the crashes were recorded, and the
third does not reproduce against production today.

The record is kept rather than deleted because the incident rows are still in
the production queue and the next person to triage them deserves to find this
answer rather than repeat the work.

## Expected Behavior

Tenant screens render without React hydration or rendering errors.

## Actual Behavior

Three rows in the queue, all `sourceApp: web`, all one occurrence, all recorded
inside a 45-minute window during the QA sweep of 2026-08-29:

```
2026-08-29T00:36  500  CLIENT /approvals/new  Minified React error #441
2026-08-29T00:45  500  CLIENT /users          Minified React error #441
2026-08-29T01:19  500  CLIENT /inbox          Minified React error #418
```

## Reproduction

Not reproducible. See Evidence.

## Evidence

Each row was matched to an existing record or re-tested:

| Row | Disposition | Evidence |
|---|---|---|
| `/users` #441 | Duplicate of [[BUG-2003]] | *"The tenant Users screen requests an entity the data registry does not have, so it never renders"* — `Status: FIXED`, `ResolvedAt: 2026-08-29` |
| `/approvals/new` #441 | Duplicate of [[BUG-2004]] | *"The approvals module emits a New action for a page that does not exist, and the detail route throws on it"* — `Status: FIXED`, `ResolvedAt: 2026-08-29` |
| `/inbox` #418 | Not reproducible | Re-tested against production on 2026-08-30 — see below |

The `/inbox` re-test, on the live tenant workspace
`https://dijipeople-demo.ws.dijipeople.com/inbox` (API commit `ec1d58d`):

- The page renders fully: five notification rows, pagination reading
  "Showing 1 to 5 of 5 records".
- Timestamps format correctly (`08/29/2026, 1:16 AM`), which is the value a
  `#418` text-content mismatch would have disagreed on.
- **Browser console: 0 errors, 0 warnings.**

The two `#441` rows were recorded by the very QA sweep that produced
[[BUG-2003]] and [[BUG-2004]]; their timestamps sit inside that sweep's window.
The incident rows are the evidence for those records, not separate findings.

## Root Cause

For `/users` and `/approvals/new`, see the root-cause sections of [[BUG-2003]]
and [[BUG-2004]].

For `/inbox`, not established and deliberately not guessed at. The nearest
plausible mechanism was examined and is recorded here as a note rather than a
conclusion: `formatDateTime` reads a module-level mutable global
(`runtimeDefaultContext` in `apps/web/lib/formatting-context.ts:19`) which is
populated by `setDefaultFormattingContext` inside a `useEffect` in the client
component `resolved-settings-provider.tsx:173-176`. A tree that commits the
provider's effect before a suspended child hydrates could render the same
timestamp two different ways. That is a *theory* that the re-test did not
confirm, and no change is being made on the strength of it.

Two things worth carrying forward regardless of this record:

- `runtimeDefaultContext` being a module-level mutable in a multi-tenant app is
  a latent hazard. It is safe today only because the single writer is a client
  effect, so it never holds state on the server. One server-side call would make
  one tenant's formatting leak into another's request.
- A one-occurrence client error with no reproduction is worth exactly one
  re-test and no more. That is what happened here.

## Impact

None outstanding. Two of three were fixed on 2026-08-29; the third does not
reproduce.

## Affected Areas

- `apps/web/app/(authenticated)/inbox/`
- `apps/web/lib/formatting-context.ts` (noted hazard, not changed)

## Proposed Resolution

No action. Closed as `DUPLICATE`.

If a `#418` on `/inbox` recurs, start from the formatting-context theory above
and confirm it with a hydration-error reproduction before changing anything.

## Acceptance Criteria

Not applicable — no fix is being made.

## Regression Coverage

Covered by whatever regressions [[BUG-2003]] and [[BUG-2004]] carry. None added
here.

## Dependencies

None.

## Related Items

[[BUG-2003]], [[BUG-2004]] — the records this duplicates. [[BUG-1557]] — the
earlier React hydration 418, on the admin dashboard, also closed.
[[BUG-2465]] — the triage this came out of.

## Resolution

No code change. Closed `DUPLICATE` on 2026-08-30 after matching two rows to
closed records and re-testing the third against production.

## QA Retest

`/inbox` re-tested on production 2026-08-30 — renders correctly, console clean.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.
- 2026-08-30 — closed as `DUPLICATE` after investigation; no defect remained.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[approvals]]

<!-- GRAPH:END -->
