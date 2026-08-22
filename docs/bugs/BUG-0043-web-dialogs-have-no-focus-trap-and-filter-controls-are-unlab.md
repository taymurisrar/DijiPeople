---
ID: BUG-0043
aliases: [BUG-0043]
Title: Web dialogs have no focus trap and filter controls are unlabelled
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: ui-ux
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-216
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0043 — Web dialogs have no focus trap and filter controls are unlabelled

## Summary

`apps/web/AGENTS.md:178` requires "every control labelled; dialogs focus-trapped
and dismissible with Escape; tables keyboard-navigable". None of the three holds.

## Expected Behavior

Dialogs contain keyboard focus, close with Escape and expose dialog semantics;
filter controls have accessible names; interactive table rows are keyboard
reachable.

## Actual Behavior

**No focus trap exists anywhere in the app.** There is no `focus-trap`
dependency, no `inert` usage, and **zero native `<dialog>` elements** — all
modals are bespoke divs. Tab escapes every modal to the page behind it.

Nine files do handle the `Tab` key, but none is a modal: they are the form
designer's grid navigation, `table-detail-shell`, `role-designer` and
`form-layout-grid`. Keyboard handling exists in the app; **modal containment
does not.**

**Three runtime dialogs cannot be dismissed with Escape** —
`module-assign-dialog.tsx`, `module-share-dialog.tsx`,
`module-command-action-dialog.tsx`. The first two also lack `aria-labelledby`;
the third also lacks `aria-modal`. Inversely,
`app/components/feedback/confirm-dialog.tsx:47-54` handles Escape but declares
neither `role="dialog"` nor `aria-modal`, so it is not announced as a dialog.

**Filter bars ship unlabelled controls.** `attendance-filter-bar.tsx` (8
`<select>`) and `timesheet-filter-bar.tsx` (9 `<select>`) contain zero `<label>`,
zero `htmlFor` and zero `aria-label`; the attendance search input has only a
placeholder. App-wide, `htmlFor` appears 22 times against 193 raw `<input>` and
99 raw `<select>`.

**Table rows are click-only.** `data-table.tsx:594-598` puts `onClick` on a
`<tr>` with no `tabIndex`, `onKeyDown`, `role="button"` or focusable child — so
row navigation, the primary interaction on every runtime list, is unreachable by
keyboard.

## Reproduction

Open any named runtime dialog and press Tab until focus leaves the modal, or
inspect the named filter bars and clickable table row for the missing accessible
names and keyboard handlers.

## Evidence

All verified at `1af3690`: `focus-trap` absent from `apps/web/package.json`;
`<dialog` → 0 matches under `app/`; `"Tab"` → 9 matches, enumerated above and
none in a modal; `jsx-a11y` absent from `apps/web/eslint.config.mjs`.

The shared kit has **no dialog primitive** — `app/components/ui/` contains only
`button`, `empty-state`, `form-control`, `section-card`, `status-pill` — and
`apps/web` declares no dialog library. So the AGENTS.md rule "a hand-rolled
dialog is a review failure" is currently unfulfillable.

## Root Cause

Established: no shared dialog primitive to reuse, and no lint rule to catch the
consequences. `jsx-a11y` is configured nowhere in the repository.

## Impact

Keyboard and screen-reader users cannot reliably operate modals or the primary
list interaction. This is a product used by every employee of every tenant,
including for statutory actions like leave and attendance correction, so
accessibility here is a procurement and compliance concern, not only a usability
one.

`MEDIUM` not `HIGH`: nothing is exposed or corrupted, and mouse users are
unaffected — but it is the widest-reaching defect found in this audit.

## Affected Areas

`apps/web/app/components`, the attendance and timesheet filter bars, the
runtime dialogs, and the shared data table.

## Proposed Resolution

**Needs an ExecPlan**, because the first decision is whether to adopt a
headless dialog library (Radix, react-aria) or build one primitive. `apps/web`
currently declares only `@repo/config`, `next`, `react`, `react-dom`, so adding
a dependency is an architectural choice under the "do not add dependencies
without justification" rule.

Then: one `Dialog` primitive in `app/components/ui/` handling focus trap,
Escape, `role`/`aria-modal`/`aria-labelledby` and restore-focus; migrate the 17
bespoke modals; label the filter controls; make `DataTable` rows keyboard
reachable; add `eslint-plugin-jsx-a11y` so the class cannot silently return.

