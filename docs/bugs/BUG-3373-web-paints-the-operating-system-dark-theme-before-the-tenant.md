---
ID: BUG-3373
aliases: [BUG-3373]
Title: Web paints the operating-system dark theme before the tenant Light default arrives
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-413
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3373 — Web paints the operating-system dark theme before the tenant Light default arrives

## Summary

On a machine whose operating system prefers dark, the tenant product paints its
entire signed-in shell dark for the first several hundred milliseconds of every
page load, then repaints light once a client effect has fetched the tenant's
configured theme. The tenant in question has **Default theme mode = Light** set
in Settings, so the dark frame is never a theme anybody chose. It happens on
refresh, on opening a new tab, and on the first screen after login, because all
three are full document loads.

The blocking bootstrap script that decides the theme before first paint cannot
see the tenant default. It knows two things only: a `localStorage` key that
almost nobody has, and the operating system preference. For a first-time or
cleared-storage visitor the operating system wins the first frame by default.

## Expected Behavior

The first painted frame uses the theme the tenant configured. A tenant whose
default is Light never shows a dark frame to a user who has not asked for one.
Where the user has made an explicit in-app choice, that choice wins, and it too
is applied before first paint rather than after.

## Actual Behavior

The first frame is the operating system's preference. The tenant default only
takes effect after two client effects have run and a settings fetch has
returned, which is well after the browser has painted.

## Reproduction

1. Use a browser or operating system set to prefer dark.
2. Ensure no in-app theme has ever been chosen, so `localStorage` has no
   `dijipeople:theme` key. A private window or cleared site data is enough.
3. Load any authenticated screen of the tenant product, for example the
   Overview page. A refresh, a new tab, or completing login all reproduce it.
4. Watch the background. It is dark, then becomes light.

## Evidence

Measured against the live demo workspace at `cbd9b812` by sampling
`document.documentElement`'s `data-theme` and the computed background while the
document loaded, with `prefers-color-scheme: dark` emulated and the storage key
removed. The tenant's configured default is Light.

| Sample point | `data-theme` | `body` background | stored choice |
|---|---|---|---|
| DOMContentLoaded | `dark` | — | none |
| ~400 ms | `dark` | `rgb(15, 23, 42)` | none |
| ~900 ms | `light` | `rgb(248, 250, 252)` | none |
| ~1800 ms | `light` | `rgb(248, 250, 252)` | none |

`rgb(15, 23, 42)` is the dark shell ground; `rgb(248, 250, 252)` is the light
one. The dark frame persisted past 400 ms in this run, which is longer than the
"milliseconds" the report described.

Code path:

- `apps/web/app/layout.tsx:101-114` — the blocking inline bootstrap script, the
  first child of `body`, runs on every route through the root layout before
  hydration. It resolves the theme from `localStorage.getItem("dijipeople:theme")`
  and `matchMedia("(prefers-color-scheme: dark)")` only. It is a static string
  with no interpolation, so no tenant value can reach it.
- `apps/web/app/layout.tsx:126-132` — the same layout has **already fetched**
  the tenant's public settings server-side, and `apps/web/lib/public-tenant-settings.ts:8`
  types that payload as carrying the theme mode. It is used only to build CSS
  colour variables, never to decide `data-theme`.
- `apps/web/app/(authenticated)/layout.tsx:291-305` — the signed-in shell is
  server-rendered inside `.dp-theme-scope`, present in the first HTML payload.
- `apps/web/app/globals.css:241-371` — a full dark palette is keyed off
  `html[data-theme="dark"] .dp-theme-scope`, so the moment the bootstrap stamps
  `dark` the whole shell legitimately paints dark.
- `apps/web/app/(authenticated)/_components/tenant-settings-provider.tsx:87-89`
  and `.../resolved-settings-provider.tsx:194-222` — post-paint effects read the
  real default and call `applyTheme(effectiveThemeChoice())`
  (`apps/web/lib/theme.ts:82-84`, precedence stored then tenant default then
  system), which is the repaint.

## Root Cause

The theme is decided twice by two mechanisms that do not share an input. The
pre-paint decision has access to the operating system and to `localStorage` but
not to the tenant default; the tenant-aware decision runs only after paint. When
those two disagree, which is every dark-preferring machine on a Light tenant, the
disagreement is visible as a flash.

