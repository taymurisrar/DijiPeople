# Requirement — Tenant Workspace Domains

> **Source type: `IMPLEMENTED_REQUIREMENT`.** A written architecture document
> exists — `docs/architecture/workspace-routing-and-domains.md` — and the
> implementation landed in commit `194f233` ("tenant workspace domains"). This
> note summarises the requirement and links back rather than restating it.

## The rule

**A tenant is reached at its own hostname, and a hostname resolves to exactly
one tenant.**

Workspace subdomains are issued under the platform wildcard from the tenant slug
and the tenant base domain, and made primary at provisioning time.

## Enforced during provisioning

Two of the eight provisioning steps exist for this requirement:

- `workspace-slug-reserved` (step 2) — the slug is well formed, unreserved and
  globally unique.
- `workspace-routing-verified` (step 7) — the primary hostname is re-resolved
  and asserted to map back to **this** tenant, before anyone is invited to it. A
  routing check through the resolver the web app actually uses, not a DNS probe.

Both were declared retryable and left unwired, which made every failed
provisioning unrecoverable — [[BUG-0014]], now fixed and pinned by REG-012.

## Isolation

`services/api/test/workspace-domain-isolation.e2e-spec.ts` covers the case that
matters: a hostname must never resolve to a tenant other than its own. This is
[[multi-tenancy]] enforced one layer earlier than the query.

## The unresolved half

The requirement assumes a **single** authoritative tenant base domain. There are
currently two declared sources — a PlatformSetting the admin UI edits, and the
environment variables `packages/config/platform-domains.js` reads — **and the
operator-facing one is inert**.

`platform-domains.js` is consumed by the API and all three Next.js apps, and a
frontend has no Prisma client, so it cannot read a setting. That constraint is
what turns this from a bug fix into an architecture decision.

[[BUG-0017]] is the defect; [[ITEM-0006]] is the ADR it waits on.

## Related

[[tenant-workspace-routing]] · [[tenant-provisioning]] · [[tenant-lifecycle]] ·
[[multi-tenancy]] · [[settings]]
