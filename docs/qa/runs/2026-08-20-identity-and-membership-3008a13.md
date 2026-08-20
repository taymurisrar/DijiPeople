# QA Run — identity-and-membership

## Metadata

| | |
|---|---|
| Date / time | 2026-08-20T09:00Z |
| Branch | `agent/identity-and-membership` |
| Commit SHA | `3008a13` — **after** merging `origin/develop` |
| Worktree | `D:\My Work\hrm-dijipeople\DijiPeople-selfservice` |
| Environment | Real PostgreSQL 18 at `localhost:5432/dijipeople_qa11_test`, created for this run and disposable. No external services. |
| QA agent | QA, under TASK-0009 WP-11 |
| Scope | The identity and membership change end to end — schema, backfill, every write path, login, discovery, the picker, the switcher — plus every other DB-backed suite in the repository. |

**The baseline was taken after merging `develop`, not before.** TASK-0008's
campaign did it the other way round and spent its effort rediscovering 81
failures somebody else had already fixed, producing one withdrawn record and no
value. That lesson was written into this parent's plan and this run is it being
followed.

## Requirement

Make one person one identity across many workspaces, so signing in from
`www.dijipeople.com`, discovering which workspaces an address reaches, and
moving between them all become possible — without changing what a JWT means.

## Risk Areas

| Area | Why it could break | Pattern |
|---|---|---|
| The credential merge | Two accounts, one email, different hashes. One password stops working. | `irreversible-data-merge` |
| Password writes | Two copies during expand; any path missing the mirror locks somebody out — or silently fails to revoke. | `divergent-duplicate-guard` |
| Login reading a new column | The first change here where getting it wrong means nobody can sign in. | `fail-closed-on-migration-lag` |
| Public discovery | Unauthenticated endpoint answering questions about customers. | `tenant-existence-oracle` |
| Second workspace | "Identity exists" is the obvious test and the wrong one. | `plausible-but-wrong-predicate` |

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | The expand migration applies to a populated database | migration | Additive, nullable, nothing dropped | PASS | full history applied; `\d "Identity"` matches the model |
| S2 | The migration SQL agrees with the schema | contract | Drift unchanged by the change | PASS | 204 statements before and after, **none** mentioning `Identity` |
| S3 | `Restrict` and `SetNull` are enforced by the database | contract | Deleting a linked identity refused; deleting a tenant clears the preference | PASS | `identity-model.e2e-spec.ts`, mutation-checked |
| S4 | The backfill keeps the credential last signed in with | idempotency | `lastLoginAt` decides; `NULLS LAST` | PASS | `identity-backfill.e2e-spec.ts`, 3 mutations caught |
| S5 | The backfill carries lockout forward at its most restrictive | boundary | `MAX` across merged rows, not the winner's | PASS | same suite |
| S6 | Every user-creation path links an identity | contract | 4 direct sites + 6 via the repository | PASS | `user-creation-links-identity.invariant.spec.ts` |
| S7 | Every password write reaches the identity | contract | 5 paths, each inside its transaction | PASS | same invariant; mutation caught after the check was strengthened |
| S8 | Login verifies against the identity | happy | Identity hash wins; `User` is the fallback | PASS | `identity-login.e2e-spec.ts` |
| S9 | A suspended identity cannot sign in anywhere | permission | Refused whatever the workspace account says | PASS | same suite, mutation-checked |
| S10 | Discovery cannot enumerate customers | permission | Password required; identical failure for every cause | PASS | `workspace-discovery-auth.e2e-spec.ts` |
| S11 | Discovery cannot enumerate by timing | permission | bcrypt compare runs even with no identity | PASS | same suite, asserted by call count |
| S12 | One person in two workspaces sees both | happy | Both, from a session scoped to one | PASS | `workspace-discovery.e2e-spec.ts` |
| S13 | A disabled account is not offered | permission | Hidden from the picker | PASS | same suite |
| S14 | A neighbouring person sees only their own | tenant | No cross-identity leak | PASS | same suite |
| S15 | A never-activated identity is not treated as credentialled | negative | `INVITED` elsewhere is not evidence | PASS | `identity-second-workspace.e2e-spec.ts` |
| S16 | The workspace being created cannot be its own evidence | boundary | `excludeTenantId` | PASS | same suite, asserted both ways |

## Automated Suites

| Command | Suite | Pass | Fail | Duration |
|---|---|---|---|---|
| `npm --workspace api run test` | api unit | 1439 | 0 | ~31 s |
| `npx jest --config ./test/jest-e2e.json` | api e2e, real PostgreSQL | **367** | **0** | ~5 min |
| `npm --workspace web run test` | web | 408 | 0 | ~4 s |
| `npm --workspace admin run test` | admin | 101 | 0 | ~5 s |
| `npm --workspace landing run test` | landing | 109 | 0 | ~1 s |
| `npm --workspace api run check-types` | api tsc | — | 0 | — |
| `npm --workspace web run check-types` | web tsc | — | 0 | — |
| `npx eslint` — api, web | lint | — | 0 errors | — |
| `npm run validate:framework` | framework | 2897 | 0 | — |

