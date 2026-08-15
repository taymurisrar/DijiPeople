# Decision — Platform admin is a separate identity, not an elevated tenant user

> Generated from repository evidence at `ad8f77f`.

## Decision

DijiPeople's own staff authenticate as **platform users**
(`authSubjectType: 'platform-user'`), a distinct identity from tenant users —
with their own app client, their own secret, their own permission resolution and
their own audit destination.

A platform admin is **not** a tenant user with extra permissions.

## Why

If the two were one identity, every tenant endpoint would become a potential
cross-tenant endpoint, distinguished only by a role check somewhere inside it.
Given that isolation here is
[[decision-tenantid-is-the-isolation-identity|enforced by hand in every query]],
that would multiply the number of places a single omission becomes a
cross-tenant leak.

Keeping them separate means a tenant endpoint can be written on the assumption
that `user.tenantId` is the whole answer, and cross-tenant access lives in
explicitly platform-guarded modules — `super-admin`, `platform-*`, `tenants`.

## Mechanics

- **Per-client JWT secrets** for `web`, `admin` and `agent-desktop`, with the
  token's `appClientId`/`aud` checked against the requesting client. An admin
  token replayed as the `web` client is rejected (verified, C3.03).
- Audit rows carrying `tenantId: 'platform'` route to `PlatformAuditLog` — the
  only string sentinel in the codebase.
- The platform surface authorizes **inside services** rather than through
  decorators, which is a deliberate consequence: on a cross-tenant surface,
  "every reachable method asserts" is the entire model.

## Consequences

- Two auth paths to maintain, and two frontends whose session handling can
  diverge — which it did: [[BUG-0008]] shipped because `apps/web` handled a case
  correctly and hid the gap in `apps/admin`.
- A method that asserts only indirectly is a real risk on the platform surface:
  [[ITEM-0015]].
- The platform permission resolver is a separate mechanism with its own gaps —
  it has no `DELETE` mapping, so every platform `DELETE` route is dead
  ([[BUG-0018]]). It fails closed.

## Related

[[authentication]] · [[rbac]] · [[platform-admin]] · [[multi-tenancy]] ·
pattern [[service-authorization-hidden]]
