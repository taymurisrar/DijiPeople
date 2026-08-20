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
CURRENT_PACKAGE: WP-06
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-12]
BLOCKED_PACKAGES: []
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
| WP-01 | Publish the legal drafts — the path that had no door | DONE | — | Backend/API, QA | agent/identity-and-membership | pending | PASS | ITEM-0068 | NOT_RUN | NOT_STARTED |
| WP-02 | `Identity` model, `User.identityId`, expand-phase migration | DONE | — | Database, Backend/API | agent/identity-and-membership | pending | PASS | — | NOT_RUN | NOT_STARTED |
| WP-03 | Backfill — one Identity per distinct email, linking same-email rows | DONE | WP-02 | Database | agent/identity-and-membership | pending | PASS | — | NOT_RUN | NOT_STARTED |
| WP-12 | Every user-creation path writes an Identity | DONE | WP-03 | Backend/API, Database | agent/identity-and-membership | pending | PASS | — | NOT_RUN | NOT_STARTED |
| WP-04 | Authentication split — identity resolution, then tenant selection | DONE | WP-12 | Backend/API, Security | agent/identity-and-membership | pending | PASS | — | NOT_RUN | NOT_STARTED |
| WP-05 | Workspace discovery — every workspace the identity reaches | DONE | WP-04 | Backend/API, Security | agent/identity-and-membership | pending | PASS | — | NOT_RUN | NOT_STARTED |
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

**WP-12 was not in the original decomposition, and its id is out of order
because ids are allocation order rather than execution order.** It was found
while writing WP-03: the backfill runs before any seed on a fresh environment,
so it is a no-op there, and every account created afterwards would carry a null
`identityId` while the column stayed nullable. Writing the backfill without it
would have produced data that diverges from the moment it lands. It is
sequenced immediately after WP-03 and before WP-04, because identity resolution
cannot read a column that is not reliably written.

**WP-02, WP-03 and WP-09 are expand / backfill / contract**, in that order and
in separate deployments, per [`PLANS.md`](../../PLANS.md). `identityId` arrives
nullable, is backfilled, and only becomes required once nothing writes a row
without it. One step would make the migration unrunnable against a populated
database.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | No real customer shares an email across tenants, so the backfill links rather than merges | **RE-DERIVED in WP-03**, read-only against the development database: 19 users, 14 distinct emails, 5 shared, all `@dijipeople.local`. Still true — but **4 of the 5 carry two different password hashes**, so the merge does discard a credential | HIGH | A merge would join two different people into one login. The selection rule is what makes it defensible |
| A-02 | Nothing outside `auth` creates a `User` without passing through a service that can be taught about `Identity` | **VERIFIED in WP-02.** Four `user.create` call sites, all reachable: `super-admin.service.ts:1137`, `tenant-access.service.ts:187`, `users.repository.ts:773`, `seed-demo.ts:840`. Small enough to teach individually in WP-04 | HIGH | A seed or provisioning path creates users with no identity and the contract phase in WP-09 cannot run |
| A-03 | The JWT can stay tenant-scoped with identity resolution in front of issuance | `JwtAuthGuard` reads `sub` and `tenantId` then calls `loadAccessContext(sub, tenantId)`; nothing in it needs a global identity | HIGH | The blast radius stops being login and becomes every guarded endpoint |
| A-04 | `apps/agent-desktop` and the .NET gateway authenticate through the same `/auth/login` and are affected by any change to it | Per-client JWT issuance keyed on `appClientId` lives in `auth`; the desktop agent has its own client id | MEDIUM | A change that suits the web login breaks attendance capture silently |

## Owner Decisions

| ID | QUESTION | ANSWER | DATE |
|---|---|---|---|
| OD-01 | Is the same email in two tenants one person? | Yes. Build identity + membership. An existing identity made owner of a second workspace reuses its credentials with no activation step. | 2026-08-19 |
| OD-02 | Publish the seeded legal drafts as they stand, or block checkout until they are published? | Publish as-is now. Raised that they carry a "no lawyer has read them" banner and that publishing makes them the operative terms; the owner confirmed. | 2026-08-20 |

## WP-02 — the expand-phase migration, and how it was verified

