# Lookup control contract

> Written for ITEM-0163. `apps/web` and `apps/admin` have no shared UI package
> for this (root `AGENTS.md`: `packages/` holds exactly four workspaces, none
> of them a lookup/combobox kit, and adding one needs an ADR this document does
> not propose). This is the behavioural contract both apps implement
> independently, and the tests each implementation is checked against.

## Why one contract instead of one component

Before this record, DijiPeople had six independent lookup implementations that
agreed on almost nothing:

| Implementation | File |
|---|---|
| Shared `LookupField` | `apps/web/app/components/ui/form-control.tsx` |
| Metadata form wiring | `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx` |
| Owner picker | `apps/web/app/components/runtime/module-owner-picker.tsx` |
| Admin `LookupControl` | `apps/admin/app/_components/ui/form-control.tsx` |
| Admin `SearchableSelect` | `apps/admin/app/_components/runtime/runtime-form.tsx` |
| Bespoke native select | `apps/admin/app/_components/documents/contract-creation-launcher.tsx` |

A user who learns a lookup on one screen was wrong on the next. Merging them
into one cross-app component was rejected: it would require a fifth
`packages/` workspace (an ADR-worthy decision this record does not make) for a
control whose two current homes already differ in their styling system,
runtime data path and framework glue. The contract below is what both
implementations must satisfy instead, checked by the specs listed at the
bottom.

## The contract

1. **Openable label, not a separate line.** When a lookup has a value, the
   value's name is a link in the field's **label row**, beside the field name
   — not a second line under the control, and not the combobox trigger itself.
   The trigger's only behaviour is opening the list; that is the whole of what
   its `role="combobox"` / `aria-haspopup="listbox"` contract promises, and
   overloading it with navigation is what [[BUG-1956]] had to undo once
   already.
   - `apps/web`: `LookupField`'s `FieldShell` renders `labelLink` in the label
     row (`form-control.tsx`), given an href from
     `runtime-metadata-form-renderer.tsx`'s `lookupReferenceHref`, which
     resolves a destination via
     `apps/web/app/components/metadata/lookup-reference-route.ts` — a
     normalized alias table (ITEM-0172), not the hand-maintained
     `LOOKUP_REFERENCE_ROUTES` map this document originally described here.
   - `apps/admin`: `RuntimeFormField`'s label row renders the same link for an
     editable lookup that `FieldDisplay` already rendered for a read-only one
     (`runtime-form.tsx`), given an href from `resolveLookupRecordRoute` in
     `apps/admin/lib/runtime/lookup-record-href.ts`, which derives a route
     from the lookup's own collection path per module rather than per field.
2. **Clear is a real, focusable, separate control.** Never a focusable element
   nested inside another focusable element (the `nested-interactive`
   violation), never `tabIndex={-1}`.
3. **The combobox pattern is `aria-activedescendant`, not roving `Tab` focus.**
   The trigger (or the search input once the popup is open) keeps DOM focus;
   options are non-focusable elements with `role="option"` and
   `aria-selected`; the active one is named by `aria-activedescendant`, kept
   in sync with the visible highlight. `aria-controls` is set only while the
   thing it names actually exists (never a dangling reference).
4. **Arrow keys, Enter, Escape, Home and End are handled on whichever element
   holds focus** (the trigger while closed, the search input while open), not
   on the options.
5. **Server-side search is the default for an entity-backed lookup.** Typing
   sends the query and an explicit page size to the server rather than
   filtering a client-side array that might not contain the whole answer. A
   small, effectively-fixed reference set (country, currency, timezone,
   state/province, city) may keep a cheap one-shot prefetch instead — chosen
   by the field's target entity, not by which caller happened to omit a page
   size.
   - `apps/web`: `standard-module-data.adapter.ts#getLookupOptions` +
     `LookupField`'s debounced `onSearch` (`lib/runtime/lookup-search.ts`).
   - `apps/admin`: `use-runtime-lookup-options.ts` + `RuntimeLookup`'s
     debounced query (`lib/runtime/lookup-search.ts`).
6. **The selected record stays visible while searching.** A narrower search
   result must not make an existing value's label disappear or fall back to a
   raw id.
   - `apps/web`: `resolveVisibleSelectedOption` pins the last resolved option
     until `value` itself changes.
   - `apps/admin`: `RuntimeLookup` derives the current option's label from the
     record's own denormalised field (`resolveLookupLabel`), independent of
     whatever page the options list currently holds.
7. **A truncated result set says so.** Opt-in (`resultsTruncated` /
   `resultsTruncated`), because only the caller that issued the request knows
   whether the page it got back was cut short.
8. **States**: loading, empty ("no matching records"), failed hydration, and
   disabled are all distinguishable — never a lookup that silently behaves
   like it has no options because the fetch failed.
9. **Quick create: explicitly not implemented.** The only prior attempt (the
   timeline widget's Quick Create button,
   `apps/web/app/components/runtime/module-widget-renderer.tsx:2900-2907`) is
   hardcoded `disabled` and does nothing. This record does not add it. A
   lookup that cannot find a record directs the user to create one through the
   record's own module, not through the lookup.

## What this record deliberately did not converge

- **The bespoke native `<select>`** in
  `apps/admin/app/_components/documents/contract-creation-launcher.tsx` still
  exists. Retiring it onto `SearchableSelect` is unscoped rework of a screen
  neither admin bug named.
- **A literal shared component.** See "Why one contract instead of one
  component" above.

## Where the contract is checked

- `apps/web/app/components/ui/lookup-listbox-semantics.spec.ts` — BUG-1956 /
  ITEM-0163 (web `LookupField`).
- `apps/web/lib/runtime/lookup-search.spec.ts` — debounce, selection pinning,
  truncation, small-reference-set classification (web).
- `apps/web/app/components/metadata/lookup-reference-route.spec.ts` — the
  reference-route alias resolution (ITEM-0172), including every previously
  silently-broken bespoke-employee-domain spelling and the verified
  roles/teams destinations.
- `apps/admin/lib/runtime/lookup-listbox-semantics.spec.ts` — BUG-3377 (admin
  `LookupControl` and `SearchableSelect`).
- `apps/admin/lib/a11y/listbox-navigation.spec.ts` — the ported keyboard
  primitive (admin).
- `apps/admin/lib/runtime/lookup-search.spec.ts` — the ported debounce
  primitive (admin).
- `apps/admin/lib/runtime/form-accessibility.spec.ts` — BUG-1423, extended to
  cover the label-row link.
