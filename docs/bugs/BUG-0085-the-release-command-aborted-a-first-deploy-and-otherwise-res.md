---
ID: BUG-0085
aliases: [BUG-0085]
Title: The release command aborted a first deploy, and otherwise reset the super admin password
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-20
DetectedInSha: bab45ad
AffectedModules: [platform-users, legal]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-079
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0010
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
ResolvedAt: 2026-08-20
---

# BUG-0085 — The release command aborted a first deploy, and otherwise reset the super admin password

## Summary

`render.yaml` sets `preDeployCommand: npm --workspace api run release`, and that
command ends by seeding the platform super admin, seeding the legal documents and
publishing them. `seed:admin` threw whenever `PLATFORM_SUPER_ADMIN_EMAIL` was
unset — and `render.yaml` did not declare it. So the **first deploy of a new
environment aborted in `preDeployCommand`**, before the legal steps ran.

Setting the variable to get past that introduced the second half: the upsert
wrote `passwordHash` in its `update` branch, so **every subsequent deploy reset
the platform super admin's password** to whatever was still in the Render
dashboard.

The two available configurations were therefore "every deploy fails" and "every
deploy silently reverts the super admin's credential". There was no third one.

## Expected Behavior

A first deploy bootstraps an admin from configuration. Every deploy after it is
a no-op that leaves the existing admin's password, role and status alone, and a
credential does not have to remain in the deployment dashboard to keep deploys
green.

## Actual Behavior

- Unset: `PLATFORM_SUPER_ADMIN_EMAIL is required.`, exit 1, `preDeployCommand`
  aborts, the deployment fails.
- Set: the admin's stored bcrypt hash is replaced on every deploy.

## Reproduction

Against an empty database, from `services/api`:

```bash
npx prisma migrate deploy --config prisma.config.ts
DATABASE_URL=... npm run release          # aborts at seed:admin
```

Then, with the variable set:

```bash
PLATFORM_SUPER_ADMIN_EMAIL=a@example.com PLATFORM_SUPER_ADMIN_PASSWORD=one-password-here npm run seed:admin
# note left(passwordHash, 20)
PLATFORM_SUPER_ADMIN_EMAIL=a@example.com PLATFORM_SUPER_ADMIN_PASSWORD=a-different-password npm run seed:admin
# passwordHash has changed
```

## Evidence

Measured on 2026-08-20 against a throwaway database built by applying all 216
migrations from empty — the first time this repository's release command had been
run end to end against a virgin database.

```text
> api@0.0.1 seed:admin
PLATFORM_SUPER_ADMIN_EMAIL is required.
npm error Lifecycle script `seed:admin` failed with error: code 1
npm error Lifecycle script `release` failed with error: code 1
```

Password overwrite, same database:

```text
before: $2b$12$nyZMFbE7d.yPW
after:  $2b$12$17uYhjdHW2gTa
VERDICT: password OVERWRITTEN by redeploy
```

- `render.yaml` — `preDeployCommand`, and no `PLATFORM_SUPER_ADMIN_*` key.
- `services/api/prisma/seed-admin.ts` — the throw, and `passwordHash` in the
  upsert's `update` branch.
- `docs/deployment/environments.md` — had recorded the undeclared-variable half
  as a **Medium** finding, with the words *"nothing in the repository will remind
  you"*. Nothing did.

## Root Cause

Two independent defects that only combine into a trap:

1. A required deployment variable was documented in prose but never declared in
   the manifest the deployment actually reads.
2. `seed:admin` was written as a bootstrap script and then wired into a command
   that runs on **every** deploy. An unconditional credential write is correct
   for a bootstrap and wrong for a recurring step, and nothing in the code marked
   the difference.

CI never caught it because `.github/workflows/ci.yml` sets both variables
explicitly against a fresh database, so CI only ever exercised the create path.

## Impact

The first production deploy would have failed. Worse, the fix an operator would
reach for first — set the variables — produces a system where rotating the
platform super admin's password is undone by the next deploy, **including a
rotation performed because the password leaked**.

Because `seed:admin` sits before `seed:legal` and `legal:publish` in the chain,
the abort also suppressed the legal publication added earlier in TASK-0010. An
environment that failed here would have had no published legal documents, so a
purchase would have recorded no consent — the exact defect that work existed to
fix.

## Affected Areas

API deployment (`preDeployCommand`), platform super admin bootstrap, legal
document publication, and any environment created from a clean database.

## Proposed Resolution

Declare the variables, and make the decision explicit and testable.

## Acceptance Criteria

- `render.yaml` declares the variables the release chain requires.
- A deploy with no admin variables set succeeds when an active super admin
  exists, and fails loudly when none does.
- A deploy never changes an existing platform user's password, role or status
  without an explicit request.
- The decision is unit-tested, not only observed.

## Regression Coverage

`services/api/src/common/utils/admin-seed.util.spec.ts` — seven cases covering
each path. The reset case is asserted **as a pair** with the non-reset case, so a
decision that ignored the flag and reset unconditionally — the original bug —
still fails the test.

## Dependencies

None.

## Related Items

- [[TASK-0010]] — go-live readiness; found by its first-deploy dry run.
- [[BUG-0084]] — the other defect the same dry run surfaced.

## Resolution

Fixed 2026-08-20 in TASK-0010 WP-06.

- `services/api/src/common/utils/admin-seed.util.ts` — `decideAdminSeedAction`,
  a pure function returning `CREATE`, `RESET` or `SKIP`. The rule: **a deploy
  never modifies an existing platform user unless explicitly told to.**
- `services/api/prisma/seed-admin.ts` — resolves the two facts the decision needs
  (does any active super admin exist; does this named user exist) and executes
  the result.
- `render.yaml` — declares `PLATFORM_SUPER_ADMIN_EMAIL`, `_PASSWORD` and
  `_PASSWORD_RESET`, with the instruction to remove the password after the first
  deploy.
- `docs/environment-variables.md`, `docs/deployment/environments.md`,
  `.agent/context/deployment-runtime.md`, `.agent/context/database-prisma.md`.

`SKIP` also covers the case the old script could not express: the variables
removed after bootstrap, which is what an operator should do with a password they
do not want living in a dashboard.

Re-activation was deliberately **excluded** from the default path. Restoring role
and status on every deploy would silently undo the suspension of a compromised
account, so it happens only under `_PASSWORD_RESET=true`, which is the
break-glass path.

## QA Retest

Pass. Verified against real databases rather than by reading the code:

| Case | Result |
|---|---|
| Redeploy, different password in env | `SKIP` — stored hash unchanged |
| Redeploy, no variables set, admin exists | `SKIP`, exit 0 — hash unchanged |
| `_PASSWORD_RESET=true` | `RESET` — hash changed |
| Virgin database, no variables | Fails loudly with an actionable message |
| Virgin database, variables set | `CREATE` |

Full release chain re-run twice against the virgin database: 216 migrations
applied, 10 legal documents published on the first run, `published: 0,
alreadyPublished: 10, skipped: 0` on the second.

api unit suite 189/189 suites, 1446/1446 tests.

## History

- 2026-08-20 — found by running `npm run release` against a database built from
  all 216 migrations, and fixed the same day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[legal]]
- Regression — REG-079 (see the regression register)

<!-- GRAPH:END -->
