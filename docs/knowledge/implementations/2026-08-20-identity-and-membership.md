# Identity and Multi-Tenant Membership

**Category:** ARCHITECTURE_CHANGE
**Date:** 2026-08-20
**Branch:** `agent/identity-and-membership`
**Base:** `origin/develop` at `844b6d3`
**Parent:** [[TASK-0009]]
**QA run:** [`2026-08-20-identity-and-membership-3008a13.md`](../../qa/runs/2026-08-20-identity-and-membership-3008a13.md) — PASS WITH RISKS

## What changed, in one sentence

`User` was one account in one tenant with its own password; there is now an
`Identity` behind it, so one person can hold several workspaces with one set of
credentials — **without changing what a JWT means.**

## The decision that made it survivable

Everything else follows from this: **credentials global, profile and
authorisation per tenant.**

```text
Identity (global)                 User (per tenant, unchanged in meaning)
  email          @unique            tenantId
  passwordHash                      identityId   <- new
  status, lockout                   status, roles, businessUnitId, employeeId
  lastUsedTenantId                  @@unique([tenantId, email])   kept
```

`User` stays tenant-scoped because `status`, roles, `businessUnitId` and the
employee link are all legitimately per tenant — somebody disabled at one
workspace must stay disabled there while active at another. Making `User` global
would have pushed every one of those onto a membership table and changed every
query joining `User` by `tenantId`: the same end state, far larger blast radius.

**The JWT stays tenant-scoped.** `request.user.tenantId` still means exactly one
tenant, `JwtAuthGuard` is untouched, and no service or RBAC scope changed. Login
gained a step in front of token issuance; nothing behind it moved. That was
assumption A-03, and any design breaking it would have been the wrong design
however elegant — it is the difference between changing login and changing every
guarded endpoint in 67 modules.

## Expand, backfill, contract — and why only two shipped

Three migrations, three deployments:

| | | |
|---|---|---|
| `20260820090000` | expand | `Identity`, `User.identityId` nullable |
| `20260820100000` | backfill | one Identity per email, every User linked |
| *not shipped* | contract | `identityId NOT NULL` |

The contract phase is written and was run by hand in both directions — it
refuses with a count before `ALTER TABLE` produces its unhelpful error, and
succeeds once the backfill has run. **It is deliberately not in the branch.**

After the contract phase, rolling the *code* back leaves the old build unable to
create users at all: it does not write `identityId` and the column no longer
permits null. A rollback that breaks user creation is worse than whatever it was
rolling back from. Merging all three together would put them in one release and
lose that safety, so the contract phase waits until expand and backfill are
live.

## The credential merge has a victim, and it was measured

The owner decided that the same email in two tenants is one person. That has a
consequence nobody stated when the decision was made: where those rows carry
**different password hashes**, one of those passwords stops working.

Measured read-only against the development database before writing a line: 19
users, 14 distinct emails, 5 shared — and **four of the five carried two
different hashes.** All were `@dijipeople.local` seed identities and no real
customer was affected, which is precisely the argument for doing it then rather
than after the first real one appears.

**The rule: keep the credential they most recently signed in with.**
`passwordChangedAt` could not break the tie — identical across both rows of
every duplicate, because the seed wrote them together. `lastLoginAt` could, and
it is the only tie-break about the *person* rather than about row order: the
password they last used successfully is the one they are most likely to still
know.

Lockout carries forward at its most restrictive — `MAX` across the merged rows,
not the winner's values. A merge must not forgive an attack in progress.

## Two predicates that look obvious and are wrong

**"Does an identity exist?"** — the natural test for "has this person already
got credentials", and it silently locks people out. Both provisioning paths
create identities with an unguessable placeholder, so an identity can exist for
somebody who has never set a password. Reuse that when adding them to a second
workspace and you create an `ACTIVE` account nobody can open, while suppressing
the activation email that was their only way in. The right question is **"has
this person activated somewhere"**, evidenced by an `ACTIVE` `User` in another
tenant.

**"Which workspaces does this email reach?"** — the natural shape for a
discovery endpoint, and a customer-enumeration oracle no rate limit fixes. Feed
it company addresses and the answers map the customer base. The fix is not
throttling; it is **requiring the password**, so the only caller who learns
anything is the person the answer is about. Timing matters too: the bcrypt
compare runs even when no identity exists, against a fixed hash, because
skipping it makes the unknown-address case measurably faster.

## Where the guards live

Two invariants carry rules that would otherwise be conventions, and both assert
a **minimum count first** so they cannot pass by finding nothing:

- `user-creation-links-identity.invariant.spec.ts` — every `user.create` sets
  `identityId`, every password write reaches the identity, and exactly one
  implementation of each exists. Brace-matches each call rather than grepping
  the file, because a regex happily matches the `identityId` in a neighbouring
  `userRole.create`.
- The backfill's own `DO $$ … RAISE EXCEPTION` — refuses to finish having
  half-linked the data.

The contract phase is safe to write *only* because the first of those exists.
Without it, that migration is a bet.

## What is still open

- [[ITEM-0069]] — the global lockout can be triggered from the public discovery
  endpoint, so twenty unauthenticated requests can lock a known address out of
  every workspace for an hour. A deliberate trade rather than an oversight, and
  still worth fixing.
- TASK-0009 WP-09 — the contract phase. Eleven e2e suites create `User` rows
  directly and will need identities when it lands.
- `User.passwordHash` remains, and `resolveLoginCredential` still falls back to
  it. That fallback is load-bearing during the transition and is also a second
  credential path that must eventually go.

## Related

[[ITEM-0062]] · [[ITEM-0060]] · [[ITEM-0068]] · [[ITEM-0069]] · [[TASK-0008]] ·
[[authentication]] · [[platform-auth]] · [[tenant-control-plane]] ·
[[assertion-without-a-check]] · [[borrowed-fixture-dependency]]