**33 of 33 e2e suites pass.** The count rose from 29 to 33 — the four added here
— and no pre-existing suite regressed.

### Regression-test proof

Nothing in this run is asserted only by being green. Each mutation was reverted
immediately and `git diff` confirmed no residue.

| Mutation | Result |
|---|---|
| `Restrict` → `Cascade` on `User.identityId`, in schema **and** SQL | 1 failed — a person deleted out from under their accounts |
| `NULLS LAST` removed from the backfill ordering | 1 failed — the never-signed-in credential wins |
| Backfill's merged `failedLoginAttempts` → `0` | 1 failed — lockout carry-forward |
| The backfill's unlinked guard, aimed at a deliberately unlinked row | raises; passes once linked |
| `identityId` removed from one `user.create` | 1 failed, naming the file |
| The password mirror call deleted from `tenant-access.service.ts` | 1 failed — **only after the check was strengthened**; see below |
| The suspension guard deleted from `resolveLoginCredential` | 1 failed — suspended identity |
| `status: { not: 'DISABLED' }` removed from the membership query | 1 failed |

## Manual Validation

Read every new endpoint against `PublicRateLimitGuard`, `resolveClientIp` and
`JwtAuthGuard`. Confirmed the JWT still carries exactly one tenant and that
`JwtAuthGuard` is untouched — assumption A-03, and the property the whole parent
rests on.

Ran the contract-phase migration by hand against a database with two unlinked
rows to confirm its guard fires with a count before `ALTER TABLE` produces its
unhelpful error, then backfilled and confirmed it succeeds.

## Bugs Found

| ID | Severity | Description | Regression added |
|---|---|---|---|
| [[ITEM-0069]] | MEDIUM | A global identity lock can be triggered by an unauthenticated attacker | filed, not fixed — see below |
| [[ITEM-0068]] | MEDIUM | Legal documents have no operator UI, so publishing is a script | filed |

Two defects were found **in this run's own work** and fixed before it closed:

- `seed-demo.ts` reset `User.passwordHash` on a re-seed without mirroring. Both
  hashes verified the same password so nothing looked wrong; the copies were
  drifting.
- The password-mirror check asserted the file *contained*
  `mirrorPasswordToIdentity`, and a mutation deleting the call while leaving the
  import passed it. `assertion-without-a-check`, written by the person who
  documented that pattern two packages earlier. Strengthened to require a call.

## Known Limitations

**No browser E2E.** Playwright needs three Next servers, an API, a seeded
database and browser binaries, and the Nest CLI does not start reliably in this
environment. The picker and switcher are covered by unit tests and by reading
them against the API contract; the `browser-e2e` gate runs on push.

**The switcher has no automated test at all.** It is a server component that
fetches and renders; testing it needs a rendering library `apps/web` does not
have. Its logic is deliberately thin — render nothing unless there are two or
more workspaces — and the decision it depends on is covered by
`workspace-resolution.service.spec.ts`. Stated plainly rather than implied.

**The contract phase is not exercised in this branch**, because it is not in it.
It was written, run by hand both ways, and held for a later deployment — see
TASK-0009 WP-09.

**No load or true-concurrency testing.** The identity race is proven by the
unique index and the losing-writer path, not by racing clients.

## Final QA Verdict

**PASS WITH RISKS.**

One person is now one identity across many workspaces. Credentials are global,
authorisation stays per tenant, and the JWT still names exactly one tenant —
which is what made this survivable rather than a rewrite of every guarded
endpoint. Login reads the identity, every write reaches it, discovery cannot be
used to enumerate customers, and the picker and switcher finally have something
to show.

The risks, named:

1. **[[ITEM-0069]] is open and was found here.** Twenty unauthenticated requests
   can lock a known address out of every workspace for an hour. It is a
   deliberate trade — the alternative is unlimited password guessing — and it is
   strictly worse in blast radius than the per-tenant lock it mirrors. Filed
   rather than fixed because the options trade usability against resistance and
   that is the owner's call.
2. **The contract phase is still ahead.** Until it ships, `identityId` is
   nullable and `resolveLoginCredential` falls back to `User.passwordHash`. That
   fallback is deliberate and load-bearing during the transition, and it is also
   a second credential path that must eventually go.
3. **The switcher is unverified by machine.** See Known Limitations.

## Follow-up

- [[ITEM-0069]] — decide how discovery should be throttled without handing
  anybody a lockout weapon.
- TASK-0009 WP-09 — the contract phase, once expand and backfill are in
  production. Eleven e2e suites create `User` rows directly and will need
  identities when it lands.
- [[ITEM-0068]] — an operator UI for legal publication.
