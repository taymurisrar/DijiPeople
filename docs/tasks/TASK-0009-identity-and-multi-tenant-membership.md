---
TASK_ID: TASK-0009
aliases: [TASK-0009]
TITLE: Identity and multi-tenant membership
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-20
AFFECTED_MODULES: [auth, users, legal, tenant-domains, super-admin, web, admin]
AGENTS: [Architect, Database, Backend/API, Frontend, UI/UX, Security, QA, Reviewer, Integrator]
DEPENDENCIES: origin/develop 844b6d3; TASK-0008 WP-02, WP-04, WP-05
CURRENT_PACKAGE: WP-01
COMPLETED_PACKAGES: []
BLOCKED_PACKAGES: [WP-02]
OWNER_DECISIONS: 2
FINAL_STATUS:
---

# TASK-0009 — Identity and multi-tenant membership

## Objective

Make one person one identity across many workspaces, so the three things
[[TASK-0008]] could not deliver become possible: signing in from
`www.dijipeople.com` without knowing a tenant URL, discovering which workspaces
an email belongs to, and moving between them.

A reader knows this is finished when one set of credentials reaches two tenants,
the JWT is still scoped to exactly one of them, and TASK-0008's WP-06 is
unblocked.

## Why this is a parent rather than a work package

TASK-0008 filed the switcher as WP-06 and marked it `BLOCKED` on [[ITEM-0062]].
That was right, and it understated the size: the switcher is a component, and
what blocks it is the meaning of an identity. `User` is
`@@unique([tenantId, email])` with a required `tenantId`, so the same person in
two workspaces is two rows with two passwords. There is nothing to switch
between.

## The owner's decision, already given

Recorded on [[ITEM-0062]] on 2026-08-19 and not re-opened here:

> **Same email in two tenants is one person.** Build identity + membership;
> sequence it after TASK-0008 WP-02/04/05; and an existing identity made owner
> of a second workspace **reuses its credentials with no activation step**.

All three sequencing prerequisites are `DONE`, so the condition is satisfied.

### What the data says about the migration

A read-only count at the time of the decision: 7 tenants, 19 users, and 5 emails
appearing in more than one tenant — **every one of them a seed identity**
(`ceo@`, `employee@`, `hr@`, `manager@`, `recruiter@dijipeople.local`, each in
the demo tenant and Maseer Tech).

No real customer shares an email across tenants today. So the migration is a
**link**, not a **merge** — and the risk that made this a product decision, that
two same-email rows might be two different people, does not exist in the data
yet. That is the argument for doing it now: it only gets harder once the first
real duplicate appears.

## The shape

**Credentials global, profile and authorisation per tenant.**

```text
Identity (global)              User (per tenant, unchanged in meaning)
  id                             id
  email          @unique         tenantId
  passwordHash                   identityId   <- new, nullable then required
  mfaSecret                      status, roles, employeeId
  emailVerifiedAt                @@unique([tenantId, email])   kept
```

`User` stays tenant-scoped on purpose. It carries `status`, roles,
`businessUnitId` and the employee link, all legitimately per tenant — somebody
disabled at one workspace must stay disabled there while active at another.
Making `User` global would push every one of those onto a membership table and
change every query joining `User` by `tenantId`: the same end state, far larger
blast radius.

