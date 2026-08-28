---
ID: ITEM-0062
aliases: [ITEM-0062]
Title: No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist
Type: ARCHITECTURE
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [auth, users, tenant-domains, web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-29
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
TargetMilestone: 
BlockedBy: 
---

# ITEM-0062 — No multi-tenant membership: one user belongs to one tenant, so discovery and switching cannot exist

## Summary

`User` is `@@unique([tenantId, email])` and carries a required `tenantId`. The
same person in two workspaces is **two unrelated User rows with two passwords**.
There is no membership model — no `TenantMembership`, no `UserTenant`, nothing
that links one identity to several tenants.

Three requirements of the self-service brief rest on that model existing, and
none of them can work without it:

- **Generic login.** `AuthService` refuses to authenticate without tenant
  context: `AUTH_TENANT_REQUIRED — 'Company or tenant context is required to
  sign in.'` The brief asks for the opposite — *"Generic login must not ask for
  tenant URL unless actually necessary… Email → membership discovery →
  automatic redirect or workspace picker."*
- **Workspace picker.** `/workspaces/mine` reads `user.tenantId` from the
  session and returns that one tenant. The picker page at
  `apps/web/app/workspace/choose/` renders correctly and can only ever have one
  thing to choose from.
- **Workspace switcher.** Nothing to switch between, for the same reason.

## Why It Matters

This is the difference between a login that works and a login that works *the
way the brief describes*. Today's flow is not broken: the hostname carries the
tenant, so `maseer.dijipeople.com` authenticates fine, and a user who knows their
workspace URL never notices. What fails is the case the brief opens with — a
visitor clicking **Login** on `www.dijipeople.com` with no tenant in hand.

It also caps the product. A customer with two workspaces — the brief's own
`Maseer Group → Main HR Tenant + Subsidiary Tenant` example — gives their
administrator two accounts and two passwords, and no way to move between them.

Filed `PRODUCT_DECISION` rather than as a bug, because the current design is
coherent and deliberate-looking, and replacing it is not a defect fix. It changes
what an identity *is*.

## Evidence

Verified at `7480756`.

- `schema.prisma` — `User.tenantId String` (required), `@@unique([tenantId, email])`.
- No membership model: `grep -n "model TenantMembership\|model UserTenant\|model Membership" schema.prisma` returns nothing.
- `auth.service.ts:1284` — refuses login when `tenantSlug`, `tenantCode`,
  `domain` and `host` are all absent.
- `workspace-resolution.service.ts:157` — `listWorkspacesForUser` does
  `tenant.findUnique({ where: { id: user.tenantId } })` and returns
  `{ workspaces: [workspace] }`. A single-element array by construction.

## Proposed Approach

**Needs an ExecPlan and an owner decision before any code.** It touches
authentication, the JWT, and the meaning of `tenantId` on every request — the
single most load-bearing value in the system.

The shape, if it is approved:

1. A membership model joining a global identity to many tenants, with a role per
   membership.
2. Authentication split into *identity* (who are you, resolved by email) and
   *tenant selection* (which of your workspaces), so a token is issued **after**
   the workspace is chosen and remains tenant-scoped exactly as it is now.
   `JwtAuthGuard` and every service reading `user.tenantId` must be unaffected —
   that is the property that makes this survivable.
3. Migration for existing users: one membership per current `User` row, and a
   decision about whether same-email rows in different tenants are the same
   person. **They may not be**, and merging them would be a cross-tenant data
   leak, so the safe default is not to merge.
4. Discovery and switching then become the thin frontend work the brief assumes.

Step 3 is the risk. Everything else is mechanical.

## Owner decision — 2026-08-19

**Same email in two tenants is one person.** Build identity + membership;
sequence it after TASK-0008 WP-02/04/05; and an existing identity made owner of
a second workspace **reuses its credentials with no activation step**.

### What the data says about the migration

Read-only count against the development database at the time of the decision:
7 tenants, 19 users, and **5 emails appearing in more than one tenant — every
one of them a seed identity**:

| email | tenants |
|---|---|
| `ceo@dijipeople.local` | DijiPeople Demo Company *(seed-demo)*, Maseer Tech |
| `employee@dijipeople.local` | same pair |
| `hr@dijipeople.local` | same pair |
| `manager@dijipeople.local` | same pair |
| `recruiter@dijipeople.local` | same pair |

**No real customer currently shares an email across tenants.** The risk that
made this a product decision — merging two rows that might be two different
people — does not exist in the data yet. That is the argument for doing it now
rather than later: today the migration is a *link*, not a *merge*, and it only
gets harder once the first real duplicate appears.

Step 3 above is therefore downgraded from "the risk" to "the reason to hurry".

### Why `User` stays tenant-scoped

`User` carries `status`, roles, `businessUnitId` and the employee link, all
legitimately per tenant — somebody disabled at one workspace must stay disabled
there while active at another. Making `User` global would push every one of
those onto a membership table anyway and change every query joining `User` by
`tenantId`: the same end state, far larger blast radius.

So the split is **credentials global, profile and authorisation per tenant**:

```text
Identity (global)              User (per tenant, unchanged in meaning)
  id                             id
  email          @unique         tenantId
  passwordHash                   identityId   <- new
  mfaSecret                      status, roles, employeeId
  emailVerifiedAt                @@unique([tenantId, email])   kept
```

The property that makes this survivable: **the JWT stays tenant-scoped**.
`request.user.tenantId` keeps meaning exactly one tenant, `JwtAuthGuard` is
untouched, and no service or RBAC scope changes. Login gains a step in front of
token issuance; nothing behind it moves.

### Second workspace for an existing identity

No activation token and no new password. They have already proved who they are,
so provisioning creates the `User`, links it to the existing `Identity`, and
sends "your new workspace is ready" — which is also what the brief asks for:
*"If the Owner identity already exists, do not unnecessarily force password
recreation."*

## Acceptance Criteria

To be set with the ExecPlan. At minimum, whatever is built must keep: a token
scoped to exactly one tenant; no cross-tenant read possible from a membership
list; and no automatic merging of same-email identities across tenants without
an explicit, evidenced decision.

## Dependencies

Blocks TASK-0008 WP-06 entirely. Does not block WP-02, WP-03, WP-04, WP-05.

## Related Items

[[TASK-0008]]

## Correction — 2026-08-22, SESSION-0040

**This record's premise is out of date, and the gap it describes is largely
closed.** It was verified at `7480756`; [[TASK-0009]] has since built the thing
it says does not exist.

The membership model is `Identity`, and it is the shape this record proposed:

```
Identity   global, `email @unique`, holds passwordHash, lockout and
           lastUsedTenantId
   |
   +-- users User[]     one User row per tenant, exactly as before
```

That is "a membership model joining a global identity to many tenants, with a
role per membership" — step 1 of the Proposed Approach — under a different name.
Step 2 landed with it: `loginWithoutWorkspace` verifies the credential against
the `Identity`, issues **no token**, and returns the workspaces it reaches; the
caller then signs in to a chosen one. `JwtAuthGuard` and every one of the ~2,290
reads of `user.tenantId` across 131 files are untouched, which is the property
this record identified as the one that makes the change survivable.

Verified rather than read: six e2e suites, 37 tests, all passing on `develop` —
`identity-login`, `identity-model`, `identity-second-workspace`,
`identity-backfill`, `workspace-discovery`, `workspace-discovery-auth`.

The frontend exists too: `apps/web/app/workspace/choose/page.tsx` and
`app/components/workspace-switcher.tsx`. `listWorkspacesForUser` now returns
every tenant reachable from the identity, not a single-element array — and falls
back to the session's own tenant for a row the backfill has not reached, which
is the honest answer rather than an empty list that would strand somebody signed
in perfectly well.

Two things this record raised were answered along the way, and both are worth
keeping:

- **Same-email rows in different tenants may not be the same person.** The
  record called merging them a cross-tenant leak and said the safe default is
  not to merge. That is what the backfill does.
- **Discovery is a weapon if it shares the credential lock.** Not in this record,
  but found while building it: twenty unauthenticated requests to the public
  discovery endpoint could lock a known address out of every workspace for an
  hour. `Identity` now carries a separate `discoveryFailedAttempts` counter
  (ITEM-0069), so blocking discovery costs the victim the generic login screen
  and nothing else.

### What actually remains

One work package: **WP-09, the contract migration** making `User.identityId`
`NOT NULL`. It is written and proven — it refuses before altering, naming how
many rows have no identity, rather than leaving an operator with
`ALTER TABLE ... SET NOT NULL` and no idea which rows.

It is held back **on purpose**, and the reason is not caution about the
migration: expand, backfill and contract must reach production in *separate
deployments*. After the contract phase, rolling the **code** back leaves the old
build unable to create users at all — it does not write `identityId` and the
column no longer permits null. A rollback that breaks user creation is worse
than whatever it is rolling back from.

Its remaining cost, stated in the task record: eleven e2e suites create `User`
rows directly and will need identities when it lands.

### The gate is now cleared, with one thing unverified

`main` is `3602ec3` and carries the `Identity` model. Production `/api/health`
reports `commit: 3602ec3` — so the expand and backfill **code** is live, which
was WP-09's stated precondition.

What is **not** verified from here is whether the backfill *migration* actually
applied to the production database. That is not a quibble: [[BUG-0086]] is
exactly the failure where `prisma migrate deploy` aborts inside
`preDeployCommand` on `P1002`, so a deploy can carry new code while its
migrations never ran. Confirming it needs `prisma migrate status` against
production, or a count of `User` rows with a null `identityId` — neither of
which this environment can reach.

**So the open question is no longer architectural.** It is: has the backfill
landed in production, and when should the contract phase ship its own deployment?

## Superseded sections

Everything above this correction describes the state at `7480756` and is kept
because the analysis is still the analysis — the record was right about what was
needed and what the risk was. It is simply no longer a description of the code.

## History

- 2026-08-19 — found at `7480756` while starting WP-06, which had been scoped as
  a frontend switcher over an existing `/workspaces/mine`. The endpoint exists;
  it returns a one-element array by construction. TASK-0008's reconciliation had
  marked "Central login and workspace discovery" and "Workspace picker" BUILT on
  the strength of the pages existing — the third and fourth rows corrected for
  the same reason as the first two: presence of code read as presence of
  behaviour.


## Closed — 2026-08-29

The open question the 2026-08-22 correction left was not architectural. It was:
**has the backfill landed in production, and when should the contract phase ship
its own deployment?** Both halves now have answers.

It had landed. `prisma migrate status` against production reported 217 of 217
applied on 2026-08-22 — recorded in that day's engineering history, and the
thing the correction above says it could not reach from where it was written.

The contract phase shipped on 2026-08-29 as TASK-0009 WP-09, the last of that
task's twelve packages. `User.identityId` is `NOT NULL`; one identity reaches
several workspaces with one credential; and that is asserted end to end in
`identity-contract.e2e-spec.ts` rather than inferred from the schema.

**Worth keeping, because it nearly cost a rebuild.** Asked what to do about this
record, the repository owner answered "build it" — reasonably, because the
record's Summary and Evidence still describe the world at `7480756` and say the
membership model does not exist. The correction that says otherwise is six
sections further down. A record whose opening contradicts its own middle will be
read from the top and acted on from the top; that is what "measure a record
before implementing against it" means in practice, and it is why this closure is
at the end of the record and its status is in the frontmatter, where a reader and
a generator both meet it first.

Nothing in the Proposed Approach was wrong. It was simply built, under a
different name — `Identity` rather than `TenantMembership` — before this record
was read again.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]], [[workspace-routing-and-domains]], [[tenant-application]]
- Implementation — [[TASK-0009-identity-and-multi-tenant-membership]]

<!-- GRAPH:END -->
