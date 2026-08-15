# Runtime Module System

> Generated from repository evidence at `ad8f77f`.

**Metadata-driven UI is the default in DijiPeople, not an option.** New
tenant-product modules are *declared* rather than hand-written.

## How a module is declared

In `apps/web/lib/runtime/`: a module registry entry, a metadata registry entry,
command registry entries, and a per-module adapter under
`lib/runtime/modules/`. A route then renders the standard runtime pages, and a
navigation entry points at it.

Standard pages: `StandardModuleListPage`, `StandardModuleRecordPage`,
`ModuleDataTable`, `ModuleRecordHeader`, `ModuleEmptyState`, with form rendering
through `app/components/metadata/`.

`apps/admin` has its own kit: **`ProDataTable`** for every production table,
plus `RuntimeModulePage`, `RuntimeRecordPage`, `RuntimeForm`,
`RuntimeViewSelector`, `ModuleActionBar`.

**`packages/ui` contains only button/card/code and is NOT the design system.**

## Why this is the default

A bespoke CRUD page beside the runtime is **the primary architectural defect in
this codebase**. Each one is a second place where permissions, empty states,
loading, tenant context and formatting must be got right — and they diverge
silently. Build one only when the runtime genuinely cannot express the
requirement, and say so explicitly in the plan.

A hand-rolled table, form control or empty state in either app is a review
failure.

## Settings go through the settings runtime

`apps/web/app/(authenticated)/settings/_lib/` and the API `settings-runtime`
module. `docs/architecture/settings-and-branding.md` is the canonical contract
for settings, branding and formatting.

## Where the runtime shows its seams

Two open records are runtime-shaped rather than page-shaped:

- [[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] —
  the `partner-inquiries` runtime view filters **Partner** rows by status, a
  different entity from the `PartnerInquiry` its detail page loads. The view and
  the detail page disagree about what the module is about.
- [[BUG-0020-window-prompt-used-for-governed-reasons]] — nine `window.prompt`
  call sites across both apps, including payroll reversal reason and date, where
  the runtime's `PanelDialog` was available.

Both are the same underlying shape: a surface that stepped outside the runtime
and then drifted.

## States are not optional

Every data surface handles **loading, error, empty, access-denied**, plus
disabled/read-only, unsaved changes, stale data and API failure. Dates, numbers
and currency go through the shared formatting helpers so tenant regional
settings apply; colours come from tenant CSS variables.

## Related

[[system-architecture]] · [[api-architecture]] · [[tenant-application]] ·
[[platform-admin]] · [[settings]] · [[rbac]]

Source: root `AGENTS.md`, `apps/web/AGENTS.md`, `apps/admin/AGENTS.md`,
`.agent/context/runtime-module-system.md`,
`.agent/context/ui-design-system.md`,
`docs/architecture/module-runtime-overhaul.md`.