`20260820090000_identity_and_membership_expand` adds one enum, one table, one
nullable column, two indexes and two foreign keys. Everything additive, nothing
dropped, `identityId` nullable — so it applies to a populated database with no
backfill in front of it.

**Hand-written, not generated, and that needs justifying.** `prisma migrate dev`
and `prisma migrate diff` both emit [[ITEM-0060]]'s pre-existing drift alongside
the real change, so a generated script here would have carried 204 unrelated
statements — including 16 `DROP INDEX` — into production. TASK-0008 WP-01 hit
the same thing and made the same choice.

Hand-writing SQL means the schema and the migration can silently disagree, so
the verification is the deliverable, not the file:

| Check | Result |
|---|---|
| `prisma validate` | valid |
| Apply the whole committed history to an empty database | all migrations applied |
| `\d "Identity"` against that database | matches the model column for column, including both foreign keys |
| Drift, database vs `schema.prisma` | **204 statements, none mentioning `Identity`** |
| Same measurement at `origin/develop` without this migration | **204** |

204 before and 204 after is the assertion that matters: Prisma sees nothing to
add or alter for anything this migration created, so the SQL and the schema
agree, and the change contributed nothing to the drift pile.

**How that measurement was first got wrong.** Two earlier readings used
`--from-url`, which Prisma 7.9 removed. With stderr redirected the command
printed nothing and the count read as **zero drift** — a silent false clean on
the exact command [[ITEM-0060]] documents. The correct flags were in that record
all along; they were not read before being recalled from memory. Written up on
ITEM-0060 with `--exit-code`, so an error (1) can no longer be mistaken for an
empty diff (0).

`identity-model.e2e-spec.ts` asserts the three properties WP-03 and WP-09 depend
on, at the database rather than in the schema, because `@relation(onDelete:)` is
a claim about a foreign key and the foreign key is what enforces it: the global
unique on email, `Restrict` on `User.identityId`, and `SetNull` on
`lastUsedTenantId`. Mutation-checked by flipping `Restrict` to `Cascade` in both
the schema and the SQL and rebuilding the database — one test fails, and the
one that fails is the one asserting a person cannot be deleted out from under
their workspace accounts.

## WP-03 — the backfill, and the credential it has to throw away

One `Identity` per distinct `lower(trim(email))`, then every `User` linked. The
mechanics are four statements; the decision inside them is the package.

**The owner's decision has a consequence nobody stated.** "Same email in two
tenants is one person" means that when those rows carry different password
hashes, one of those passwords stops working. Re-derived read-only against the
development database before writing a line: 19 users, 14 distinct emails, 5
shared — and **four of the five carry two different hashes.** All are
`@dijipeople.local` seed identities and no real customer is affected, which is
the argument for doing this now rather than after the first one appears.

**The rule: keep the credential they most recently signed in with.**
`passwordChangedAt` cannot break the tie — it is identical across both rows of
every duplicate, because the seed wrote them together. `lastLoginAt` can, and it
is the only tie-break that is about the person rather than about row order: the
password they last used successfully is the one they are most likely to still
know. Ordering is `lastLoginAt`, `passwordChangedAt`, `createdAt`, all `DESC
NULLS LAST`, which cannot end in a tie and gives the same answer in every
environment.

**Lockout carries forward at its most restrictive** — `MAX(failedLoginAttempts)`
and `MAX(lockedUntil)` across the merged rows, not the chosen row's values. A
merge must not forgive an attack in progress; taking the winner's clean counters
would hand an attacker a reset for doing nothing but waiting for a deployment.
`User.status` deliberately does **not** carry forward: being disabled at one
workspace says nothing about the others.

`identity-backfill.e2e-spec.ts` reads `migration.sql` off disk and executes it,
rather than reimplementing it in TypeScript — a reimplementation is what gets
tested while the shipped SQL is what runs. Seven assertions; three mutations
tried, three caught:

| Mutation | Result |
|---|---|
| `NULLS LAST` dropped from the `lastLoginAt` ordering | 1 failed — the never-signed-in credential wins, because PostgreSQL sorts NULL highest on `DESC` |
| Merged `failedLoginAttempts` replaced with `0` | 1 failed — the lockout carry-forward |
| The unlinked guard removed | see below |

