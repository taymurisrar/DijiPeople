CONTEXT_FILES_REQUIRED:
  - .agent/context/context-budget.md
  - .agent/context/failure-adaptation.md
  - docs/architecture/module-runtime-overhaul.md

SPECIALIST_AGENTS_REQUIRED:
  - frontend                            — LookupField, admin LookupControl/SearchableSelect, adapter wiring
  - ui-ux                               — a11y review of the ported listbox pattern (read-only)
DELIBERATELY_NOT_USED:
  - backend-api                         — no backend contract change; list endpoints already accept `search`
  - database                            — no schema impact

SINGLE_WRITER_FILES:
  - none (this plan touches no file in the root SINGLE_WRITER_FILES list)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none found under docs/qa/known-bug-patterns/ naming a lookup/combobox pattern; this record's own
    History section is the closest existing knowledge.

REGRESSION_ENTRIES_IN_SCOPE:
  - none yet — filed alongside the FIXED bug record in the same change.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    web, admin
DEPLOYMENT_ORDER:         n/a (frontend-only, no coordinated rollout needed)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0103 runs several agents in parallel against the same develop
                          lineage. `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`,
                          `responsive-runtime-tabs.tsx`, the settings/subscription and
                          settings/notifications trees, and the theme bootstrap are owned by other
                          concurrent agents in this wave and are explicitly out of scope for this plan.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — Runtime lookup search wiring, pinned selection and one openable-label contract

## Objective

An entity-backed lookup (web or admin) supports a debounced server-side search
with an explicit page-size convention, keeps the currently selected record
visible while the list is being searched, and states when its result list is
truncated. A lookup with a value renders that value's name as a link beside the
field's label rather than as a separate line under the control, without
reopening the `nested-interactive` fix from BUG-1956. The behaviour is
documented as one contract both frontends are tested against.

## Business requirement

BUG-3376: a runtime lookup must let the user find and select any permitted
record, not only the first server page. ITEM-0163: the product owner asked
that a populated lookup's value be the click target that opens the record, and
that every lookup in the product behave the same way. Both are filed at
`docs/bugs/BUG-3376-runtime-lookups-fetch-one-unpaged-page-and-filter-it-in-the-.md`
and `docs/backlog/items/ITEM-0163-give-every-lookup-one-behaviour-an-openable-label-one-implem.md`.

## Existing behavior

**FACT** `apps/web/app/components/ui/form-control.tsx:933-1266` (`LookupField`)
already accepts an `onSearch` prop but fires it on every keystroke with no
debounce (`:1030-1032`), and its `selectedOption` is derived only from the
`options` array it was last given (`:991-996`) — a caller that replaces
`options` with a narrower server page silently loses the selected label.

**FACT** `apps/web/lib/runtime/modules/standard-module-data.adapter.ts:364-466`
(`getLookupOptions`) builds its request from a dependency filter only; it never
sets `search` or `pageSize`. It already re-fetches the selected record
individually and unshifts it into the result when the initial page does not
contain it (`:406-440`) — this pinning exists today for the initial hydration
load only, not for a subsequent search.

**FACT** `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:1222-1241`
is the only call site that constructs `<LookupField>` for a metadata-driven
form field, and the only call site anywhere in `apps/web` that supplies
`selectedHref` (`:2432-2454`, `LOOKUP_REFERENCE_ROUTES`). This session's task
brief excludes that file: "other agents own [it] concurrently." No change in
this plan edits it.

**FACT** `apps/admin/lib/runtime/use-runtime-lookup-options.ts:20-83` fetches
`/api/platform-runtime/lookups?path=...` with no `search` parameter, even
though `apps/admin/app/api/platform-runtime/lookups/route.ts:24-27` already
reads `parameters.get("search")` and `apps/admin/lib/runtime/runtime-lookups.ts:32-37`
(`buildRuntimeLookupPath`) already appends it when present. The admin call site,
`RuntimeLookup` in `apps/admin/app/_components/runtime/runtime-form.tsx:925-1014`,
already re-derives the current option from the record's own denormalised field
(`resolveLookupLabel`, `:526-550`) and prepends it when absent from `options`
(`:977-984`) — admin's pin-on-hydrate story is already solid; only search is
missing.

