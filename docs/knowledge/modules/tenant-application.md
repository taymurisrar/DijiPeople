# Tenant Application

> Generated from repository evidence at `ad8f77f`.

## Purpose

`apps/web` (port 3001) — the product a tenant's own people use: employees,
managers, HR, payroll operators and tenant admins.

## Architecture

App Router with `(authenticated)` and `(public)` route groups. **Screens are
declared, not hand-written**: a runtime module spec, an adapter where the
standard one cannot serve, registry entries, then a route rendering
`StandardModuleListPage` / `StandardModuleRecordPage`. See
[[runtime-module-system]].

Shared kit under `app/components/` — `data-table/`, `runtime/`, `ui/`
(`Button`, `EmptyState`, `FormControl`, `SectionCard`, `StatusPill`) and
`metadata/` for form rendering. A hand-rolled table, form control or empty state
is a review failure.

Settings go through the settings runtime
(`app/(authenticated)/settings/_lib/`) and the API `settings-runtime` module —
see [[settings]].

## Server calls

`lib/server-api.ts` handles cookie auth, the `X-DijiPeople-App` header,
refresh-on-401 and error normalisation. Route handlers under `app/api/` are thin
proxies that make **no authorization or tenant decision** — the API is the
authority.

## Permission gating is cosmetic

`lib/permissions.ts` and `lib/security-keys.ts` gate navigation and controls for
usability only. Two traps that have caused real defects:

- The frontend helper is a **literal key check with no elevated-role bypass**,
  unlike the backend guard — gating a screen on a key admins do not literally
  hold hides it from admins.
- If the backend tightens a permission, screens gated on a *different* key still
  render and their actions 403.

Pattern: [[ui-permission-backend-mismatch]].

## Required states

Every data surface handles **loading, error, empty, access-denied**, plus
disabled/read-only, unsaved changes, stale data and API failure. Dates, numbers
and currency go through the shared formatting helpers so tenant regional
settings apply; colours come from tenant CSS variables, never hardcoded.

Tailwind CSS v4; the runtime shells handle the common breakpoints.

## Known bugs

[[BUG-0020-window-prompt-used-for-governed-reasons]] — OPEN. Four of the nine
call sites are here, including **payroll reversal reason and reversal date**,
where an unvalidated free-text date is a data risk rather than a styling one.

## Testing constraint

`apps/web` jest runs in a **node environment with no jsdom** — component render
tests are not possible. Extract logic and test the resolver, merge or catalog
instead. [[ITEM-0001]].

## Related

[[runtime-module-system]] · [[authentication]] · [[rbac]] · [[settings]] ·
[[employees]] · [[attendance]] · [[payroll]] · [[approvals]] ·
[[qa-and-ci-architecture]]
