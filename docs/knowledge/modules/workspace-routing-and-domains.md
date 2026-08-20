# Workspace Routing and Domains

> Generated from repository evidence at `b1c09ac`.

## Purpose

Deciding which tenant workspace a request belongs to, from the hostname it
arrived on. This is the front door of the tenant product, so its trust rules are
security rules.

## Scope

`services/api/src/modules/tenant-domains/` —

| File | Responsibility |
|---|---|
| `request-hostname.ts` | The hostname the request actually arrived on |
| `workspace-resolution.service.ts` | Hostname to workspace |
| `tenant-domain.service.ts` | Domain records and their lifecycle |
| `workspace.controller.ts` | `/api/workspaces` — `resolve`, `mine`, `access-check` |

`apps/web/proxy.ts` is the tenant-web counterpart.

## The trust rule, and why it exists

In production the API sits behind a proxy, so the browser's hostname arrives in
`X-Forwarded-Host` while `Host` holds the internal address. In development — and
for anything that can reach the API directly — the opposite is true, and
`X-Forwarded-Host` is then **an attacker-controlled string**.

So `resolveRequestHostname()` trusts the forwarded chain **only** when the
deployment declares a proxy in front (`TRUST_PROXY_HEADERS`, or Express's own
`trust proxy` which `main.ts` configures). Otherwise `Host` wins. `Forwarded:`
per RFC 7239 is read first, taking only the first element — the hop closest to
the client.

Two properties keep the blast radius small even if the header is wrong:

- **Nothing reads a tenant id from a header.** The hostname is the only routing
  input, and it is resolved against the database.
- A caller who lies about the host can therefore only ask about a workspace it
  could already ask about. Routing is not authorization.

## Known gap

[[ITEM-0044]] — `apps/web/proxy.ts` prefers `x-forwarded-host` for every request
*unconditionally*, while the API applies the trusted-proxy rule above. The two
sides of the same boundary do not agree. API authorization limits the impact,
but workspace classification, branding and discovery should not trust the header
either. The fix is to reuse the existing trust rule rather than invent a second
one — a second source of truth for "is this proxy trusted" is how the two drifted
apart in the first place.

[[ITEM-0045]] — the tenant-web root-domain environment examples disagree with
each other, which is how a misconfigured deployment reaches the ambiguity above.

## Related

[[tenant-isolation]] · [[tenant-provisioning]] · [[tenant-application]] ·
[[ITEM-0044]] · [[ITEM-0045]]
