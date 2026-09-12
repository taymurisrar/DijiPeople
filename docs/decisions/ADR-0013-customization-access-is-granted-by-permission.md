---
ID: ADR-0013
aliases: [ADR-0013]
Title: Customization access is granted by customization permissions, not by role membership
Status: ACCEPTED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
---
# ADR-0013 — Customization access is granted by customization permissions, not by role membership

## Status

Accepted — 2026-09-13, by the product owner during the second demo walkthrough,
resolving [[BUG-3491]].

## Context

Three authorization models disagree about who may use Settings → Customization:

| Layer | File | Rule today |
|---|---|---|
| Web section layout | `apps/web/app/(authenticated)/settings/customization/layout.tsx` | `customization.read` permission, or a settings administrator role (after the fix for [[BUG-3374]]) |
| Web settings admin roles | `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts` | Global Administrator, System Admin, System Customizer |
| API guard | `services/api/src/modules/customization/customization-access.guard.ts` | Global Administrator or System Customizer role only |

On the live demo tenant the workspace owner holds the System Admin role and all
44 `customization.*` permission keys. The web layout let them in, every leaf
page then called the API, the API refused with
`CUSTOMIZATION_ACCESS_ROLE_REQUIRED`, and each page rendered a server error.

The owner was asked which rule is intended.

## Decision

**Customization is authorized by the `customization.*` permission keys, exactly
like every other tenant capability.** Role membership is not checked anywhere
in the customization path — not in the API guard, not in the web layout, not in
the pages.

- Reads require the relevant `customization.*.read` key (or `customization.read`).
- Writes require the specific manage/create/update/delete key already declared
  in `services/api/src/common/constants/permissions.ts` and mirrored in the RBAC
  matrix.
- The System Customizer role remains as a convenient bundle of those keys; it
  is no longer a gate.

## Reasons

- It is how the rest of DijiPeople works. `PermissionsGuard` plus
  `@Permissions` / `@RequirePermission` is the established authorization path;
  a role-name check is a second, competing model (AGENTS.md principle 4).
- Tenants create custom roles. A role-name gate makes a correctly configured
  custom "Configurator" role useless, silently.
- Two layers answering the same question differently is exactly what produced
  [[BUG-3374]] and then [[BUG-3491]].

## Alternatives Considered

- **Only the customizer roles.** Rejected by the owner: it locks out the
  workspace owner and any custom role.
- **Owner and System Admin always, plus the customizer roles.** Rejected: still
  a role-name model, and still disagrees with the permission catalog.

## Consequences

- The workspace owner, System Admin, and any role granted the keys can
  customize.
- The temporary System Customizer role added to the demo tenant's owner on
  2026-09-13 (so the walkthrough could proceed) is removed once this ships and
  is verified.
- A user with no customization keys gets the in-place access-denied state from
  the layout — never a server error, never a redirect.

## Migration / Compatibility Impact

No schema change. Existing role grants keep working because the System
Customizer and Global Administrator roles already carry the keys. API clients
that relied on a 403 for non-customizer roles holding the keys now receive 200;
none exist outside `apps/web`.

## Security / Tenant Impact

Tenant isolation is unchanged: every customization query is still scoped by
`request.user.tenantId`. The change widens access only to users an administrator
has explicitly granted customization permissions. No platform bypass is added,
and `hasElevatedTenantRole` is not extended.

## Agent Rules

- Never gate a customization endpoint or page on a role name.
- The API decorators and the web gate for a customization surface must name the
  same permission keys.
- A regression test must send a user who holds the keys but neither customizer
  role through the real API guard and assert success, and a user without the
  keys and assert 403.

## Related Modules

`customization`, `permissions`, `roles`, `apps/web` settings runtime.

## Related Features

Settings → Customization (modules, fields, forms, views, choice lists,
relationships, action bars, packages, publish center).

## Related

- [[BUG-3491]] — the crash this resolves.
- [[BUG-3374]] — the earlier redirect whose fix exposed the mismatch.