**On that guard, precisely.** It raises if any `User` is left unlinked. No input
was found that makes the full script produce that state — every `User` has a
non-null email, every distinct normalised email gets an `Identity`, and the
`UPDATE` matches on the same expression. So it is a backstop for the assumption
breaking later, not for a case reachable today. Rather than claim it is proven
by the script, the test aims the guard text at a deliberately unlinked row and
asserts it raises, then links the row and asserts it passes.

Re-runnable: `ON CONFLICT DO NOTHING` and an `UPDATE` restricted to rows still
`NULL`. `DO UPDATE` would be wrong once the auth split lands — an identity's
password can then change independently of any `User` row, and a re-run would
silently roll it back from stale data.

**What this does not do, and WP-04 must.** On a *fresh* environment the backfill
runs before any seed, so it is a no-op, and `seed:demo` then creates users with
`identityId` still null. The four `user.create` call sites verified under A-02
have to learn about `Identity` before WP-09 can make the column required.

## WP-12 — every user-creation path writes an Identity

Four call sites, verified under A-02 and all four now linking:
`users.repository.ts` (the path almost every account takes),
`super-admin.service.ts`, `tenant-access.service.ts`, and `seed-demo.ts`.

`IdentityService.ensureForEmail` is the single decision point, and its rule is
the owner's decision made mechanical: **an existing identity keeps its
credential.** Both provisioning paths mint an unguessable placeholder for the
`User` row they are about to create; writing that over a real password would
lock somebody out of the workspace they already had — by an action taken in
another tenant, on their behalf, that they never saw. It is also what makes
OD-01's *"reuses its credentials with no activation step"* true rather than
aspirational.

It takes a transaction client because two of the three service callers create
inside `$transaction`, and an identity that survives a rolled-back user creation
is an orphan that then blocks that address from ever being provisioned again.

**It is a plain function, not an injectable service, and that was learned the
hard way.** The first version was an `@Injectable()` that `UsersRepository` took
in its constructor. That broke every module providing `UsersRepository` on its
own — `TenantsModule` does — with *"Nest can't resolve dependencies of the
UsersRepository"*, and it took **eight e2e suites and 137 tests** down. The
available fix was to import `UsersModule` into each affected module; the better
one was to stop needing wiring at all. A function taking the db client it should
write through has no DI surface, and the seed scripts, which run outside the
Nest container entirely, call exactly the same implementation instead of
carrying a copy of the rule that drifts.

Worth stating because the failure looked like a test-environment problem rather
than a design one: the suites that broke were `attendance-engine` and friends,
which have nothing to do with identity and simply build `AppModule`.

`user-creation-links-identity.invariant.spec.ts` is the mechanical guarantee.
`identityId` is nullable through the expand phase, so a call site that forgets
produces a working user, a green suite and a clean deploy — and stays invisible
until WP-09 tries to make the column required and finds accounts it cannot fill.
The scan brace-matches each `user.create(` call rather than grepping the file,
because a regex would happily match the `identityId` in a neighbouring
`userRole.create`. It asserts a minimum call-site count first, so a rename
cannot turn it inert. Mutation-checked by removing `identityId` from
`super-admin.service.ts`: one test fails, naming the file.

The invariant also pins that there is exactly **one** implementation: every
caller imports `ensureIdentityForEmail`, none redefines it, and none calls
`identity.update`. That last one matters after the auth split, when an
identity's password changes independently of any `User` row — a provisioning
path pushing its placeholder into an update would lock somebody out of a
workspace they already had.

**Two things this got wrong first, both kept.**

A constructor parameter was inserted into the middle of `SuperAdminService`'s
argument list, which `super-admin.service.spec.ts` builds positionally. Every
later dependency shifted by one and the failure surfaced as
`this.auditService.log is not a function` — pointing at audit, several layers
from the cause. Moot once the service became a function, but the lesson stands
for the next positional constructor.

The invariant's own regex was written through a Python heredoc, where the
word-boundary escape became a **literal backspace byte (0x08)** instead. The
pattern matched nothing and the check reported zero callers — caught by the
minimum-count assertion, which is exactly the failure mode that assertion exists
for, working on the file that introduced it. Replaced with a plain `includes()`.

