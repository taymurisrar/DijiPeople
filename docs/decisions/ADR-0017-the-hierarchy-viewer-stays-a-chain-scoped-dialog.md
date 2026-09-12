---
ID: ADR-0017
aliases: [ADR-0017]
Title: The reporting hierarchy viewer stays a chain-scoped dialog, drawn as a real branching tree
Status: ACCEPTED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
---
# ADR-0017 — The reporting hierarchy viewer stays a chain-scoped dialog, drawn as a real branching tree

## Status

Accepted — 2026-09-13, by the product owner during the second demo walkthrough.
Complements ADR-0012 (hand-rolled tree, no library). Tracked as [[BUG-3499]].

## Context

[[ITEM-0164]] delivered a "View hierarchy" dialog on the employee record. On the
live demo tenant it shows the top manager of the employee's chain and that
manager's descendants, stacked in a single column; its detail card opens pinned
on the root, is clipped by the dialog and covers the first child; no other node
reveals details; nodes do not open records; there is no close control.

The owner was offered three shapes: a full organization chart page, fixing the
current dialog, or a reporting tab with no chart.

## Decision

**Keep the dialog and its chain scope, and fix it:**

- draw the tree as branches (children laid out beside each other under their
  manager), not a single column;
- detail cards open on hover, focus and tap for any node, are never clipped by
  the dialog, and never cover another node while closed;
- selecting a node opens that employee's record;
- a visible close control and an accessible dialog name;
- no introductory or explanatory text.

## Reasons

- The owner's use is "who is above and around this person", which the chain
  scope answers without a new page.
- ADR-0012's hand-rolled approach still fits; the defects are layout and
  interaction, not the rendering technique.

## Alternatives Considered

- **Full organization chart page.** Rejected for now by the owner.
- **Reporting tab without a chart.** Rejected.

## Consequences

- No new route and no new dependency.
- The API response shape from `GET /employees/{id}/reporting-structure` is
  sufficient; only the widget changes.

## Migration / Compatibility Impact

None.

## Security / Tenant Impact

None beyond the existing endpoint, which is tenant-scoped and field-level
security trims hover fields.

## Agent Rules

- Do not widen the dialog to the whole organization without a new decision.
- Do not add explanatory copy to the dialog.

## Related Modules

`employees`, `apps/web` runtime widgets.

## Related Features

Employee record → Reporting Hierarchy.

## Related

- [[BUG-3499]] — the defects this decision scopes.
- [[ITEM-0164]] — the original viewer.
