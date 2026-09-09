---
ID: ITEM-0127
aliases: [ITEM-0127]
Title: Settings IA: 21 of 41 groups hold a single item
Type: UX
Status: DEFERRED
Priority: P2
Severity: 
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
RelatedBug: BUG-2958
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0127 — Settings IA: 21 of 41 groups hold a single item

## Summary

The settings tree is 87 pages in 41 groups across 11 categories. **Twenty-one of
the 41 groups contain exactly one page.** The grouping layer therefore carries
little information in half the tree, and the "N GROUPS" count printed on every
category tile in the Configuration workspace is close to meaningless — it counts
containers, not content.

Found while auditing every page for [[BUG-2958]]. Not a defect and not blocking:
the entitlement fix works on the current shape, and reorganizing it later
requires only new placement tuples.

## Why It Matters

Two costs, one of which the entitlement work made worse.

**The tile count misleads.** Notifications & Communication reads "4 groups" for
four pages, one per group. A reader comparing tiles cannot tell a rich category
from a thin one, and the number now varies by plan as groups collapse — so the
same tenant sees different counts before and after an upgrade for reasons that
have nothing to do with how much is in there.

**Navigation depth is unearned.** Reaching a single page through a group card
that holds only that page is a click and a screen for nothing, twenty-one times
over.

## Evidence

Measured at `2466afc4` over `settingsRuntimeCategories`:

| Category | Groups | Items |
|---|---|---|
| General Setup | 5 | 9 |
| Regional Operations | 5 | 7 |
| Security & Access | 3 | 7 |
| People Configuration | 5 | 16 |
| Integrations | 2 | 8 |
| Payroll & Finance | 5 | 16 |
| Approvals & Workflows | 3 | 5 |
| Notifications & Communication | 4 | 4 |
| Customization | 5 | 9 |
| Appearance & Experience | 2 | 2 |
| Audit & Compliance | 2 | 4 |

The clearest cases, worst first:

- **Notifications & Communication — 4 groups, 4 items.** Notification Rules,
  Templates, Providers and Delivery History are one page each. The category is
  small enough to hold its four pages flat.
- **Appearance & Experience — 2 groups, 2 items.** Branding & Theme and
  Workspace Experience, one page each.
- **Regional Operations — Localization, Currency and Business Calendar** are one
  page each (`timezones`, `currencies`, `fiscal-years`) beside a Countries &
  States group holding three.
- **Payroll & Finance — Payroll Cycles, Benefit Plans and Loan Plans** are one
  page each beside a Payroll Configuration group holding eleven. The split is
  lopsided in both directions.
- **General Setup** — Tenant & Company, Plan & Billing and Data Management are
  one page each. Two of the three were placed during [[BUG-2958]] and are new,
  so this is partly self-inflicted and partly the shape that already existed.

Two placements were corrected during [[BUG-2958]] and are not part of this item:
`subscription` moved out of Payroll & Finance, and `document-templates` moved
from a payroll group to People > Document Rules.

## Proposed Approach

No ExecPlan. This is presentation, and the mechanism is a lookup table:
`itemPlacement` in
`apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts` maps each page
to a category, group key and group label, and the categories, groups and routes
are all derived from it.

Two decisions are needed before any edit. **Whether a category may render pages
without a group** — that would let Notifications and Appearance flatten instead
of inventing containers, and it is a change to the category landing component,
not to the data. And **whether the tile should count pages rather than groups**,
which is a one-line change and removes the misleading number regardless of
whether anything is regrouped.

Beware of one trap already documented in the placement table: a group key equal
to a page's route key resolves to the same two-segment URL, and item resolution
wins, so the group landing becomes unreachable. Any regrouping must keep group
keys distinct from the route keys of their own members.

Route changes are the real cost. Every page's URL is derived from its category
and group, so moving a page changes its URL. Anything already linked from
documentation, a notification or a bookmark needs a redirect or an
`implementationRoutes` entry.

## Acceptance Criteria

- A decision recorded on whether categories may render pages without a group.
- The workspace tile count means something a reader can act on — pages, or
  groups only where groups carry more than one page.
- No group key collides with the route key of a page inside it.
- Any page whose URL changes keeps its old URL working.
- `settings-doc-routes.spec.ts` and `settings-entitlements.spec.ts` both pass;
  the latter pins per-plan category, group and page counts, so any regrouping
  updates those numbers deliberately rather than by accident.

## Dependencies

None. [[BUG-2958]] has landed. Doing this first would have made that fix harder
to review; doing it now is a self-contained presentation change.

## Related Items

- [[BUG-2958]] — the audit that measured this.
- [[ITEM-0126]] — which of the always-visible pages should be sold, found in the
  same audit.
- Modules — [[settings]], [[tenant-application]]

## History

- 2026-09-09 — created at `2466afc4` from the settings IA audit run while
  fixing [[BUG-2958]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2958]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
- 2026-09-09 — triaged by the Architect for SESSION-0094: DEFER. Presentation
  only, no correctness or commercial consequence, and it changes URLs — which is
  worth doing deliberately rather than folded into an entitlement fix.

- 2026-09-09 — partly addressed in the same session, and reduced rather than
  closed. The two decisions this item said were needed were taken: a category
  whose every group holds one page now renders its pages directly
  (`isFlatSettingsCategory`, derived from content rather than listed), and the
  workspace tile counts pages rather than groups. Notifications & Communication
  and Appearance & Experience flatten; nothing else does.

  Deliberately NOT done: moving or regrouping any page. Every URL is derived from
  `category/group/item`, so regrouping breaks existing links, and [[ADR-0005]]
  Decision 8 records the rule that came out of this — the group layer describes
  what a page *is* and must not be reshaped to carry an entitlement boundary. The
  nineteen remaining single-page groups sit inside categories that also hold
  multi-page groups, so flattening them would need real regrouping and real
  redirects.

  Stays DEFERRED for that remainder.
