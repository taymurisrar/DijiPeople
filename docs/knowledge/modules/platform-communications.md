# Platform Communications

> Generated from repository evidence at `ac17223`, plus the live reproduction
> for [[BUG-0071]] on 2026-08-18.

## Purpose

The platform's **own** outbound email — the configuration DijiPeople sends from,
and the templates it sends. Distinct from [[notifications]], which is the tenant
notification path.

Two services:

- `PlatformEmailSettingsService` — the SMTP/provider configuration, its
  templates, and delivery history.
- `PlatformCommunicationsService` — sending against that configuration.

## The distinction that matters

| | [[notifications]] | Platform Communications |
|---|---|---|
| Sends to | people inside a tenant | customers, prospects, platform operators |
| Configured by | tenant settings | platform settings, one global configuration |
| Reached through | catalog → orchestrator → queue → processor | `PlatformCommunicationsService` |

A domain service must never send email directly. Tenant-facing mail goes through
[[notifications]]; platform-facing mail goes through here.

## Permissions

| Operation | Permission |
|---|---|
| Read settings, templates, deliveries | `settings.read` |
| Change settings or templates | `settings.email.manage` |
| Change stored credentials | `settings.email.credentials` |
| Send a test connection or test email | `settings.email.test` |

`settings.email.credentials` is deliberately separate and is **not** held by
`PLATFORM_ADMIN`. Reading the configuration tells you the host, port, username,
security mode and whether a password is set — never the password.

## Assert platform identity in the service, not only in the guard

`assertPermission` checks `actor.platform?.id` before it checks the permission.
That line exists because it did not.

When `PlatformPermissionsGuard` failed open ([[BUG-0071]]), nothing downstream
caught it: `settings.read` is a permission key that exists in the **tenant**
catalog too, so a tenant administrator reached
`GET /api/super-admin/platform-email` and read the platform's SMTP host, port,
username, security mode and `passwordConfigured` flag. Every sibling
cross-tenant service — `platform-runtime`, `partners`, `support-cases`,
`contracts`, `platform-monitoring` — already asserted identity itself. This one
was the exception, and the exception is what turned a guard bug into a
disclosure.

**The guard is the first of two checks, not the only one.**

## Related

- [[platform-auth]] — the guard and the permission-name collision
- [[super-admin]] — the controller that exposes these services
- [[notifications]] — the tenant path, which this is not
- [[BUG-0071]]
