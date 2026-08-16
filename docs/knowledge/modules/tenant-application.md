# Tenant Application

> **Last Verified:** 2026-08-17
> **Verified Against SHA:** `1af3690`
> **Source Paths:** `apps/web/AGENTS.md`, `apps/web/app/**`, `apps/web/lib/**`,
> `apps/web/proxy.ts`, `apps/web/jest.config.js`
>
> This is the application-level note for `apps/web`. Deep architecture lives in
> [[web-architecture]]; this file is what a specialist needs before touching it.
>
> It stays under `modules/` rather than moving to `product/` deliberately —
> `scripts/sync-obsidian.mjs` has no prune step, so moving the source would
> strand the published note in `03 - Modules/Generated` as the vault's first
> orphan.

## Purpose

`apps/web` (port 3001) — the product a tenant's own people use: employees,
managers, HR, payroll operators and tenant admins. It talks to `services/api`
and owns no business rules of its own.

It is the largest application in the monorepo by a wide margin: **1,100
TypeScript files, 253 pages, 416 route handlers**.

## Architecture

App Router with `(authenticated)` and `(public)` route groups — plus five plain
segments, of which **`workspace/` is the one most often missed** and is where
the proxy sends an unresolvable hostname.

**Screens are declared, not hand-written** — a `StandardModuleRuntimeSpec`
imported by the route file, rendered through `StandardModuleListPage` /
`StandardModuleRecordPage`. There is **no registration step**; the registries
that once implied one are inert. See [[runtime-module-system]] and
[[web-architecture]].

Shared kit under `app/components/` — `data-table/`, `runtime/`, `ui/`
(`Button`, `EmptyState`, `FormControl`'s named fields, `SectionCard`,
`StatusPill`) and `metadata/`. **There is no `Card`, `Badge`, `Tabs` or
`Dialog`** — documents that name them are wrong
([[BUG-0044-the-canonical-settings-and-branding-contract-is-materially-s]]).

## What is done well, and worth not breaking

- **Tenant isolation.** Workspace resolution runs before any render and **fails
  closed**, gated on `PLATFORM_ENVIRONMENT` rather than `NODE_ENV`. Hostname
  suffix confusion is defended. Workspace headers are deleted before being set,
  so they cannot be forged. **Zero route handlers accept a `tenantId` from the
  client.**
- **The proxy stays in its lane** — decode-only, no signature verification, no
  role logic.
- **Refresh-on-401 cannot loop** — one retry, de-duplicated by in-flight token,
  with a short-lived dead-token cache.
- **No client-side token storage** anywhere; cookies are httpOnly by default.

## Traps that have caused real defects

- **Permission gating is cosmetic.** `lib/permissions.ts` and
  `lib/security-keys.ts` gate navigation and controls for usability only, and
  `security-keys.ts` is a **hand-maintained mirror** of the API's constants with
  no generator. Two failure modes: the frontend helper is a literal key check
  with no elevated-role bypass, so gating on a key admins do not literally hold
  hides the screen from admins; and if the backend tightens a permission,
  screens gated on a *different* key still render and their actions 403.
  Pattern: [[ui-permission-backend-mismatch]].
- **Route handlers must decide nothing.** The rule is violated in five places —
  including two that turn a `403` into a `200` containing the caller's own
  payslips or bank details
  ([[BUG-0038-employee-payslip-and-bank-account-proxies-return-the-callers]]).
  Before adding a handler, read
  [[BUG-0040-web-route-proxies-make-authorization-and-business-decisions]].
- **Nothing is cached and nothing can be invalidated.** Every fetch is
  `no-store` and every render is dynamic. A "stale settings" symptom is a
  provider-refresh bug, not a cache one
  ([[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]]).
- **`moduleKey` string equality** selects command handlers and derives the API
  path. Renaming a spec's key silently changes both.

## Required states

Every data surface handles **loading, error, empty, access-denied**, plus
disabled/read-only, unsaved changes, stale data and API failure. Dates, numbers
and currency go through `lib/formatting-context.ts` so tenant regional settings
apply; colours come from tenant CSS variables, never hardcoded.

Two honest caveats on that rule as written: **48 call sites bypass the
formatting context** with `toLocaleDateString`/`toLocaleString`/`Intl`, and only
two of 27 authenticated areas have their own loading/error boundary — the rest
inherit one group-level pair, so a 115-page settings area blanks its whole
content region on every navigation.

## Testing constraint

Jest runs in a **node environment with no jsdom**, and `testMatch` is
`**/*.spec.ts` — **`.spec.tsx` is not matched**. Component render tests are
impossible; extract the logic and test the resolver, merge or catalog instead.

**`apps/web` also has zero browser coverage** ([[ITEM-0033]]), so pages, client
components, `proxy.ts` and all 416 handlers have no test mechanism at all. That
is the single largest quality gap in the repository, and [[ITEM-0001]]'s `DONE`
should not be read as covering this app.

## Known records

[[BUG-0038-employee-payslip-and-bank-account-proxies-return-the-callers]] ·
[[BUG-0039-apps-web-sets-no-security-response-headers]] ·
[[BUG-0040-web-route-proxies-make-authorization-and-business-decisions]] ·
[[BUG-0041-apps-web-reads-21-environment-variables-unregistered-in-turb]] ·
[[BUG-0042-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]] ·
[[BUG-0044-the-canonical-settings-and-branding-contract-is-materially-s]] ·
[[BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]] ·
[[BUG-0020-window-prompt-used-for-governed-reasons]] (VERIFIED) ·
[[ITEM-0033]] · [[ITEM-0034]] · [[ITEM-0035]] · [[ITEM-0036]] · [[ITEM-0012]]

## Related

[[web-architecture]] · [[runtime-module-system]] · [[monorepo-application-map]] ·
[[authentication]] · [[rbac]] · [[settings]] · [[employees]] · [[attendance]] ·
[[payroll]] · [[approvals]] · [[qa-and-ci-architecture]] · [[platform-admin]]
</content>
