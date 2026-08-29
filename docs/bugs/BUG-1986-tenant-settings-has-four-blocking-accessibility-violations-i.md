---
ID: BUG-1986
aliases: [BUG-1986]
Title: Tenant settings has four blocking accessibility violations including buttons with no name
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: 41eaadb4
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-337
RelatedBacklogItem: ITEM-0034
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1986 — Tenant settings has four blocking accessibility violations including buttons with no name

## Summary

An axe audit of `/settings/organization` in the tenant product returns **four
violations at critical or serious impact** — the threshold the browser suite
gates on. Two are critical.

The worst is `button-name`: **five buttons on that page have no discernible
text**. A screen reader announces each of them as "button", so the controls
exist and cannot be identified.

## Expected Behavior

No critical or serious violations. `apps/web/AGENTS.md` requires every control
to be labelled, meaning never to rest on colour alone, and dialogs to be
focus-trapped and escapable. Flow E established the gating policy for this
repository: critical and serious gate, moderate and minor are reported.

## Actual Behavior

```
CRITICAL aria-allowed-attr   Elements must only use supported ARIA attributes
                             [.cursor-pointer]
CRITICAL button-name         Buttons must have discernible text
                             [5 nodes, .rounded-[20px]:nth-child(1..5) > … > .h-7]
SERIOUS  color-contrast      Elements must meet minimum contrast thresholds
                             [4 nodes, incl. .bg-accent-soft.text-accent[aria-current="page"]]
SERIOUS  nested-interactive  Interactive controls must not be nested
                             [.cursor-pointer]
```

## Reproduction

1. Start the API and `apps/web` against a database seeded with `seed-demo`.
2. Sign in to a tenant workspace.
3. Open `/settings/organization`.
4. Run an axe audit at the standard tags — or run
   `npx playwright test --config e2e/playwright.config.ts flow-j`.

## Evidence

Found by Flow J on 2026-08-29 at `41eaadb4`, against a live local stack. The
full node lists are in the error above and in the run's trace.

Two of them point at the same element, `.cursor-pointer`, carrying both an
unsupported ARIA attribute and a nested interactive control — which usually
means one component is doing both wrong, so the two may share a fix.

`color-contrast` includes `.bg-accent-soft.text-accent[aria-current="page"]` —
the **current page** indicator in navigation. Meaning is being carried by a
colour pairing that does not meet the threshold, on the element whose whole job
is to tell you where you are.

## Root Cause

Not established. The selectors are Tailwind utility strings rather than
component names, so the next step is opening the trace and identifying the
components — `apps/web/app/(authenticated)/settings/_components` and the shared
`app/components/ui` kit are where to start.

## Impact

Five unlabelled buttons on a settings page make that page unusable with a screen
reader, not merely awkward — the user can find the controls and cannot learn
what any of them does.

Reachable in production, on the application every employee of every tenant uses.

Rated **HIGH** rather than MEDIUM, unlike its siblings BUG-1950 and BUG-1951:
those degrade orientation, this removes the ability to operate a control at all.

## Affected Areas

`apps/web` — tenant settings, and probably the shared component kit rather than
settings alone. The audit ran on one page; nothing suggests the components are
unique to it, and that is worth establishing as part of the fix.

## Proposed Resolution

Open the trace, identify the five unnamed buttons, and give them accessible
names — preferring a real label over `aria-label` where the control has visible
text. Then re-audit, because `nested-interactive` and `aria-allowed-attr` on the
same node may resolve together.

**Audit more than one page before closing.** This is one screen of 232 and there
is no reason to think it is the only one; the fix is likely in shared
components.

## Acceptance Criteria

- Zero critical and zero serious violations on `/settings/organization`.
- The same audit passes on at least two further tenant screens.
- Flow J's audit stops being `test.fixme` and gates.

## Regression Coverage

Flow J's `J — every settings control has an accessible name` is marked
`test.fixme` naming this record. It asserts the required state and is expected
to fail until the fix lands — rather than being weakened to pass, which would
turn the suite into a record of what the product does instead of what it must
do.

## Dependencies

None, though it shares a surface with
[[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin]] and
[[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page]] and
the three are worth fixing in one pass over the shell and the settings kit.

## Related Items

Backlog item [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage]] — the third
defect its coverage found. Same class as
[[BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read]],
which is `VERIFIED` for the admin console and was never checkable for web.

## Resolution

Fixed. All four, and — as the record predicted — three of them were in shared
components rather than on that one page, so the fix reaches far more than
`/settings/organization`.

The Root Cause section asked for the components behind the Tailwind selectors.
They are:

**`button-name`, five nodes** —
`apps/web/app/(authenticated)/settings/_components/settings-runtime-nav.tsx:84`.
The selector `.rounded-[20px]:nth-child(1..5) > … > .h-7` is the category
expand/collapse toggle, one per settings category, and the `.rounded-[20px]`
ancestor is the category `section`. Its only child is a lucide chevron, which
renders an `svg` with no title, so the button had no name at all. It now
carries `aria-label={`${categoryOpen ? "Collapse" : "Expand"} ${category.label}`}`,
and both chevrons are `aria-hidden`. `aria-label` rather than visible text
deliberately: the visible name is the category link immediately beside it, and
repeating it would announce every category twice.

**`color-contrast`, including the current-page indicator** —
same file, the active item's `bg-accent-soft font-semibold text-accent`. This
one could not be tuned. `--accent-soft` is the tenant primary mixed 18% into
white (`apps/web/app/globals.css:222`) and `--accent` is that same primary, so
the pairing is a colour on a tint of itself and **no tenant palette can pass**.
The text is `--foreground` now. The soft background, the weight and
`aria-current="page"` still carry the state, so nothing rests on hue.

**`aria-allowed-attr` and `nested-interactive`, both on `.cursor-pointer`** —
`apps/web/app/components/data-table/data-table.tsx:613`. The record's guess that
"one component is doing both wrong" was right, and it is not a settings
component at all: it is the clickable row of the shared data table, which every
runtime list in the tenant product renders. BUG-0043 made the row keyboard
reachable and gave it `role="button"` along the way. A button is a leaf widget,
and this one contains the selection checkbox and every link and action button
its cells render — `nested-interactive`. And `aria-selected` is not supported
on `button`, though it is supported on `row`, which a `tr` already is —
`aria-allowed-attr`. The role is removed; `tabIndex` and the key handler, which
are what BUG-0043 was actually about, stay. A button containing a dozen
focusable children was never announcing anything useful.

**Also, unreported but adjacent:**
`apps/web/app/(authenticated)/settings/_components/settings-shell.tsx` wrapped
its nav in an `aside` and handed it to `SettingsLayout`, which wraps whatever
it is given in an `aside` of its own — two nested complementary landmarks on
every settings screen. The inner one is a `div` now.

**On "audit more than one page before closing".** Two of the four fixes are in
`data-table.tsx` and one is in the settings runtime nav, both of which are
shared, so this cannot have been unique to that screen — every runtime list in
the product carried the row defect. That is an argument from the source rather
than a second audit: the browser audit itself is Flow J's to run.

Covered by
`apps/web/app/(authenticated)/settings/settings-accessibility.spec.ts`, which
pins each of the four to the component it was found in, so the next reader is
not re-deriving components from utility-class selectors. It asserts the absence
of the literals that were the defects, and that what the defective code was
there for — keyboard reachability, the current-page marker — survived the fix.

## QA Retest

Not retested — not yet fixed.

## History

- 2026-08-29 — found by Flow J's axe audit on its first run against a live
  stack. Four violations, two critical.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0034]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
