---
ID: ITEM-0114
aliases: [ITEM-0114]
Title: The workspace shell states the tenant's identity four times and its purpose twice
Type: UX
Status: PRODUCT_DECISION
Priority: P3
Severity: 
AffectedModules: [views]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
RelatedBug: BUG-2148, BUG-2149
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0114 — The workspace shell states the tenant's identity four times and its purpose twice

> **Architect triage, 2026-08-29 — `PRODUCT_DECISION`.** The engineering half is
> trivial and the decision underneath it is not mine to make: which of
> `brandName`, `shortBrandName` and `tenantName` is canonical in which slot, and
> whether the sidebar's most prominent line should carry the workspace's name
> instead of the word "Workspace", are branding calls with a tenant-visible
> outcome. Recording the question rather than picking an answer.

## Summary

On one screen of the tenant product, above the fold, the workspace names itself
four times and explains itself twice — with two of the four names being
different strings.

Reading down the left column and across the top of the demo tenant:

| Position | Text | Source |
|---|---|---|
| Sidebar eyebrow | `DIJIPEOPLE DE…` (truncated) | `branding.brandName` |
| Sidebar title | `Workspace` | a literal in `dashboard-sidebar.tsx` |
| Sidebar tagline | "Manage your people operations from one place." | `branding.portalTagline` |
| Page eyebrow | `DIJIPEOPLE` | `branding.shortBrandName` |
| Page description | "Manage your workspace from one place." | a default in `dashboard-topbar.tsx` |
| Sidebar footer | `Active tenant · DijiPeople` | `tenantName` |

## Why It Matters

The two names disagreeing is not a data error — it is the design working as
written. `effectiveTenantName` prefers `shortBrandName` and the sidebar brand
uses `brandName`, so a tenant that fills in both correctly gets both rendered a
few hundred pixels apart, one of them truncated. A reader has no way to know
they refer to the same thing.

The largest text in the sidebar is the word "Workspace", which is a constant and
therefore says nothing about this workspace. The most prominent identity slot in
the product is spent on a category noun.

And the two taglines are the same sentence twice: "Manage your people operations
from one place." above "Manage your workspace from one place." Neither is wrong;
together they read as a template that nobody finished.

This is chrome cost, and it compounds. [[ITEM-0102]] has just removed one row
from this same region for the same reason — the band was carrying something that
read as page content. What remains is roughly a third of the first screen before
any data appears.

## Evidence

Observed 2026-08-29 on `dijipeople-demo.ws.dijipeople.com`, from two screenshots
of the Admin dashboard supplied by the owner.

- `apps/web/app/(authenticated)/layout.tsx:130-134` — `effectiveTenantName`
  prefers `shortBrandName`, then `brandName`, then the company display name.
- `apps/web/app/(authenticated)/_components/dashboard-sidebar.tsx` — the
  expanded and compact brand blocks both render `brandName` above the literal
  `"Workspace"`; `TenantCard` renders `tenantName` again lower down.
- `apps/web/app/(authenticated)/_components/dashboard-topbar.tsx:37` —
  `pageDescription` defaults to "Manage your workspace from one place.", so
  every screen that does not pass one says it.
- `apps/web/app/components/branding/branding-defaults.ts:5` — `portalTagline`
  defaults to "Manage your people operations from one place."

## Proposed Approach

Not obvious, and deliberately not decided here — this needs a product call on
which name is canonical in which slot, which is why it is an item rather than a
bug. Three things are worth considering separately:

- **One name per region.** If the sidebar carries the long name, the page header
  does not need a name at all; the page header's eyebrow could carry the role
  instead, which is what it already falls back to.
- **The word "Workspace" as the sidebar's largest text.** It became a `<p>` in
  [[BUG-1673]] for heading reasons; whether it should be there at all is a
  separate question.
- **Two taglines.** The topbar default duplicates the branding tagline in
  substance. Dropping the default, so the description slot is empty unless a
  page supplies one, is the smaller change and probably the right one.

Note the truncation is a symptom, not the defect: widening the sidebar would
show both names in full and make the disagreement *more* visible, not less.

## Acceptance Criteria

- The tenant's name appears in at most two places in the shell, and the same
  string in both.
- No two adjacent elements state the product's purpose in near-identical words.
- Whatever occupies the sidebar's most prominent line says something specific to
  this workspace, or the slot is given up.

## Dependencies

Touches the same shell as [[ITEM-0102]], [[BUG-1673]] and [[BUG-1668]]. Worth
batching with whichever of those is opened next, for the reason [[ITEM-0102]]
was originally deferred: opening this header repeatedly costs more than the
changes do.

## Related Items

Raised from the same screenshot review as [[BUG-2148]] and [[BUG-2149]].

## History

- 2026-08-29 — raised by the Architect while reviewing owner-supplied
  screenshots of the tenant dashboard, alongside [[ITEM-0102]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[BUG-2148]], [[BUG-2149]]

<!-- GRAPH:END -->
