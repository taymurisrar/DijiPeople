---
ID: ITEM-0163
aliases: [ITEM-0163]
Title: Give every lookup one behaviour: an openable label, one implementation, and a reference route that is not an allowlist
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, apps/admin]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
RelatedBug: BUG-3376
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0163 — Give every lookup one behaviour: an openable label, one implementation, and a reference route that is not an allowlist

## Summary

The product owner asked for one specific change and one general guarantee. The
specific change: when a lookup has a value, the **label of the selected record
should be the thing you click to open it**, not a separate link sitting under
the field. The general guarantee: every lookup in the product should behave the
same way.

Neither holds today. The "Open X" link under the field exists because an
accessibility fix deliberately moved it out of the control, it appears for only
nineteen allowlisted entities, and there are at least six independent lookup
implementations across the two frontends that disagree about nearly everything
else as well.

## Why It Matters

A control this common is a product's vocabulary. Six implementations means a
user learns the lookup on one screen and is wrong on the next: sometimes there
is a link to the record, usually there is not; sometimes typing searches the
server, never in practice; sometimes the keyboard works, in the admin console it
does not. It also means every future fix has to be made up to six times, which
is how [[BUG-1956]] came to be fixed in one app and left standing in the other.

The specific request also has to be answered carefully rather than simply
obeyed, because the obvious implementation reintroduces a defect that was
already fixed once.

## Evidence

**The screen the request came from.** On
`/settings/appearance/experience/system-preferences`, the Default timezone and
Default currency fields each render a link below the control. Read from the live
DOM at `cbd9b812`:

| Link text | href |
|---|---|
| `Open UTC` | `/settings/regional/localization/timezones?reference=UTC` |
| `Open US Dollar` | `/settings/regional/currency/currencies?reference=USD` |

Both carry the class string from
`apps/web/app/components/ui/form-control.tsx:1360-1364`, confirming they are the
shared control's `selectedHref` anchor.

**Why the link is below the field.** `apps/web/app/components/ui/form-control.tsx:1351-1358`
carries the reasoning in a comment: the link used to sit inside the combobox,
and [[BUG-1956]] moved it out because a combobox is a leaf widget that may not
own focusable children, and an anchor in there was both an accessibility
violation and a Tab stop inside a control the user was trying to open. Removing
the link and making the combobox trigger navigate would undo that fix.

**Only nineteen entities ever get the link.**
`apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:2432-2454`
holds `LOOKUP_REFERENCE_ROUTES`, a hand-maintained map from entity to settings
route. A lookup whose target is not in that map gets no link at all. The map is
also the only call site that supplies `selectedHref` anywhere in either app —
grepping both frontends returns exactly one.

Two entries in that map point at legacy paths, `roles: "/settings/access/roles"`
and `teams: "/settings/access/teams"`, which only resolve because
`next.config.ts:92-95` rewrites them. The map's own comment beside the `users`
entry says this map "should not be a fifth place naming the old one" — and for
roles and teams it still is. That same legacy rewrite is a link in the chain of
[[BUG-3374]].

**Six implementations.**

| Implementation | File |
|---|---|
| Shared `LookupField` | `apps/web/app/components/ui/form-control.tsx:933` |
| Metadata form wiring | `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:1222` |
| Owner picker | `apps/web/app/components/runtime/module-owner-picker.tsx` |
| Admin `LookupControl` | `apps/admin/app/_components/ui/form-control.tsx:407` |
| Admin `SearchableSelect` | `apps/admin/app/_components/runtime/runtime-form.tsx:1016` |
| Bespoke native select | `apps/admin/app/_components/documents/contract-creation-launcher.tsx` |

`apps/admin/AGENTS.md` names a hand-rolled control a review failure; the last
row is one directly.

**Other divergences found while auditing.**

- Quick create is offered by no lookup anywhere. The Quick Create button in the
  timeline widget at
  `apps/web/app/components/runtime/module-widget-renderer.tsx:2900-2907` is
  hardcoded `disabled` and does nothing.
- Roughly 65 unreachable lines sit behind `{false && isOpen ? ... : null}` at
  `apps/web/app/components/ui/form-control.tsx:1369-1433`, a superseded copy of
  the whole popup including a second nested `{false && ...}` at `:1414-1421`.
- `lookupOptionDisplay` at `apps/web/app/components/ui/form-control.tsx:1439-1448`
  strips a trailing code from a display name heuristically, a narrower relative
  of the mangler in [[BUG-1753]].

## Proposed Approach

Needs an ExecPlan under `PLANS.md`, because it changes a shared control used by
both frontends and has to be sequenced against [[BUG-3376]].

**Answer the owner's request without reopening [[BUG-1956]].** A `label` element
is not the combobox, so making the label row carry the link is safe where
overloading the trigger is not. Render the selected record's name as a link
**in the field's label row**, beside the field name, and drop the separate line
below the control. The combobox trigger keeps click-to-open as its only
behaviour, which is what its ARIA contract promises. The admin console's own
read-only `FieldDisplay` at
`apps/admin/app/_components/runtime/runtime-form.tsx:368-386` already does
exactly this and is the template to generalise.

**Then converge.** One control, one contract, covering: openable label,
clear, server-side search, loading state, failed-hydration state, empty state,
disabled state, keyboard and ARIA semantics, and an explicit decision about
quick create. Retire the admin copies onto it, or if the two apps genuinely
cannot share a component, share the behaviour contract and test both against it.

**Replace the allowlist.** The reference route for an entity should come from
the module registry that already knows where that entity lives, not from a
hand-maintained map that silently yields no link when an entry is missing.
Fixing the two legacy entries is a prerequisite either way.

Delete the dead block at `:1369-1433` as part of the same change.

## Acceptance Criteria

- A lookup with a value shows the record name as a link in the label row, and
  no separate link below the control.
- The combobox trigger has exactly one behaviour: it opens the list.
- An automated accessibility scan of a form with a populated lookup reports no
  `nested-interactive` violation, in either app.
- Every entity lookup can open its target record, without an entry being added
  to a hand-maintained route map.
- One documented lookup contract exists, and every lookup surface in both apps
  is tested against it.
- No unreachable `{false && ...}` block remains in `form-control.tsx`.

## Dependencies

[[BUG-3376]] changes the same fetch path and should be planned with this, not
after it. [[BUG-3377]] is the narrower admin accessibility fix and should land
first, independently, rather than waiting for convergence.

## Related Items

[[BUG-3376]] unpaged lookups hide records. [[BUG-3377]] admin lookup semantics.
[[BUG-1956]] the fix this must not undo. [[BUG-1753]] label mangling.
[[BUG-1578]] a lookup storing the wrong token. [[BUG-3374]] shares the legacy
roles rewrite.

## History

- 2026-09-11 — created at `cbd9b812` from a user report about the Default
  timezone and Default currency fields, widened into a consistency audit of
  every lookup in both frontends.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3376]]
- Referenced by — [[BUG-3377]]
- Modules — [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
