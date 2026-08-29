---
ID: BUG-1951
aliases: [BUG-1951]
Title: Most tenant workspace pages render no main landmark, including every settings category
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: 41eaadb4
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-302
RelatedBacklogItem: ITEM-0034
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1951 — Most tenant workspace pages render no main landmark, including every settings category

## Summary

**89 of 232 authenticated pages in `apps/web` render a `<main>` element. The
other 143 render none**, and neither the authenticated layout nor the settings
layout supplies one — so there is no fallback.

Every settings category is in that group. `/settings/organization`,
`/settings/branding` and `/settings/notifications` have no `main` landmark at
all, which a browser test discovered by waiting 45 seconds for one that was
never going to appear.

## Expected Behavior

Every page has exactly one `main` landmark. It is how assistive technology skips
navigation to reach content — the "skip to content" affordance is meaningless
without it, and landmark navigation cannot work.

BUG-1421 fixed the mirror image for `apps/admin`, where screens rendered **two**
`main` landmarks. The tenant product has the opposite defect and was never
checked, because until 2026-08-29 nothing could open it (ITEM-0034).

## Actual Behavior

No `main` element on 143 of 232 authenticated pages, including all settings
categories.

## Reproduction

1. Start the API and `apps/web` against a seeded database; sign in to a tenant.
2. Open `/settings/organization`.
3. Query the page for `role=main`. Nothing matches.

Or statically, at `41eaadb4`:

```bash
grep -rl "<main" "apps/web/app/(authenticated)/" | wc -l    # 89
find "apps/web/app/(authenticated)" -name page.tsx | wc -l  # 232
grep -c "<main" "apps/web/app/(authenticated)/settings/layout.tsx"  # 0
```

## Evidence

Found by Flow J on its first real run against a live stack, 2026-08-29. Three
tests — settings organization, branding and notifications — failed identically:

```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('main')
Expected: visible
Timeout: 45000ms
Error: element(s) not found
```

The settings **index** does render one, which is why the defect is partial
rather than total and why a spot check would have missed it. The category pages
inherit `settings/layout.tsx`, which renders no landmark of its own.

## Root Cause

Not established beyond the structural fact: the landmark is left to each page
rather than supplied by a layout, and most pages do not supply it. 89 that do
were presumably written by someone who knew; the convention was never enforced.

## Impact

Accessibility, on every screen of the application every employee of every tenant
uses. A page with no `main` cannot be navigated by landmark and offers no target
for skip-to-content — so a keyboard or screen-reader user tabs through the whole
sidebar on every navigation.

`apps/web/AGENTS.md` already requires labelled controls, focus-trapped dialogs
and keyboard-navigable tables. This is the same class of requirement and was
simply never checkable.

## Affected Areas

`apps/web` — the authenticated layout, the settings layout, and the 143 pages
that supply no landmark of their own.

## Proposed Resolution

Supply it once in the authenticated layout rather than 143 times, and remove the
89 page-level `<main>` elements that would then be duplicates — because two
`main` landmarks is BUG-1421's defect, and fixing this carelessly creates it.

That ordering matters and is why this is not a one-line change: adding the
layout landmark first, without removing the page-level ones, makes 89 pages
worse while making 143 better.

## Acceptance Criteria

- Exactly one `main` landmark on every authenticated page — not zero, not two.
- A browser assertion covers it across a representative set of routes.
- The settings categories specifically, since they are where it was found.

## Regression Coverage

None yet. Flow J's landmark assertion is marked `test.fixme` naming this record:
it describes the required behaviour and is expected to fail until the fix lands,
rather than being deleted or rewritten to assert the defect. Rewriting it to
match current behaviour would encode the bug as the specification.

## Dependencies

Should be fixed together with, or after,
[[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page]] —
both are the shared authenticated shell's structure, and both are the tenant
half of what BUG-1421 fixed for admin.

## Related Items

Backlog item [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage]] — found by its
coverage. Sibling [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page]].
Mirror image of [[BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-]],
which is `VERIFIED` for admin.

## Resolution

Fixed, in the order the Proposed Resolution section called for — which is the
part that made this more than a one-line change.

**The landmark is the layout's, once.**
`apps/web/app/(authenticated)/layout.tsx:280` renders
`<main className="flex min-w-0 flex-col gap-6" id="main-content">` around
`{children}`, inside the error boundary and outside the topbar: the page header
band is banner content, not the page's content. Every one of the 232
authenticated routes now has exactly one.

**And the 89 that had their own no longer do.** Adding the layout landmark
without removing those would have given 89 pages two, which is precisely
BUG-1421's defect in `apps/admin`. All of them — page files, `loading.tsx`,
`error.tsx`, and the shared `app/components/dashboard/role-dashboard-page.tsx`
and `app/components/settings/settings-layout.tsx` — render a `div` with the
same classes. `main` and `div` are both block-level with no default styling of
their own, so nothing moved.

The `(public)` routes, `not-found.tsx`, `global-error.tsx`, `app/workspace` and
`app/partner` keep their own landmarks: they render outside this layout and
would otherwise have none.

**Skip to content.** `layout.tsx:198-204` puts a visually hidden skip link as
the first focusable element of the shell, targeting `#main-content`. It is new
rather than restored — there was nothing to skip to before, which is the point
the record makes about a keyboard user tabbing the whole sidebar on every
navigation.

**Settings categories specifically**, where this was found: they render through
`app/components/settings/settings-layout.tsx`, which did supply a `main` — but
`/settings/organization` redirects to `/settings/organizations`, which is served
by the settings runtime and did not. Both are covered now by the layout, so the
distinction stops mattering.

**Coverage.** `apps/web/app/components/workspace-shell-headings.spec.ts`
replaces the old holding assertion with a BUG-1951 block that walks every
`.tsx` under `app/(authenticated)` and asserts the landmark appears exactly
once, in the layout, with the skip link pointing at it, and nowhere else —
including the two shared components. Both halves are asserted because either
one alone is a defect: zero landmarks and two landmarks are the same failure
seen from opposite sides.

## QA Retest

Not retested — not yet fixed.

## History

- 2026-08-29 — found by Flow J against a live stack at `41eaadb4`. Three settings
  categories failed on a landmark that does not exist; the static count then
  showed 143 of 232 pages share the defect.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0034]]
- Modules — [[tenant-application]]
- Regression — REG-302 (see the regression register)

<!-- GRAPH:END -->
