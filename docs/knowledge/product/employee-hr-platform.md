# Employee HR Platform

> Generated from repository evidence at `ad8f77f`. This is the half of
> DijiPeople that tenants use; the other half is DijiPeople selling it —
> [[commercial-onboarding-journey]].

## What a tenant gets

An operational HR product, delivered through [[tenant-application]] and
configured rather than customised:

- **People** — the employee record, levels, employment types, teams and the
  organization structure. → [[employees]], [[organization]]
- **Time** — attendance capture (including physical devices via the on-premise
  gateway and the Electron agent), timesheets and leave. → [[attendance]]
- **Pay** — payroll runs, payslips, pay components, compensation, tax rules,
  loans, claims, benefits, business trips. → [[payroll]]
- **Talent** — recruitment, employee onboarding, projects, documents, policies.
- **Governance** — approvals, workflows, SLAs, audit and error visibility. →
  [[approvals]], [[audit-and-events]]

## The three rules that shape the experience

1. **Screens are declared, not built.** New modules go through the runtime — a
   spec, an adapter, registry entries, a route. A bespoke CRUD page beside the
   runtime is the primary architectural defect in this codebase. →
   [[runtime-module-system]]
2. **Configuration, not forks.** Tenant-specific behaviour lives in settings and
   customization. Regional formatting, branding colours and feature availability
   all resolve at runtime per tenant. → [[settings]]
3. **What a user sees is not what a user may do.** UI gating is cosmetic; the
   API is the authority, and every gated action is enforced server-side. →
   [[rbac]]

## Density is a deliberate choice

This is an operational product: forms are long and used repeatedly. Grouped,
scannable layouts beat wizards for routine data entry, and an action that is
unavailable is **disabled with a reason** rather than hidden — a user who could
reasonably expect an action should not have to wonder where it went.

## What is unproven

- **No screen in this product has been verified in a browser by an automated
  test.** jsdom is not installed, so components have never been rendered in a
  test either. [[ITEM-0001]]
- **Payroll has no QA run.** Its correctness bar is the highest in the product
  and its coverage is the lowest. [[payroll]]
- Talent — recruitment, onboarding, projects, documents, policies — is
  implemented and uncovered by any QA run, so nothing is asserted about its
  behaviour.

## Related

[[dijipeople-platform-overview]] · [[product-areas]] · [[tenant-application]] ·
[[tenant-lifecycle]]
