# Super Admin

> Generated from repository evidence at `ac17223`, plus the live route sweep run
> for [[BUG-0071]] on 2026-08-18.

## Purpose

The API surface behind Platform Admin — DijiPeople's own operator console. One
controller, `SuperAdminController`, mounted at `/api/super-admin`, serving
customers, tenants, subscriptions, invoices, payments, plans, promotions,
platform settings, platform email and billing diagnostics **across every
tenant**.

## What makes it different from every other controller

Almost every controller in this repository answers within one tenant. This one
answers across all of them. That single property is why its authorization is
worth more care than its size suggests: a defect here is not a tenant reading
another tenant's row, it is a tenant reading the business.

## How it is guarded

```ts
@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)
@Controller('super-admin')
```

**`RolesGuard` is not the platform boundary, and never was.** `system-admin` is
a *tenant* role key — `seed-demo` grants it to two ordinary demo users. A tenant
administrator satisfies `@RequireRoles` here as easily as a platform operator
does. The boundary is `PlatformPermissionsGuard`, which requires `platform.id`;
see [[platform-auth]] for why, and for what happened when it did not.

The controller was deliberately **not** given a second identity assertion of its
own. Two mechanisms guarding one surface means two places to keep in step, and
the guard it already declares is sufficient and enumerable.

## Every route maps to a permission

`resolvePlatformPermission` decides what each route requires by matching path
substrings. Because the guard refuses an unresolved permission, an unmapped
route is a route nobody can reach — which is how `/operators`,
`/feature-catalog`, `/lifecycle-options` and `/tenant-slug/availability` came to
return `403` to the very operators they were built for.

`platform-permissions.spec.ts` enumerates this controller's own route metadata
and asserts:

- no route resolves `null`;
- no route whose verb is not `GET` resolves a permission ending in `.read`.

**Adding a route here means the map must learn about it**, or that test fails.
That is the intended cost — it is paid at test time rather than by an operator
hitting a 403 or, worse, an auditor deleting a plan price.

## Permissions by area

| Area | Read | Write |
|---|---|---|
| Customers, tenants, leads, onboarding | `<domain>.read` | `.create` / `.update`; `DELETE` maps to `.update` |
| Plans, invoices, subscriptions, payments | `<domain>.read` | `<domain>.manage` |
| Promotions, billing, Stripe webhook retry | `billing.read` | `billing.manage` |
| Platform settings | `settings.read` | `settings.manage`, or `settings.appearance.manage` for an appearance-only patch |
| Platform email | `settings.read` | `settings.email.manage`; credentials and connection tests are separate |
| Console furniture — `operators`, `lifecycle-options` | `dashboard.read` | — |
| `feature-catalog` | `plans.read` | — |

The `.manage` permissions for plans, invoices, subscriptions and payments did
not exist until [[BUG-0072]]; before that, mutations resolved the read
permission of the same domain.

`DELETE` maps to `<domain>.update` rather than a `<domain>.delete` that does not
exist. Inventing one would have meant a grant decision across sixteen platform
roles; `update` is the closest existing mutating permission and is already
scoped per domain.

## Services it delegates to

`SuperAdminService` for most of it, plus `PlatformEmailSettingsService` and
`PlatformCommunicationsService` from [[platform-communications]]. The email
service asserts platform identity itself — it did not, and that omission is why
nothing downstream caught the guard failing open.

## Related

- [[platform-auth]] — the guard, the permission map and both defects
- [[platform-communications]] — platform email settings and templates
- [[platform-admin]] — the frontend
- [[BUG-0071]], [[BUG-0072]]
