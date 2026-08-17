# ADR-0002 — Configuration is the single source of the tenant base domain

## Status

Accepted — 2026-08-17

Supersedes the implicit arrangement described in
[`BUG-0017`](../bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md).
Closes [`ITEM-0006`](../backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md).

## Context

The tenant base domain — the apex under which every workspace hostname is issued,
as `<slug>.<base domain>` — had **two declared sources**:

1. A `tenant-provisioning` PlatformSetting row, editable from
   `/settings/tenant-provisioning` in the admin console.
2. The environment variables read by `getPlatformDomainConfig()` in
   `packages/config/platform-domains.js` — `TENANT_BASE_DOMAIN`,
   `NEXT_PUBLIC_TENANT_BASE_DOMAIN`, and three older aliases.

Hostname issuance went through `buildWorkspaceHostname()` →
`getPlatformDomainConfig()`, which reads **environment only**. So the
operator-facing control was inert: changing it in admin changed nothing, and
provisioning still failed at the `workspace-domain` step unless the environment
variable was present in the API process.

That is the shape of a defect this codebase has hit repeatedly — two places
declaring the same fact, one of them ignored, and nothing reporting the
divergence.

## Decision

**Configuration is the single source of truth for the tenant base domain. The
PlatformSetting key is retired.**

The admin console displays the resolved base domain as a **read-only** value and
submits only `wildcardDnsReady`, which is a genuinely operational fact an operator
asserts once DNS, proxy and TLS are live.

## Why configuration rather than the database

This is the part worth recording, because the reverse looks more attractive at
first glance — an operator-editable domain sounds like the more flexible design.

**The edge router resolves hostnames with no database access.** An incoming
request is matched to a tenant by its hostname before any tenant context exists,
and therefore before there is anything to query. A value the router must read on
every request cannot live behind a database lookup that the router is not in a
position to make.

Making the setting authoritative would therefore have required either giving the
router a database dependency on the hot path, or accepting a cache that can
disagree with the setting — which is the same divergence in a new place.

The corollary is accepted deliberately: **changing the tenant base domain is a
deployment-time change, not a runtime one.** It is also a change that invalidates
every existing workspace hostname, so it is not an action that should be one
click away in a console.

## Consequences

- Changing the base domain requires updating `TENANT_BASE_DOMAIN` and
  redeploying. This is correct for a change of that blast radius.
- A stale `tenantBaseDomain` key may still sit in the `tenant-provisioning`
  setting JSON in deployments that saved one before this decision. It is ignored.
  `tenant-provisioning.service.spec.ts` asserts configuration wins even when such
  a value is present, because the failure mode is a future reader noticing the
  key and helpfully wiring it back up.
- `buildWorkspaceUrl()` no longer carries a loopback literal for its development
  branch; it resolves through `getAppOrigin("web")`, which throws in production
  when unconfigured rather than silently emitting a localhost link
  ([`ITEM-0017`](../backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md)).

## Alternatives considered

**Make the PlatformSetting authoritative and have configuration follow it.**
Rejected: the router cannot read the database at hostname-resolution time, so
this needs a cache, and a cache that can disagree with its source is the original
defect wearing a different hat.

**Keep both and synchronise them.** Rejected outright. Two sources plus a
synchroniser is three things to get wrong instead of two, and nothing would have
reported a failed synchronisation.

**Keep the control and make it advisory.** Rejected: a control that does not
control anything is what caused this record to be filed.