## Impact

Cosmetic and momentary, with no data or security consequence, but it reaches
nearly every user who has never touched the in-app theme toggle and whose
machine prefers dark. It also makes the tenant's own Default theme mode setting
look ineffective, which is the part the reporter noticed.

## Affected Areas

Every authenticated screen in `apps/web`. The login form itself hardcodes light
backgrounds and is not wrapped in `.dp-theme-scope`, so the flash the reporter
associates with login is the dashboard landing immediately after submitting it,
not the form.

## Proposed Resolution

Give the pre-paint decision the tenant default. Mirror the in-app theme choice
into a cookie, resolve cookie choice then tenant default server-side in
`apps/web/app/layout.tsx`, and stamp `data-theme` into the server-rendered
markup. Keep the inline script only for resolving the `system` choice through
`matchMedia`, seeded with the server-resolved default rather than a bare guess.

`apps/admin` already fixed this defect class the same way, by reading a cookie
server-side before paint. Reuse that pattern rather than inventing a second one.
No ExecPlan needed; this is contained to the root layout and the theme helper.

## Acceptance Criteria

- With `prefers-color-scheme: dark`, no stored theme choice, and a tenant default
  of Light, `data-theme` is `light` in the server-rendered HTML and never takes
  the value `dark` at any sample point during load.
- An explicit in-app choice of Dark still produces `data-theme="dark"` in the
  first painted frame.
- A tenant whose default is System still follows the operating system.

## Regression Coverage

Needs a test asserting that the server-rendered document carries a `data-theme`
attribute derived from the tenant default, and that the bootstrap script does not
override it when no choice is stored. A register entry follows once written.

## Dependencies

None.

## Related Items

[[BUG-0046]] resolved which theme value wins once one is written, not when the
decision happens; its own History flags this pre-paint gap as unresolved.
[[BUG-0495]] and [[BUG-1261]] are the `apps/admin` instances of this same defect
class and carry the pattern to reuse. See also [[BUG-0420]].

## Resolution

Fixed as the record specified, reusing `apps/admin`'s cookie pattern rather
than inventing a second one.

- `apps/web/lib/theme.ts` — added `THEME_COOKIE` (`dp-web-theme`), mirrored
  from `storeThemeChoice()` alongside the existing `localStorage` write.
  Extracted the precedence order (explicit choice → tenant default → device)
  into a pure `resolveThemePrecedence()`, now shared by the client's
  DOM-based `effectiveThemeChoice()` and the server's cookie-based
  resolution, so the two cannot encode two different answers. Added
  `parseThemeChoice()` to narrow an arbitrary string to a real choice, used
  wherever a cookie, `localStorage` value or DOM attribute is read back.
- `apps/web/app/layout.tsx` — `RootLayout` now reads the `dp-web-theme`
  cookie via `cookies()` and the tenant's `themeMode` via the
  already-fetched `publicSettings` (`resolveTenantBranding(...).themeMode`),
  resolves the effective choice server-side, and stamps `data-theme` (when
  resolvable) and `data-tenant-theme` (always) directly into the
  server-rendered `<html>`. The inline bootstrap script is now narrowed to
  finishing a `system` resolution via `matchMedia`, seeded from the
  server-stamped `data-tenant-theme` attribute rather than guessing, plus a
  one-time migration: a pre-fix, cookie-less choice still held only in
  `localStorage` is written into the cookie on first run so the *next* full
  load is also resolved server-side.
- No API or database change — `themeMode` was already served by the public
  branding endpoint the layout already calls.

## QA Retest

Pending — no QA agent run in this session; `apps/web`'s automated suite
(`npm --workspace web run test`, `check-types`) is green. See REG-413 in
`docs/qa/regressions/index.md` for the scenario a future QA pass should
re-run, including in a real browser with `prefers-color-scheme` and storage
emulated, which this session's jsdom-less jest cannot exercise.

## History

- 2026-09-11 — created from user report at `cbd9b812`, reproduced and measured
  against the live demo workspace.
- 2026-09-12 — fixed for SESSION-0103. See Resolution. Regression coverage:
  REG-413.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-413 (see the regression register)

<!-- GRAPH:END -->
