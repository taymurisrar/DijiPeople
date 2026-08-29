# Settings

> Generated from repository evidence at `ad8f77f`.

## Purpose

How a tenant configures the product without a code change. This is the mechanism
that makes DijiPeople a configurable product rather than a per-client build —
**tenant-specific behaviour belongs here, never in a code branch keyed on a
tenant name or id.**

## The modules

`tenant-settings`, `settings-runtime`, `customization`, `lookups`, `views`,
`navigation`, `platform-runtime`. On the frontend,
`apps/web/app/(authenticated)/settings/_lib/`.

`docs/architecture/settings-and-branding.md` is the **canonical contract** for
settings, branding and formatting. Read it before touching any settings surface.

[[settings-and-configuration]] is the mechanism as it actually behaves at
`eb457d9d` — the six stores and the registries whose names collide with them,
the four-layer resolution order, the two caches, and the seven traps that make a
setting save successfully and change nothing. **Read it before concluding that a
setting is broken**; the most common answer is that the key has no reader.

## Important business rules

- Settings, branding and regional formatting resolve through the settings
  runtime. Dates, numbers and currency go through the shared formatting helpers
  so tenant regional settings actually apply.
- Colours come from tenant CSS variables. Hardcoding a brand colour defeats the
  whole mechanism.
- Feature availability is derived from the tenant's plan and subscription. **A
  plan-excluded module cannot be enabled by override** — verified by scenario
  2026-08-15.

## Known bugs

[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]] — VERIFIED, HIGH.

`GET /tenant-settings/features/availability` declared no permission and called
the same service method as the `settings.read`-gated
`GET /tenant-settings/features`. Because `PermissionsGuard` returns `true` when
neither permission family is declared, it was an **open alias** for a gated
route — and its payload also carried `subscription.finalPrice`.

Two lessons: **two paths to one capability must be gated together**, and the
payload of a settings endpoint is not automatically as public as the setting.
Pattern: [[duplicate-route-bypass]].

## A settings control that does nothing

[[BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance]] — OPEN.
The `tenant-provisioning` PlatformSetting for the tenant base domain is read by
the provisioning service and **ignored by the resolver that actually issues
hostnames**. The architecture decision it waits on is [[ITEM-0006]].

An operator-facing control with no effect is worse than a missing one: the
failure it produces gives no hint that the setting was ignored.

## Related

[[runtime-module-system]] · [[rbac]] · [[tenant-application]] ·
[[tenant-workspace-routing]] · [[billing]] · [[multi-tenancy]]
