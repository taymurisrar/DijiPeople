# Engineering History — Identity and membership

| | |
|---|---|
| **Task Title** | Identity and membership |
| **Task Type** | FEATURE (LARGE) — with a three-phase MIGRATION inside it |
| **Date** | 2026-08-20 |
| **Architect Plan** | [`TASK-0009`](../../tasks/TASK-0009-identity-and-multi-tenant-membership.md). No separate ExecPlan: the shape was settled on [[ITEM-0062]] with the owner and the task record carries it in full. |
| **Agents Used** | Architect, Database, Backend/API, Frontend, UI/UX, Security, QA, Reviewer, Integrator. **Not used:** Release/DevOps — nothing here deploys and `main` is untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/identity-and-membership` |
| **Base SHA** | `77c24c76be383fbb27074f54f49171a2ccfde168` |
| **Final Task SHA** | `b4e8a2be362c8f98b4ceab6f20bb78e3ca4f685d` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integration was a ref-push, so `develop` fast-forwarded to the task SHA rather than gaining a merge commit |
| **Final Target SHA** | `8306936` on `develop` — byte-identical to the SHA the verdict was read on |

### Commits

```
bc4599d feat(legal): a door for the publish path that never had one — TASK-0009 WP-01
d71a02a feat(prisma): Identity — the expand phase, verified rather than asserted — WP-02
6289afb feat(prisma): the Identity backfill, and the credential it has to discard — WP-03
0941b77 feat(users): every user-creation path writes an Identity — WP-12
462d7a1 feat(auth,users): every password write reaches the Identity — WP-04, first half
87a1735 feat(auth): login reads the identity — WP-04, second half
68f70bf feat(tenant-domains): discovery lists every workspace the identity reaches — WP-05
fda23c1 feat(auth,web): generic login, the picker, the switcher — WP-06, WP-07, WP-08
2313887 docs(security): the WP-10 review, and the trade-off it found — ITEM-0069
3008a13 merge: bring develop into agent/identity-and-membership
b4e8a2b test(qa): the WP-11 campaign — 33 suites, 367 tests, baseline taken after the merge
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            77c24c7 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                b4e8a2b [agent/identity-and-membership]
```

### Files Changed

43 file(s) against `origin/develop`.

```
M	apps/web/app/(authenticated)/layout.tsx
A	apps/web/app/components/workspace-switcher.tsx
M	apps/web/app/workspace/choose/page.tsx
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0060-schema-prisma-and-the-applied-migration-history-do-not-agree.md
A	docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md
A	docs/backlog/items/ITEM-0069-a-global-identity-lock-can-be-triggered-by-an-unauthenticate.md
M	docs/backlog/open.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/qa/runs/2026-08-20-identity-and-membership-3008a13.md
A	docs/sessions/SESSION-0021-identity-and-multi-tenant-membership.md
M	docs/sessions/active.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/package.json
A	services/api/prisma/migrations/20260820090000_identity_and_membership_expand/migration.sql
A	services/api/prisma/migrations/20260820100000_identity_backfill/migration.sql
A	services/api/prisma/publish-legal.ts
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-demo.ts
M	services/api/src/modules/auth/auth.controller.ts
M	services/api/src/modules/auth/auth.service.ts
A	services/api/src/modules/auth/dto/discover-workspaces.dto.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-access.service.ts
M	services/api/src/modules/tenant-domains/workspace-resolution.service.spec.ts
M	services/api/src/modules/tenant-domains/workspace-resolution.service.ts
A	services/api/src/modules/users/identity.service.spec.ts
A	services/api/src/modules/users/identity.service.ts
A	services/api/src/modules/users/user-creation-links-identity.invariant.spec.ts
M	services/api/src/modules/users/users.repository.ts
A	services/api/test/identity-backfill.e2e-spec.ts
A	services/api/test/identity-login.e2e-spec.ts
A	services/api/test/identity-model.e2e-spec.ts
A	services/api/test/identity-second-workspace.e2e-spec.ts
A	services/api/test/legal-publish.e2e-spec.ts
A	services/api/test/workspace-discovery-auth.e2e-spec.ts
A	services/api/test/workspace-discovery.e2e-spec.ts
```

## Conflicts

Four files, one merge, and it was taken **before** the QA baseline rather than
after — which is the whole point of this section.

`develop` was one commit ahead: BUG-0083, the database preflight that reported
`PASS` over its own failing fields. The conflicts were
`docs/backlog/index.md`, `docs/sessions/index.md`, the engineering dashboard —
all `DERIVED_ARTIFACT` — and `docs/tasks/remediation/TASK-0005-inventory.json`,
which is `SHARED_RECORD`.

No REG-id collision this time. This branch added no regression-register entries,
so the class of conflict that dominated TASK-0008's merge did not arise.

## Conflict Resolutions

**The three generated indexes took `develop`'s copy and were regenerated.** An
index is a statement about the records, and after a merge the records are the
union of both sides; taking either side's text produces a file that is
internally consistent and factually wrong.

**The inventory was merged by hand.** `develop` as the base, plus this branch's
`ITEM-0068` and `ITEM-0069`, plus `develop`'s wider `qa_scenarios` on `BUG-0060`
and `BUG-0068` — theirs was a superset, so taking this branch's would have
silently dropped a scenario link. `ITEM-0060` kept **this** branch's `source`
row, because this branch edited that record with the drift re-measurement and an
inventory row that disagrees with the record it describes is exactly what
`validate-framework` exists to catch.

**The ordering is the resolution that mattered most, and it is not a file.**
TASK-0008's campaign took its QA baseline before merging `develop` and spent its
effort rediscovering 81 failures somebody else had already fixed — one withdrawn
record, no value. That lesson went into this parent's plan, and this merge
happened first. The baseline that followed was clean on the first run.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-20-identity-and-membership-3008a13.md`](../../qa/runs/2026-08-20-identity-and-membership-3008a13.md) — **PASS WITH RISKS** |
| **Bug IDs** | None created. This parent produced backlog items rather than bugs — nothing it found was a defect in shipped behaviour. |
| **Backlog Items** | Created: [[ITEM-0068]], [[ITEM-0069]]. Advanced: [[ITEM-0060]] re-measured; [[ITEM-0062]] resolved in substance by this parent. |
| **Closes** | TASK-0008 WP-06, which sat `BLOCKED` because the switcher could not be built. |

