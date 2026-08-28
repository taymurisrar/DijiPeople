---
ID: BUG-0905
aliases: [BUG-0905]
Title: Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/prisma, packages/config]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-275
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-0905 — Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint

## Summary

`prisma.config.ts` resolves the migration connection through
`resolveMigrationDatabaseUrl`, which reads **`DIRECT_DATABASE_URL`** and falls
back to `DATABASE_URL` when it is absent. The production service defines
**`DIRECT_URL`** instead — the Prisma/Neon convention name, but not the one this
repository reads. The override is therefore inert, and `prisma migrate deploy`
runs over `DATABASE_URL`, which `render.yaml` documents as Neon's *pooled*
endpoint.

That is the exact configuration BUG-0086 was filed against: PgBouncer in
transaction pooling mode cannot hold the session-scoped advisory lock
`migrate deploy` uses, so the lock is not slow to take — it is unobtainable, and
the deploy dies on `P1002` after ten seconds.

## Expected Behavior

Migrations connect over the direct, non-pooled endpoint, named by the variable
the code actually reads.

## Actual Behavior

`DIRECT_DATABASE_URL` is unset in production, so the resolver silently falls
back to the pooled `DATABASE_URL`. Someone set the right value under the wrong
key and the failure mode is invisible until a migration needs the lock.

## Reproduction

Inspect the production service's environment: `DIRECT_URL` is present,
`DIRECT_DATABASE_URL` is not. Compare with
`packages/config/database-urls.js`, which reads only the latter.

## Evidence

Production environment keys (values not read) include `DIRECT_URL` and do not
include `DIRECT_DATABASE_URL`.

`packages/config/database-urls.js:77`:

```js
const direct = typeof env.DIRECT_DATABASE_URL === "string" ? env.DIRECT_DATABASE_URL.trim() : "";
```

`render.yaml` names the correct variable and explains exactly this failure:

```yaml
      # The connection migrations run over, and it must be Neon's DIRECT
      # endpoint … With DATABASE_URL pooled and this unset, preDeployCommand
      # fails on P1002 after ten seconds … BUG-0086.
      - key: DIRECT_DATABASE_URL
        sync: false
```

The `1dd74a25` deploy did get past `prisma:migrate:deploy` — but that release
carried **no migrations**, so no lock was contended. The next release that adds
one is where this surfaces.

## Root Cause

Two names for one concept, and the deployed environment uses the one the code
does not read. Compounded by `render.yaml` never having been applied to the live
service (see [[BUG-0904]]), so the file that names the variable correctly is not
the file production is configured from.

## Impact

Latent. Deploys continue to succeed while releases carry no schema change; the
first release with a migration fails at pre-deploy on `P1002` and blocks the
release the same way [[BUG-0899]] does now. Worth fixing before anyone is
relying on a smooth deploy path.

## Affected Areas

- production environment of the API service
- `services/api/prisma.config.ts`
- `packages/config/database-urls.js`
- `render.yaml`

## Proposed Resolution

Rename the production variable to `DIRECT_DATABASE_URL` (or, if `DIRECT_URL` is
preferred because it is the Prisma convention, accept both in
`resolveMigrationDatabaseUrl` and say so in `docs/environment-variables.md`).
Prefer the rename — one name is better than two, and `describeMigrationUrlProblem`
already names `DIRECT_DATABASE_URL` in its error text, so accepting an alias
would make that message misleading.

## Acceptance Criteria

- `npm run prisma:migrate:status` against production connects over the direct
  endpoint.
- A release containing a migration deploys without `P1002`.

## Regression Coverage

`packages/config/database-urls.test.js` covers the resolver. What is missing is
an environment check — `check:env-registered` or `smoke:deployment` asserting
that a pooled `DATABASE_URL` is accompanied by a readable
`DIRECT_DATABASE_URL`.

## Dependencies

Shares a root cause with [[BUG-0904]]: the live service is configured by hand
and `render.yaml` is not applied.

## Related Items

[[BUG-0899]], [[BUG-0904]]

## Resolution

Fixed 2026-08-28 — both halves, one on production and one here.

Production: the owner added `DIRECT_DATABASE_URL` to the live service. An
inventory on 2026-08-28 shows `DIRECT_URL` and `DIRECT_DATABASE_URL` both
present, where this record found only the former.

Code: `resolveMigrationDatabaseUrl` now accepts either name, `DIRECT_DATABASE_URL`
first so a deployment setting both keeps the connection it already had.

The second half is the one worth having. `DIRECT_URL` is the name Prisma's own
documentation and Neon's setup guide use, so it is what anyone configuring this
service by hand will reach for — and reaching for it produced a variable that
looked set, did nothing, and left `migrate deploy` running over the pooled
endpoint. That is the exact configuration BUG-0086 exists to prevent, arrived at
through a spelling rather than a decision. Renaming the production variable
fixes today; accepting both names stops the next person rediscovering it.

`describeMigrationUrlProblem` now reports whichever name actually supplied the
pooled url, so the diagnostic names the variable the operator set.

Guarded by REG-275.

## QA Retest

Not retested against a real deploy. `packages/config/database-urls.test.js`
covers the resolution and precedence rules, including a pooled `DIRECT_URL`
being reported under its own name.

The behavioural check is the next production `migrate deploy`: it should apply
migrations rather than failing `P1002` after its lock timeout. Nothing in this
change can be confirmed from the repository alone, because the variable's value
lives on the service.

## History

- 2026-08-24 — **`DIRECT_DATABASE_URL` has been set on the production service**,
  alongside the existing `DIRECT_URL` rather than replacing it, so the name the
  code actually reads now resolves. Applied by the owner; the change triggered
  deploy `dep-da68nme1egvs739pn1ag`, live at 18:28:57Z.

  That deploy's migration step succeeded:

  ```
  18:25:53  219 migrations found in prisma/migrations
  18:25:53  No pending migrations to apply.
  ```

  No `P1002`, no ten-second lock timeout, and the rest of the `preDeployCommand`
  chain ran to completion behind it.

  **Held open deliberately, because this is weaker evidence than it looks.**
  There were no pending migrations, so while `migrate deploy` does take the
  session-scoped advisory lock even with nothing to apply, this run did not
  exercise the path under a real migration. The failure mode in [[BUG-0086]] is
  that PgBouncer in transaction pooling mode cannot *hold* that lock — and a
  no-op run is the least demanding way to ask for it.

  Close this when a deploy carrying **at least one pending migration** applies it
  cleanly. [[TASK-0009]] WP-09, the `identityId` contract phase, is the next
  migration due and is the natural occasion.
- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-28 - DIRECT_DATABASE_URL added on production by the owner; the resolver now also accepts DIRECT_URL so neither spelling can silently do nothing. REG-275.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[database-architecture]], [[deployment-architecture]]
- Regression — REG-275 (see the regression register)

<!-- GRAPH:END -->