## Acceptance Criteria

- Tab is contained within an open dialog and focus is restored on close.
- Every dialog closes with Escape and is announced as a dialog.
- Every `<input>`/`<select>` has an accessible name.
- A `DataTable` row is reachable and activatable by keyboard.
- `jsx-a11y` runs in the `lint` CI job.

## Regression Coverage

**None**, and component tests are impossible under the current jest config
(`testEnvironment: node`, no jsdom). The realistic guard is the lint rule plus
browser coverage — which `apps/web` does not have at all ([[ITEM-0034]]).

## Dependencies

An ExecPlan must choose the shared dialog primitive or justified headless
library before the modal migration starts.

## Related Items

[[web-architecture]] · [[tenant-application]] · [[ITEM-0034]] ·
[[runtime-module-system]] · [[ITEM-0031]].

## Resolution

Fixed 2026-08-22, branch `agent/backlog-burndown`.

The ExecPlan question the record posed — headless library or one primitive — was
decided as **build one**, and the reasoning is recorded in
`apps/web/app/components/ui/dialog.tsx`: `apps/web` declares four dependencies,
AGENTS.md forbids adding one without justification, and what was missing is focus
containment, Escape, dialog semantics and focus restore. A headless library is a
defensible choice and a bigger decision than this defect needs; if the app later
wants the rest of a primitives library, that is an ADR rather than a side effect
of fixing an accessibility bug.

`Dialog` owns behaviour and layout. `useDialogBehavior` owns behaviour alone,
because most of these modals carry elaborate layouts — an image cropper, a device
mapping workspace, a monthly timesheet editor — and restructuring them into a
shared shell would be a redesign. A redesign is not what was wrong with them.

All 17 modal overlays now use one or the other. The refresh overlay stays as it
is and is allowlisted with its reason: `pointer-events-none`, nothing to activate,
nothing to contain — it gained `role="status"` instead.

The rest of the record, item by item:

- **Filter bars.** The attendance bar's 8 selects and search input and the
  timesheet bar's 9 selects now carry accessible names. `aria-label` rather than
  visible labels: these bars are compact by design and each control's first
  option already states its purpose on screen.
- **Table rows.** `DataTable` rows are `role="button"`, focusable and activated by
  Enter or Space — guarded to the row itself, so a control inside a cell keeps
  its own keys and Space does not scroll the page. Only when the row is actually
  clickable; a static row stays a plain row rather than becoming a tab stop that
  does nothing.
- **Comboboxes.** Both `form-control.tsx` comboboxes declared `role="combobox"`
  without `aria-controls`, and the lookup one without `aria-expanded` — announced
  as a combobox whose popup a screen reader cannot find. Both now name their
  listbox.
- **`jsx-a11y`.** Enabled as **errors**, not warnings, so this class cannot
  accumulate the way it did. It ships inside `eslint-config-next` already, which
  registers it and enables almost none of it, so this adds no dependency. It
  found 14 further errors across 10 files; all are fixed, including three
  designer surfaces where selecting what to edit was mouse-only.

The durable half the record asked for is `scripts/check-dialogs-are-contained.mjs`.

## QA Retest

```text
check-dialogs-are-contained   17 overlays across 507 components, all contained
apps/web lint                 0 errors (was 14 jsx-a11y errors across 10 files)
apps/web check-types          PASS
apps/web tests                438 PASS
```

A probe component rendering a bare `fixed inset-0` modal is named by the check
and refused. Scenario `QA-RUNTIME-013`.

The manual half — Tab cycling inside an open dialog, Escape closing it, focus
returning to the opener, and a screen reader announcing the name — is described
in the scenario and has **not** been run in a browser here. `apps/web` still has
no browser E2E coverage at all, which is [[ITEM-0034]] and remains open.
### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-216 names `scripts/check-dialogs-are-contained.mjs`, `apps/web/eslint.config.mjs`, and that is what was executed.

```text
node <script>   PASS
npx jest --runTestsByPath, apps/web   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`. The dependency decision has to
  be taken before any of the migration work is meaningful.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0034]]
- Modules — [[tenant-application]]
- Regression — REG-216 (see the regression register)

<!-- GRAPH:END -->