## CI

| | |
|---|---|
| **CI Run ID** | [`32360520565`](https://github.com/taymurisrar/DijiPeople/actions/runs/32360520565) — on `8306936` |
| **CI Result** | **PASS** — all fourteen jobs green, including Database e2e and Browser e2e |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `3008a13`, after merging `origin/develop`.

| Command | Result |
|---|---|
| `npm --workspace api run test` | 1439 / 1439 |
| `npx jest --config ./test/jest-e2e.json`, real PostgreSQL | **367 / 367 across 33 suites** |
| `npm --workspace web run test` | 408 / 408 |
| `npm --workspace admin run test` | 101 / 101 |
| `npm --workspace landing run test` | 109 / 109 |
| `npm --workspace api run check-types` | pass |
| `npm --workspace web run check-types` | pass |
| `npx eslint` — api, web | 0 errors |
| `npm run validate:framework` | 2897 checks |

The e2e suite count rose 29 → 33, all four added here, and no pre-existing suite
regressed.

## Release / Deployment Impact

None — not deployed. `main` is untouched.

**Two migrations land, one is deliberately held**, and whoever runs the release
needs to know why:

- `20260820090000_identity_and_membership_expand` — additive, nullable, safe to
  apply ahead of the code.
- `20260820100000_identity_backfill` — data. Links every `User` to an
  `Identity`, and **raises rather than half-applying** if any row is left
  unlinked.
- The **contract phase is not in this branch.** Making `identityId` `NOT NULL`
  must reach production in a *later* deployment than the backfill, or rolling
  the code back leaves the old build unable to create users at all. The
  migration is written and was run by hand in both directions; TASK-0009 WP-09
  carries it.

Rollback class for what does ship: **safe**. Both migrations are additive or
data-only, and `resolveLoginCredential` still falls back to `User.passwordHash`,
so an older build authenticates normally against a migrated database.

## Knowledge Capture

`docs/knowledge/implementations/2026-08-20-identity-and-membership.md` — the
architecture, the decisions that could have gone the other way, and the two
traps that only look obvious afterwards.

Three lessons generalise past this parent, and all three are about tests rather
than about identity:

1. **A guard's premise expires before the guard does.** Two assertions here had
   to be *inverted* rather than deleted — `legal-seed`'s "names no legal entity"
   and `identity-model`'s "leaves every existing user unlinked". Both were
   correct when written and false by design afterwards. Deleting them would have
   removed real protection; inverting them kept it, and one found a live defect
   on its first run.
2. **A check that names a behaviour is not a check.** The password-mirror
   invariant asserted the file *contained* `mirrorPasswordToIdentity`, and a
   mutation deleting the call while leaving the import passed. Caught only by
   mutation-testing the check itself — by the person who had documented that
   exact pattern two packages earlier.
3. **The obvious predicate is often the wrong one.** "Does an identity exist"
   would have silently locked people out of second workspaces, because
   provisioning creates identities with placeholders nobody knows. The right
   question was "has this person activated somewhere".

## Obsidian Sync

`npm run knowledge:sync` then `npm run knowledge:verify` — **PASS**, every
mapped note present and every generated wikilink resolving.

The first verify failed usefully: `[[auth-rbac]]` pointed at `.agent/context/`,
which is never synced into the vault, so it resolved to nothing. A wikilink to a
note that cannot exist is worse than a path — corrected to `[[authentication]]`,
which is a real note.

## Cleanup

Task worktree and branch retained — WP-09 and WP-11's follow-ups are still
open against them.

Thirteen throwaway databases dropped. The populated `dijipeople` development
database was **read-only throughout** — it was queried twice, to re-derive the
duplicate-email count that decided the backfill's merge rule, and never written
to. `dijipeople_wp_test` was left to its owning session.

The user's primary checkout is clean and was never written to by this session.