**The property that makes this survivable: the JWT stays tenant-scoped.**
`request.user.tenantId` keeps meaning exactly one tenant, `JwtAuthGuard` is
untouched, and no service or RBAC scope changes. Login gains a step in front of
token issuance; nothing behind it moves. Any design that breaks that property is
the wrong design, however elegant it looks.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Publish the legal drafts — the path that had no door | IN_PROGRESS | — | Backend/API, QA | agent/identity-and-membership | — | — | — | — | — |
| WP-02 | `Identity` model, `User.identityId`, expand-phase migration | BLOCKED | schema lease | Database, Backend/API | agent/identity-and-membership | — | — | — | — | — |
| WP-03 | Backfill — one Identity per distinct email, linking same-email rows | NOT_STARTED | WP-02 | Database | agent/identity-and-membership | — | — | — | — | — |
| WP-04 | Authentication split — identity resolution, then tenant selection | NOT_STARTED | WP-03 | Backend/API, Security | agent/identity-and-membership | — | — | — | — | — |
| WP-05 | Workspace discovery by email, rate-limited and non-enumerable | NOT_STARTED | WP-04 | Backend/API, Security | agent/identity-and-membership | — | — | — | — | — |
| WP-06 | Generic login and the workspace picker | NOT_STARTED | WP-05 | Frontend, UI/UX | agent/identity-and-membership | — | — | — | — | — |
| WP-07 | In-app workspace switcher and last-used preference — closes TASK-0008 WP-06 | NOT_STARTED | WP-06 | Frontend, UI/UX | agent/identity-and-membership | — | — | — | — | — |
| WP-08 | Second workspace for an existing identity — no activation step | NOT_STARTED | WP-04 | Backend/API, Integration | agent/identity-and-membership | — | — | — | — | — |
| WP-09 | Contract phase — `identityId` required, legacy auth path removed | NOT_STARTED | WP-04..WP-08 | Database, Backend/API | agent/identity-and-membership | — | — | — | — | — |
| WP-10 | Security review — enumeration, credential stuffing, cross-tenant reach | NOT_STARTED | WP-01..WP-09 | Security | agent/identity-and-membership | — | — | — | — | — |
| WP-11 | QA campaign, browser E2E, review, CI, integration, closure | NOT_STARTED | WP-10 | QA, Reviewer, Integrator, Architect | agent/identity-and-membership | — | — | — | — | — |

**WP-01 is not identity work, and it is here because it was unblocked and
nothing else was.** The owner asked for the legal drafts to be published;
`schema` was exclusively leased by SESSION-0020, so WP-02 could not start.
Taking an independent package rather than waiting is what
[`.agent/context/multi-session.md`](../../.agent/context/multi-session.md) asks
for. This record says so plainly rather than inventing a relationship between
the two.

**WP-02, WP-03 and WP-09 are expand / backfill / contract**, in that order and
in separate deployments, per [`PLANS.md`](../../PLANS.md). `identityId` arrives
nullable, is backfilled, and only becomes required once nothing writes a row
without it. One step would make the migration unrunnable against a populated
database.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | No real customer shares an email across tenants, so the backfill links rather than merges | Read-only count at the ITEM-0062 decision: 5 shared emails, all `@dijipeople.local` seed identities | MEDIUM — true then; must be re-counted immediately before the backfill | A merge would join two different people into one login. WP-03 re-derives this rather than trusting this row |
| A-02 | Nothing outside `auth` creates a `User` without passing through a service that can be taught about `Identity` | To be verified in WP-02 by enumerating `user.create` call sites | MEDIUM | A seed or provisioning path creates users with no identity and the contract phase in WP-09 cannot run |
| A-03 | The JWT can stay tenant-scoped with identity resolution in front of issuance | `JwtAuthGuard` reads `sub` and `tenantId` then calls `loadAccessContext(sub, tenantId)`; nothing in it needs a global identity | HIGH | The blast radius stops being login and becomes every guarded endpoint |
| A-04 | `apps/agent-desktop` and the .NET gateway authenticate through the same `/auth/login` and are affected by any change to it | Per-client JWT issuance keyed on `appClientId` lives in `auth`; the desktop agent has its own client id | MEDIUM | A change that suits the web login breaks attendance capture silently |

## Owner Decisions

| ID | QUESTION | ANSWER | DATE |
|---|---|---|---|
| OD-01 | Is the same email in two tenants one person? | Yes. Build identity + membership. An existing identity made owner of a second workspace reuses its credentials with no activation step. | 2026-08-19 |
| OD-02 | Publish the seeded legal drafts as they stand, or block checkout until they are published? | Publish as-is now. Raised that they carry a "no lawyer has read them" banner and that publishing makes them the operative terms; the owner confirmed. | 2026-08-20 |

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `844b6d3`. `MAIN_SYNC_STATUS = SYNCED`,
`MAIN_CHANGE_STATUS = UNTOUCHED`, both worktrees clean.

POST_TASK_REPO_HEALTH — pending.

## Concurrency

`schema` is exclusively leased by SESSION-0020, which is live and applying
TASK-0008's migrations to the local development database. WP-02 waits on it.
`session.mjs check` returned `SAFE_PARALLEL` for every path WP-01 touches.

## History

- 2026-08-20 — created at `844b6d3`, immediately after TASK-0008 integrated.
- 2026-08-20 — WP-01 started: `legal:publish`, its contract suite, and
  [[ITEM-0068]] for the operator UI the script stands in for.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[ITEM-0062]], [[ITEM-0068]]
- Modules — [[legal]], [[super-admin]]

<!-- GRAPH:END -->