Then this very paragraph, written through the same heredoc, acquired a real
backspace where it described one. The rule that follows is about tooling rather
than care: **content containing backslash escapes is written with the editor,
never through a shell or Python heredoc.** A scan of every changed file confirms
no control bytes remain.

`identity-model.e2e-spec.ts` also had a premise expire, and was inverted rather
than deleted. Its WP-02 assertion read "leaves every existing user unlinked,
which is what expand means" — true when nothing wrote the column. It now asserts
the precondition WP-09 actually needs: no seeded user without an identity, and
distinct addresses mapping to distinct identities, because linking is not
merging.

Proof it holds end to end: a fresh database, migrated and seeded, reports 7
users, 7 identities and **0 unlinked**; the full database-backed suite is 29
suites / 345 tests green.

## WP-04 — first half: the two credentials cannot diverge

The split has two halves and they must land in this order. **Mirroring writes
first, flipping the read second.** Reversed, every password changed between the
backfill and the flip becomes wrong, and the person discovers it by being locked
out with the password they just chose.

Five paths set a password on a `User`, and all five now reach the identity:

| Path | What it is |
|---|---|
| `auth.service.ts` | the real reset-password flow |
| `super-admin.service.ts` ×2 | platform-admin credential resets, tenant access and tenant owner |
| `tenant-access.service.ts` | service-account credential rotation |
| `users.repository.ts` | invitation acceptance, and anything else going through the repository |
| `seed-demo.ts` | re-seeding, which resets the demo password |

Each mirrors inside the transaction that writes the `User` row, so a reset
cannot half-apply. Where there was no transaction — two of the platform-admin
resets — one was added, because "updated the account but not the person" is
precisely the state that must not survive a crash.

**Two failure shapes, and the second is the dangerous one.** A password *change*
that reaches only `User` locks somebody out — loud, and they tell you. A
credential *rotation* that reaches only `User` rotates nothing: the old password
keeps working and the operator has been told it was revoked. Nobody finds out.

`mirrorPasswordToIdentity` is the only place permitted to write
`identity.passwordHash` after creation, and the invariant enforces that no other
file calls `identity.update`. That separation is what keeps "reset this person's
password" and "silently overwrite a credential they are using" from being the
same line of code — the provisioning paths mint unguessable placeholders, and
those must never reach a credential somebody holds.

**The invariant caught the seed, and then mutation-testing caught the
invariant.** `seed-demo.ts` was updating `User.passwordHash` on a re-seed
without mirroring; both hashes verify the same demo password, so nothing looked
broken, but the copies were drifting. Fixed rather than excluded.

Then the check itself failed its mutation test: it asserted the file *contained*
`mirrorPasswordToIdentity`, and deleting the call while leaving the import
passed. That is `assertion-without-a-check` — written by the person who
documented the pattern two packages earlier. Now matched as
`mirrorPasswordToIdentity\s*\(`, and the mutation fails as it should.

Proof: a database seeded **twice** reports zero users whose `passwordHash`
differs from their identity's. Full suite 29 / 345 green.

## WP-04 — second half: login reads the identity

`resolveLoginCredential` decides which hash a sign-in is checked against, and
`validateCredentials` delegates to it. Three outcomes, and each is a way this
could have gone wrong:

- **an identity exists** → its hash is authoritative, because it is the one
  every password write now reaches;
- **no identity yet** → fall back to `User.passwordHash`. Not dead code:
  `identityId` is nullable until the contract phase, so a deployment where the
  code has shipped and the backfill has not must still authenticate. Removing
  this turns a migration-ordering problem into every user locked out;
- **the identity is SUSPENDED** → refuse outright, whatever the workspace
  account says. Returning the `User` hash here would make suspension a
  suggestion: the person keeps signing in everywhere and the only trace is an
  admin screen claiming otherwise.

The resolver returns the *source* alongside the hash, so the fallback can be
counted rather than merely happening — a fallback nobody measures is how
"temporary" becomes permanent.

