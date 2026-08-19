---
ID: ITEM-0062
aliases: [ITEM-0062]
Title: No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist
Type: ARCHITECTURE
Status: READY
Priority: P1
Severity: HIGH
AffectedModules: [auth, users, tenant-domains, web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
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

## History

- 2026-08-19 — found at `7480756` while starting WP-06, which had been scoped as
  a frontend switcher over an existing `/workspaces/mine`. The endpoint exists;
  it returns a one-element array by construction. TASK-0008's reconciliation had
  marked "Central login and workspace discovery" and "Workspace picker" BUILT on
  the strength of the pages existing — the third and fourth rows corrected for
  the same reason as the first two: presence of code read as presence of
  behaviour.