**FACT** `apps/admin/app/_components/runtime/runtime-form.tsx:368-386`
(`FieldDisplay`) renders a resolved lookup's label as a `Link` when `read`. The
editable path (`RuntimeFormField`'s label block, `:259-275`) renders a plain
`<label>` with no link, and `SearchableSelect` (`:1016-1189`) has no
label-row-link concept at all.

**FACT** `apps/admin/app/_components/ui/form-control.tsx` (`LookupControl`,
`:407-595`) and `apps/admin/app/_components/runtime/runtime-form.tsx`
(`SearchableSelect`, `:1016-1189`) render `role="option"` on focusable
`button` elements inside a `role="listbox"`, and neither sets
`aria-activedescendant`; `LookupControl` has zero `onKeyDown` handlers. This is
BUG-3377, tracked and fixed as its own `FIX_NOW` change in the same session,
ahead of this plan (see Dependencies).

## Existing architecture

- Web: `LookupField`/`SelectField` in `apps/web/app/components/ui/form-control.tsx`,
  the keyboard-navigation pure helpers in `apps/web/lib/a11y/listbox-navigation.ts`,
  the `ModuleDataAdapter` contract in `apps/web/lib/runtime/module-data-adapter.types.ts`,
  and the standard adapter in `apps/web/lib/runtime/modules/standard-module-data.adapter.ts`.
  Field metadata (`lookupTargetEntityLogicalName`, `lookupTargets`) is produced
  elsewhere and consumed by the (excluded) renderer.
- Admin: `FormControl`/`LookupControl` in `apps/admin/app/_components/ui/form-control.tsx`,
  `RuntimeForm`/`RuntimeFormField`/`FieldDisplay`/`RuntimeLookup`/`SearchableSelect`
  in `apps/admin/app/_components/runtime/runtime-form.tsx`, the lookup data hook
  `apps/admin/lib/runtime/use-runtime-lookup-options.ts`, the proxy route
  `apps/admin/app/api/platform-runtime/lookups/route.ts`, and the pure helpers in
  `apps/admin/lib/runtime/runtime-lookups.ts` (`buildRuntimeLookupPath`,
  `mergeRuntimeLookupOptions`).
- Neither app has a shared UI package beyond `@repo/ui` (button/card/code only —
  root `AGENTS.md`), so a single cross-app component is not available without an
  ADR this plan does not propose. **PROPOSAL**: converge on one *contract*,
  implemented once per app, rather than one component.

## Requirements

1. `LookupField` debounces `onSearch` (≈300ms) instead of firing per keystroke.
2. `LookupField` keeps showing the previously resolved selected option's label
   when a later `options` array (a search result) no longer contains it,
   until the value itself changes or is cleared.
3. `LookupField` accepts an optional `resultsTruncated` flag and renders an
   affordance ("Showing first N — keep typing to narrow") when set.
4. `LookupField` renders the selected record's name as a link in the field's
   label row (via `FieldShell`) when `selectedHref` is supplied, and no longer
   renders a separate line below the control. `selectedHref`'s existing prop
   contract at the (unedited) call site is unchanged.
5. The dead `{false && isOpen ? ... : null}` block in `form-control.tsx`
   (`:1369-1433` at audit time) is removed.
6. `standard-module-data.adapter.ts#getLookupOptions` accepts an optional
   search query and sends both `search` and an explicit `pageSize` for entity
   lookups, while small fixed reference sets (country, currency, timezone,
   state/province, city) keep the existing unpaged prefetch. The signature
   change is additive/optional so the excluded renderer's existing 3-argument
   call site keeps compiling unchanged.
7. Admin's `useRuntimeLookupOptions` accepts an optional, already-debounced
   search string and includes it in the request.
8. Admin's `SearchableSelect` accepts optional `onQueryChange`, `serverFiltered`
   and `resultsTruncated` props; when `serverFiltered` is set it trusts the
   options it was given instead of re-filtering them client-side.
9. Admin's `RuntimeLookup` wires a debounced query into
   `useRuntimeLookupOptions` and passes it to `SearchableSelect`.
10. Admin's `RuntimeFormField` label row renders the same openable-label link
    for an editable lookup that `FieldDisplay` already renders for a read-only
    one, using the existing `resolveDisplayHref`/`resolveLookupLabel` helpers.
11. Admin's generic `LookupControl` (`FormControl` type `"lookup"`) gains the
    same optional `onSearch` prop, for contract consistency, without changing
    behaviour for its one existing caller that does not pass it.
12. A written lookup contract exists under `docs/architecture/` covering both
    apps' controls, and each app's fixed controls are tested against the parts
    of the contract that are pure/extractable logic.

## Dependencies

- BUG-3377 (admin `nested-interactive` fix) lands first in the same branch,
  because this plan edits the same two admin files it touches
  (`apps/admin/app/_components/ui/form-control.tsx`,
  `apps/admin/app/_components/runtime/runtime-form.tsx`). Sequencing avoids
  reworking the ARIA wiring twice.
- **Known gap, not fixed by this plan**: full end-to-end wiring of `onSearch`/
  `resultsTruncated` for a *metadata-driven record form* lookup (e.g. Project →
  Project Manager) requires a call-site change in
  `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`
  (the `<LookupField>` construction at `:1222-1241` needs to pass `onSearch`,
  a debounced-search-backed `options` array, and `resultsTruncated`; the
  `LOOKUP_REFERENCE_ROUTES` allowlist at `:2432-2454` is the "replace the
  allowlist" half of ITEM-0163). That file is owned by a concurrent agent this
  session and is explicitly out of scope here. This plan ships every piece that
  change needs (debounce, pin, truncation affordance, label-row link, extended
  adapter signature) so the integration is additive and mechanical — see
  `## Rollback considerations` for the exact follow-up diff shape. Until that
  lands, BUG-3376 is only fully closed for the admin console; web gets a larger
  default page size (see Requirement 6) and every primitive the remaining wiring
  needs, but not a demonstrable fix on the Project Manager repro path named in
  the bug.

## Files / modules affected

Web:
- `apps/web/app/components/ui/form-control.tsx`
- `apps/web/lib/runtime/module-data-adapter.types.ts`
- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts`
- `apps/web/lib/runtime/lookup-search.ts` (new — pure debounce/pin/truncation helpers)
- `apps/web/lib/runtime/lookup-search.spec.ts` (new)

Admin:
- `apps/admin/app/_components/ui/form-control.tsx`
- `apps/admin/app/_components/runtime/runtime-form.tsx`
- `apps/admin/lib/runtime/use-runtime-lookup-options.ts`
- `apps/admin/lib/a11y/listbox-navigation.ts` (new — ported pure a11y helpers)
- `apps/admin/lib/a11y/listbox-navigation.spec.ts` (new)
- `apps/admin/lib/runtime/lookup-search.ts` (new — debounce helper mirroring web's)
- `apps/admin/lib/runtime/lookup-search.spec.ts` (new)

Docs:
- `docs/architecture/lookup-control-contract.md` (new)
- `docs/bugs/BUG-3376-...md`, `docs/bugs/BUG-3377-...md`,
  `docs/backlog/items/ITEM-0163-...md` (Resolution sections)

No single-writer file (schema, RBAC, `app.module.ts`, guards, generated runtime
schema, `apps/web/lib/security-keys.ts`) is touched.

## Database impact

None.

## Backend impact

None. `services/api` list endpoints already accept `search`
(`services/api/src/modules/employees/dto/employee-query.dto.ts` and
equivalents); this plan only changes what the frontends send.

## Frontend impact

Both apps, module runtime path. No bespoke page is introduced — every change
is inside the existing shared controls and their adapters. Loading state: the
admin hook already exposes `loading`; web's `LookupField` shows the existing
empty-state text while a search is in flight (no new spinner is introduced —
kept in scope). Empty state: unchanged (`noResultsText`). Disabled state:
unchanged. Responsive/keyboard/ARIA: covered under BUG-3377's requirements,
carried forward here for the admin edits made in this plan.

## Permission / RBAC impact

None. No permission key, RBAC matrix entry or elevated role is touched.

## Tenant-isolation impact

None. Every request this plan changes already flows through
`apiRequestJson`/`requestJson`, which attach the caller's existing auth cookie;
no new endpoint is added and no `tenantId` is read from client input anywhere
in this diff.

## Audit / event / logging impact

None. No state-changing operation is added.

## Integration impact

None. No gateway, agent-desktop or Stripe contract changes.

## Migration / data compatibility

Additive-only frontend changes; no already-deployed client is affected. The
`getLookupOptions` signature change is backward compatible (new parameter is
optional) so it does not require the excluded renderer file to change to keep
compiling.

## Parallel-safe tasks

- `PARALLEL_SAFE` — web adapter + web control changes (Requirements 1-6) vs.
  admin changes (Requirements 7-11): disjoint files, disjoint apps.
- `PARALLEL_SAFE` — the two new pure-helper files and their specs, against
  everything else.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — admin `SearchableSelect`/`LookupControl` a11y+search
  edits (this plan) on BUG-3377's a11y rewrite of the same two files landing
  first (same branch, sequential commits).

## Integration tasks

- `INTEGRATION` — none required beyond the normal validation run; this plan
  does not merge separately-built pieces.

## Testing strategy

```
npm --workspace web run check-types
npm --workspace web run test
npm --workspace admin run check-types
npm --workspace admin run test
```

New specs:
- `apps/web/lib/runtime/lookup-search.spec.ts` — debounce timing (fake timers),
  pin-merge behaviour (selected option surviving a narrower options array,
  and being dropped when the value itself changes/clears), truncation
  detection given a count and a page size.
- `apps/admin/lib/a11y/listbox-navigation.spec.ts` — mirrors
  `apps/web/lib/a11y/listbox-navigation.spec.ts` (this plan assumes that spec
  exists; if it does not, this is the first one for the pattern).
- `apps/admin/lib/runtime/lookup-search.spec.ts` — debounce timing.

Manual verification (both apps have no rendering test harness — root
`AGENTS.md`/`apps/web/AGENTS.md`/`apps/admin/AGENTS.md`: jsdom is not
installed):
1. Admin: open a runtime form with a lookup field reading from an endpoint with
   more than one page of records (e.g. contracts, customers). Type a query that
   only matches a record outside the first page; confirm it appears and is
   selectable, and that the request in the network tab carries `search=`.
2. Admin: tab to a lookup, arrow through options, select with Enter, confirm
   `aria-activedescendant` is set and no option is a separate Tab stop; clear a
   value with the keyboard.
3. Web: `settings/appearance/experience/system-preferences` — confirm the
   Default timezone / Default currency fields show their value as a link in
   the label row (via `settings-form.tsx`'s `LookupField`, not the excluded
   renderer) rather than the old "Open X" line below the control, and that the
   combobox trigger's only click behaviour is opening the list.

## Risks

1. **Web's entity-lookup search remains unwired at the record-form call site**
   (Likelihood: certain, Impact: BUG-3376 stays open for that surface,
   Mitigation: documented explicitly above and in the bug record; every piece
   the follow-up needs ships in this plan).
2. **Truncation heuristic false negative** if a caller never sets
   `resultsTruncated` (Impact: low — no worse than today's silent truncation,
   Mitigation: prop defaults to `false`/unset, never fabricated by the control
   itself).
3. **Duplicated a11y helper drifting between apps** (Impact: low, the logic is
   ~15 lines and covered by mirrored specs in both apps; Mitigation: comment in
   each file pointing at its counterpart).

## Rollback considerations

Code-only; revert the commits. If the excluded-file integration is done later
by another session, the minimal follow-up diff at
`runtime-metadata-form-renderer.tsx:1222-1241` is: replace the static
`options={[...resolvedLookupOptions]}` wiring with a small hook call (e.g.
`useLookupFieldSearch({ dataAdapter, runtime, field, values })` returning
`{ options, onSearch, resultsTruncated }`) built from the adapter method this
plan extends, and spread the result onto `<LookupField>` alongside the existing
`selectedHref` prop. No prop this plan adds to `LookupField` requires removing
an existing prop, so that change is additive.

## Definition of Done

- [x] `npm --workspace web run check-types` passes
- [x] `npm --workspace web run test` passes (new spec included)
- [x] `npm --workspace admin run check-types` passes
- [x] `npm --workspace admin run test` passes (new specs included)
- [x] `eslint --fix` run on every changed file
- [ ] No unrelated file in the diff
- [x] `docs/architecture/lookup-control-contract.md` written
- [x] BUG-3377 fixed and merged into the same branch first
- [x] BUG-3376 and ITEM-0163 Resolution sections reflect exactly what shipped
      and what remains open, with file references
