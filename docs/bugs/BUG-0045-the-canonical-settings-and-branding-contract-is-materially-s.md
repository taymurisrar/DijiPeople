---
ID: BUG-0045
aliases: [BUG-0045]
Title: The canonical settings and branding contract is materially stale
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web, docs/architecture]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-208
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0045 — The canonical settings and branding contract is materially stale

## Summary

`docs/architecture/settings-and-branding.md` is declared **canonical** by
`docs/README.md` — it "overrides other documents where they differ". Four of its
substantive claims are now false, including a ~20-row route table describing
URLs that return 404.

## Expected Behavior

The document designated canonical matches the implemented settings runtime,
names only existing shared components and routes, and does not direct permission
fallbacks to a missing page.

## Actual Behavior

Verified at `1af3690`:

1. **`:64-67` lists 10 canonical categories. There are 11** — `integrations` was
   added (`settings-runtime.ts:77-80`) with its own explanatory comment, and the
   entire `/settings/integrations/attendance/**` tree (13 pages) is undocumented.

2. **`:15-16` names shared `Card`, `Badge`, `Tabs`, `Dialog` and `FormControl`
   components. None of the five exists** in `apps/web` — `app/components/ui/`
   contains exactly `button.tsx`, `empty-state.tsx`, `form-control.tsx`,
   `section-card.tsx`, `status-pill.tsx`, and `form-control.tsx` exports named
   fields (`TextField`, `SelectField`, …), not a `FormControl`. The sentence
   sends a specialist looking for components that were never built.

3. **`:310-358`, the Settings Route Audit table — roughly 20 rows name routes
   that no longer resolve.** `[category]/page.tsx:11-12` calls
   `getSettingsRuntimeCategory(key)` and `notFound()`s on a miss, so any
   single-segment `/settings/<x>` outside the 11 categories 404s. This includes
   `/settings/tenant`, which `require-settings-permission.ts:54` uses as a live
   `fallbackHref` — **a permission failure currently redirects the user to a
   404.**

4. **`:26-27` and `:493` claim setting saves invalidate the relevant
   provider/cache.** They do not on the runtime path — see
   [[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]].

5. **`:156-157` says `/settings/access/users` redirects to
   `/settings/security-access/users`.** It does not: `access/users/page.tsx` is a
   full implementation fetching roles, users, business units and teams. **Two
   live, divergent user-management surfaces exist.**

Accurate and worth keeping: the CSS token contract (`:451-459`) matches
`lib/branding.ts` exactly, and the provider load order (`:435-447`) is correct.

## Reproduction

Compare the five numbered claims above with `settings-runtime.ts`, the App
Router tree, `app/components/ui`, `require-settings-permission.ts`, and the
two user-management implementations.

## Evidence

The source paths and line references in Actual Behavior are the direct evidence
recorded by the linked QA run at `1af3690`; the settings runtime's existing
`existsSync` test demonstrates the available route-verification mechanism.

## Root Cause

`doc-code-drift` in the one document the repository designates as overriding
others. Its route table is an enumeration — the form that ages worst — and
nothing checks that a documented route resolves, even though
`settings-runtime.spec.ts` already performs exactly that check for the *runtime's*
items using `existsSync`.

## Impact

A specialist consulting the canonical contract before building a settings
surface is told to reuse components that do not exist and given a route map that
is ~20 rows wrong. Because the document is declared authoritative over others, a
reader who notices the discrepancy is instructed to trust the wrong side.

The `/settings/tenant` fallback is the one live defect rather than pure
documentation: it is quoted from the doc into code, and it 404s.

## Affected Areas

`docs/architecture/settings-and-branding.md`, the settings App Router tree,
`require-settings-permission.ts`, and the duplicate user-management surfaces.

## Proposed Resolution

**Needs an ExecPlan** — this is not a documentation edit alone. Item 5 is a
genuine architectural question (two user-management surfaces, which is
canonical?), and item 3 includes a code fix (the `fallbackHref`). The
documentation corrections for items 1, 2 and 4 are mechanical and can land
first.

The durable half: extend `settings-runtime.spec.ts`'s existing `existsSync`
approach to assert that every route named in the canonical document resolves —
turning the enumeration from a liability into a checked artifact.

## Acceptance Criteria

- The document lists 11 categories and describes `integrations`.
- It names only components that exist.
- Every route it names resolves, or is marked removed.
- `require-settings-permission.ts`'s fallback points at a live route.
- Which user-management surface is canonical is decided and recorded.

## Regression Coverage

**None.** The spec extension above is the regression.

## Dependencies

An ExecPlan and owner decision are required for the canonical user-management
surface; the mechanical documentation corrections and live fallback correction
can proceed independently.

## Related Items

[[web-architecture]] · [[settings]] ·
[[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] ·
[[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo]] ·
bug pattern [[doc-code-drift]] · bug pattern [[divergent-duplicate-guard]].

## Resolution

Fixed 2026-08-22, branch `agent/backlog-burndown`. All five numbered claims, plus
the code defect and the durable check.

1. **Eleven categories, not ten.** `integrations` is named and described, and the
   `/settings/integrations/attendance/**` tree is listed among the purpose-built
   pages.
2. **Components that exist.** The shared kit is named exactly:
   `button`, `dialog`, `empty-state`, `form-control`, `section-card`,
   `status-pill`, plus `app/components/data-table/`. The document now also says
   that `form-control.tsx` exports named fields rather than a `FormControl`,
   which is the specific thing the old sentence sent people looking for.
   `dialog.tsx` exists because BUG-0043 built it.
3. **The route audit is gone**, replaced by the five runtime shapes, the nine
   purpose-built pages and the surfaces genuinely outside the catalogue. Eighty-
   seven registry items are not listed individually, because the registry is the
   list — an enumeration is the documentation form that ages worst, and this one
   aged into twenty 404s.
4. **Cache invalidation.** This claim is now true: [[BUG-0046]] is `VERIFIED`, so
   no correction was needed.
5. **The two user-management surfaces.** The document claimed one redirects to
   the other; neither does, and both are fully implemented. The decision is now
   recorded rather than left implicit — the runtime route is canonical for the
   catalogue, because metadata-driven UI is the default and the catalogue must
   have one entry per item, and `/settings/access/users` stays as a compound
   operational view reached from it.

**The one live defect**, quoted out of this document into code:
`require-settings-permission.ts` used `/settings/tenant` as a `fallbackHref`, and
it has not resolved since the settings runtime landed. It now points at
`/settings`, which renders an access-denied state rather than redirecting — no
loop, and the user is told what happened.

The document gained a provenance header, in the style AGENTS.md carries, because
it is the tier that outranks others and until now carried none.

## QA Retest

```text
apps/web  settings-doc-routes.spec.ts   5 tests PASS
apps/web  check-types                   PASS
apps/web  full suite                    438 tests PASS
```

Before the rewrite the route assertion listed eighteen dead URLs by name and the
category assertion failed on "ten" — which is how the eighteen were found rather
than guessed at. Scenario `QA-RUNTIME-011`.
### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-208 names `apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, apps/web   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`, with the mechanical
  documentation corrections available to land independently.