**Lockout is now two locks, and both must pass.** The per-tenant counter on
`User` is untouched: a tenant's own policy governs sign-ins to that tenant and
it already works. The global counter on `Identity` is **additional**, never an
alternative — an attacker who can name a tenant must not escape a platform-level
lock by naming one, and a sign-in that names no tenant still has to be stoppable
once WP-06 lands. It is fixed at 20 attempts / 60 minutes rather than
policy-driven, because a global lock has no tenant to take a policy from, and
"the strictest policy across this person's workspaces" would mean one tenant's
settings silently governing another's sign-ins.

Both counter updates are non-throwing. A wrong password must produce "invalid
credentials", never a 500 — a status code that changes tells an attacker which
addresses exist.

Mutation-checked by deleting the suspension guard: the suspended-identity test
fails and nothing else does.

Full suite **30 suites / 351 tests** green, including the auth e2e suites that
drive real sign-ins end to end.

## WP-05 — discovery, and the enumeration oracle that was not built

`listWorkspacesForUser` now resolves the identity and lists every workspace it
reaches. That single change is what [[ITEM-0062]] was filed for: the method
returned a one-element array **by construction**, so the picker page rendered
correctly and could never have anything to pick, and the switcher had nowhere
to switch to. Neither was unbuilt — both were impossible.

**The package title changed, and the reason is a design decision worth
recording.** It was planned as *"workspace discovery by email, rate-limited and
non-enumerable"*, which implies a public endpoint taking an address and
answering which workspaces it reaches. That endpoint is a customer-enumeration
oracle no amount of rate limiting fixes: feed it a list of company addresses and
the answers map DijiPeople's customer base.

The brief's own flow does not require one. *"Email → membership discovery →
automatic redirect or workspace picker"* is satisfied by discovering **after**
the credential is verified, not before — which is what WP-06 does. So there is
no public discovery endpoint, and there should not be one. Nothing here answers
a question to a caller who has not proved who they are.

The session stays tenant-scoped throughout. This tells a person which of *their
own* workspaces exist and returns nothing about any of them beyond a name, a
hostname and whether it can be opened.

Three behaviours that are easy to get wrong and are asserted rather than
assumed:

- **A workspace the person is disabled in is not listed.** `User.status` is per
  tenant by design, so being revoked at one says nothing about the others.
  Offering a door that refuses them is worse than not offering it — they click
  it, get bounced, and cannot tell whether the fault is theirs.
- **The default is the workspace they are already in**, when it can be opened.
  "Default" means "where to send somebody who did not choose", and sending them
  out of the workspace they are standing in would be surprising.
- **Ordering is openable-first, then by name.** This is a menu somebody uses
  repeatedly; one that reshuffles between visits defeats the muscle memory that
  makes it fast.

The unit spec's doubles had to change with the implementation — they supplied a
single `tenant.findUnique`, which was the old shape and the old defect. Nineteen
cases now, up from fifteen. Mutation-checked by removing the
`status: { not: 'DISABLED' }` filter: one test fails, the right one.

`workspace-discovery.e2e-spec.ts` proves the join against real PostgreSQL — two
`User` rows in two tenants, one `Identity`, both found from a session scoped to
one of them — and that a neighbouring person in the same tenant sees only their
own.

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
- 2026-08-20 — WP-01 done: `legal:publish`, its contract suite, and
  [[ITEM-0068]] for the operator UI the script stands in for.
- 2026-08-20 — WP-04 first half: every password write now reaches the identity,
  so the two credentials cannot diverge before the read is flipped.
- 2026-08-20 — WP-12 done, an addition to the decomposition rather than part
  of it: every user-creation path now writes an Identity, pinned by an
  invariant. Without it the backfill's work would diverge the moment it
  landed.
- 2026-08-20 — WP-03 done: the backfill, its selection rule re-derived from
  the data rather than assumed, and the discarded-credential consequence made
  explicit. A-01 re-derived and raised to HIGH.
- 2026-08-20 — `schema` lease freed by SESSION-0020 and taken. WP-02 done:
  the expand-phase migration, verified by drift measurement rather than by
  trusting hand-written SQL. A-02 verified — four `user.create` call sites.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[ITEM-0060]], [[ITEM-0062]], [[ITEM-0068]]
- Modules — [[legal]], [[super-admin]]

<!-- GRAPH:END -->
