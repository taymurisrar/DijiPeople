# Agent Role — Frontend

Implements in the Next.js applications: `apps/web` (tenant product),
`apps/admin` (platform admin), `apps/landing` (public site).

---

## Required Context

Before any work:

- [`.agent/context/system-overview.md`](../context/system-overview.md)
- [`.agent/context/frontend-architecture.md`](../context/frontend-architecture.md)
- [`.agent/context/runtime-module-system.md`](../context/runtime-module-system.md)
- [`.agent/context/ui-design-system.md`](../context/ui-design-system.md)
- [`.agent/context/api-contracts.md`](../context/api-contracts.md)
- [`.agent/context/auth-rbac.md`](../context/auth-rbac.md) — for UI gating
- [`.agent/context/testing-architecture.md`](../context/testing-architecture.md)

Plus the app's own AGENTS.md ([web](../../apps/web/AGENTS.md),
[admin](../../apps/admin/AGENTS.md), [landing](../../apps/landing/AGENTS.md))
and, for settings surfaces,
[`docs/architecture/settings-and-branding.md`](../../docs/architecture/settings-and-branding.md),
which is the canonical contract.

If a UI/UX specification exists for the task, read it before writing components.

## Task-Specific Discovery

**Search for an existing component before creating one.** Then read the runtime
spec/adapter for the module you are touching, and the route that renders it.

## Staleness Rule

Code wins. If the runtime context document names a component that no longer
exists, follow the code and recommend a context update.

---

## Owns

Routes and pages, runtime module specs and adapters, components, forms, tables,
state handling, API calls through the server-api helper, thin `app/api/**`
proxies, navigation entries, UI permission gating.

## Does not own

Backend contracts (Backend/API). Deciding UX behaviour when a UI/UX
specification is called for. Approving its own work.

---

## The rules that matter most here

### The module runtime is the default

New tenant-product screens are **declared, not hand-written** — a spec, an
adapter if the standard one cannot serve, registry entries, then a route that
renders the standard runtime pages, then navigation.

**A bespoke CRUD page beside the runtime is the primary architectural defect in
this codebase.** Build one only when the runtime genuinely cannot express the
requirement, and say so explicitly in the plan.

### Reuse before creation

A hand-rolled table, form control, empty state or dialog is a review failure.
`apps/admin` uses `ProDataTable` for every production table; `apps/web` has its
own data-table, runtime and `ui/` component sets. `packages/ui` contains only
button/card/code and is **not** the design system.

### Route handlers are proxies

`app/api/**` exists so the browser never contacts the API origin directly. They
contain **no business logic and make no authorization or tenant decisions**. The
API is the only authority. Forward the error contract rather than flattening it.

### UI permissions are cosmetic

Gating exists for usability. Every gated action must be independently enforced
server-side. A hidden button is not a security control.

Two traps, both of which have caused real defects:

- The frontend permission helper is a **literal key check with no elevated-role
  bypass**, unlike the backend guard. Gating a screen on a key that admins do not
  literally hold will hide it from admins.
- If the backend tightens a permission, screens gated on a *different* key will
  still render and their actions will 403. Check both sides together.

### States are not optional

Every data surface handles **loading, error, empty, access-denied**, plus
disabled/read-only, unsaved changes, stale data and API failure. Use the
existing route-level conventions and shared state components.

### Formatting and theming

Dates, numbers and currency go through the shared formatting helpers so tenant
regional settings apply — never ad-hoc `toLocaleDateString`. Colours come from
tenant CSS variables; do not hardcode brand colours.

---

## Checklist before declaring done

- [ ] Runtime used, or bespoke justified in writing
- [ ] Existing component reused; no new one-off table/control/empty state
- [ ] Loading / error / empty / access-denied handled
- [ ] Disabled, read-only, unsaved-changes and stale-data behaviour considered
- [ ] Responsive at tablet and mobile widths
- [ ] Labels, focus trapping, keyboard navigation, status conveyed by text not
      colour alone
- [ ] Permission gating matches what the backend actually enforces
- [ ] No authorization decision added in an `app/api` proxy
- [ ] Tenant/user context obtained from existing providers, not re-derived
- [ ] Pure logic extracted and unit-tested — **jsdom is not installed, so
      component render tests are not possible**; test the resolver, merge or
      catalog instead
- [ ] `check-types` and the app's jest run; lint scoped to changed files
