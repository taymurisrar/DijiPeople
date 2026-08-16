---
ID: BUG-0044
aliases: [BUG-0044]
Title: The canonical settings and branding contract is materially stale
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web, docs/architecture]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0044 — The canonical settings and branding contract is materially stale

## Summary

`docs/architecture/settings-and-branding.md` is declared **canonical** by
`docs/README.md` — it "overrides other documents where they differ". Four of its
substantive claims are now false, including a ~20-row route table describing
URLs that return 404.

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
   [[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]].

5. **`:156-157` says `/settings/access/users` redirects to
   `/settings/security-access/users`.** It does not: `access/users/page.tsx` is a
   full implementation fetching roles, users, business units and teams. **Two
   live, divergent user-management surfaces exist.**

Accurate and worth keeping: the CSS token contract (`:451-459`) matches
`lib/branding.ts` exactly, and the provider load order (`:435-447`) is correct.

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

## Related Items

[[web-architecture]] · [[settings]] ·
[[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] ·
[[BUG-0043-the-documented-new-module-workflow-for-apps-web-cannot-be-fo]] ·
bug pattern [[doc-code-drift]] · bug pattern [[divergent-duplicate-guard]].

## Resolution

Not resolved. Deliberately **not** fixed inside TASK-0003: correcting a document
declared canonical, when two of its errors imply product decisions (which
user-management surface wins, where the permission fallback should go), is not a
documentation edit and would be the opportunistic scope-widening the working
agreements forbid.

## QA Retest

Not applicable — not yet fixed. Route non-existence is derived from the App
Router tree plus `[category]/page.tsx:11-12`; **no URL was requested against a
running server**, so a `redirects()` entry rescuing some of them is not fully
excluded — though `next.config.ts`'s 55 redirects were read and do not cover the
single-segment cases.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`, with the mechanical
  documentation corrections available to land independently.
</content>
