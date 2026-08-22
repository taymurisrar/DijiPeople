---
ID: BUG-0767
aliases: [BUG-0767]
Title: render.yaml is not what production runs, so no seed or legal publication has ever executed
Status: FIXED
Severity: HIGH
Priority: P1
Type: INFRA
Source: DEPLOYMENT
DetectedDate: 2026-08-22
DetectedInSha: 3c0efdb
AffectedModules: [render.yaml, services/api/prisma, docs/deployment]
OwnerAgent: release-devops
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-229
RelatedBacklogItem: ITEM-0053
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-23
ResolvedAt: 2026-08-23
---

# BUG-0767 — render.yaml is not what production runs, so no seed or legal publication has ever executed

## Summary

The live Render service is configured by hand in the dashboard and does not match
`render.yaml`. Most importantly it has **no `preDeployCommand` at all**, so
every step of the release chain after `prisma migrate deploy` has never run on
production — `seed:config`, `seed:verify`, `seed:admin`, `seed:legal` and
`legal:publish`.

Found on 2026-08-22 while verifying the release that was supposed to publish the
legal documents. It did not, and this is why.

## Expected Behavior

`render.yaml` is the deployment contract. A deploy runs
`npm --workspace api run release`, which migrates, seeds configuration and the
platform admin, then seeds and publishes the legal documents.

## Actual Behavior

| | Declared in `render.yaml` | Live on the service |
|---|---|---|
| `buildCommand` | `npm ci && npm --workspace api run build` | `npm ci --include=dev && NODE_OPTIONS=... npm run build && npx prisma migrate deploy` |
| `preDeployCommand` | `npm --workspace api run release` | **(not set)** |
| `startCommand` | `npm --workspace api run start:prod` | `npm run start:prod` |

Migrations still apply, because somebody moved `npx prisma migrate deploy` into
the build command. That is exactly what made this invisible: the visible half of
the release chain works, so deploys look correct.

## Reproduction

```
GET https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g
  serviceDetails.preDeployCommand  ->  absent
```

And after the 2026-08-22 release of `35f263c`:

```
GET /api/public/legal        ->  {"documents":[]}
SELECT count(*) FROM "LegalDocument"  ->  0
```

The build log runs to *"All migrations have been successfully applied"* and then
straight to *"Uploading build"*. No seed output, because no seed ran.

## Evidence

- `GET https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g` —
  `serviceDetails.preDeployCommand` is absent; `buildCommand` is
  `npm ci --include=dev && NODE_OPTIONS=... npm run build && npx prisma migrate deploy`.
- `render.yaml:8` declares `preDeployCommand: npm --workspace api run release`.
- The build log for deploy `dep-da4vv167bikc73bautrg` runs to
  "All migrations have been successfully applied" and then straight to
  "Uploading build" — no seed output, because no seed ran.
- After the release of `35f263c`: `SELECT count(*) FROM "LegalDocument"` = 0
  and `GET /api/public/legal` = `{"documents":[]}`.

## Root Cause

Configuration drift with no detector. `render.yaml` is committed, reviewed and
reasoned about — the file even carries a comment about `preDeployCommand`
failing on `P1002` — while the service it describes was edited in a dashboard.
Nothing compares the two, so the document and the deployment diverged silently.

## Impact

Three consequences, and the second is the serious one.

**Legal documents have never been published.** Ten are drafted and the pages,
API and publication model are all deployed; the last step has never executed.
[[ITEM-0053]] cannot close until it does.

**No purchase has ever recorded consent.** `publish-legal.ts` states it plainly:
the subscribe wizard requires only agreements carrying a *published* version, so
with none published it required none, and every checkout captured **no consent at
all**. A flow that silently captures nothing is worse than one that refuses,
because it looks like it worked.

**`seed:config` has never run.** `AGENTS.md` is explicit that a required
configuration row must be added to `seed-config` and verified by
`verify-seed-config` "or fresh deploys break". Production has never executed
either, so nothing has been verifying that claim.

Mitigating today: production holds 3 tenants, all `INACTIVE`/"Pending payment",
0 users and 0 employees. No customer has purchased, so no consent has actually
been missed yet — the exposure is ahead of us, not behind.

## Affected Areas

`render.yaml`, the Render service `srv-d7js7fqqqhas739v4i7g`,
`services/api/prisma/seed-*.ts`, `services/api/prisma/publish-legal.ts`, and
`docs/deployment/`.

## Proposed Resolution

**Needs the user's decision — it changes how every future deploy behaves.**

1. **Set `preDeployCommand`** to `npm --workspace api run release` and remove
   `npx prisma migrate deploy` from the build command, so the pipeline matches
   the file. Note the consequence deliberately: a failing seed then **aborts the
   deploy**, which is the intended design and is stricter than today.
2. **Publish the legal documents**, either through that deploy or by running
   `seed:legal` and `legal:publish -- --confirm` directly against production.
3. **Detect the drift.** A check that reads the live service configuration and
   compares it with `render.yaml` would have caught this the day it appeared.
   Without it, this recurs the next time somebody edits the dashboard.

## Acceptance Criteria

- `GET /api/public/legal` returns the published documents.
- The live service configuration matches `render.yaml`, or the file is corrected
  to match the service and says why.
- A check fails when the two disagree.

## Regression Coverage

None yet. Step 3 above is the regression.

## Dependencies

Needs a decision on whether the deploy pipeline changes.

## Related Items

[[ITEM-0053]] · [[BUG-0714]] · [[BUG-0086]] · [[ITEM-0068]] ·
[[deployment-architecture]].

## Resolution

Applied 2026-08-23. The user set the service configuration to match
`render.yaml`:

```
buildCommand     npm ci --include=dev && NODE_OPTIONS="...6144" npm run build
preDeployCommand NODE_OPTIONS="...4096" npm --workspace api run release
```

`prisma migrate deploy` is out of the build command and the release chain runs
where it was always declared to. Verified by reading the live service, and by
the deploy of `ef57b2a` passing through `pre_deploy_in_progress` — the first
deploy in this service’s history to do so.

The chain completed: `seed:verify` reported *"Seed reference data verification
passed"*, and `legal:publish` reported `published: 0, alreadyPublished: 10`.

### What applying the fix cost, and the lesson in it

**Changing a Render service setting is itself a deploy.** Render redeploys on
configuration change with trigger `service_updated`, and that deploy runs the
code currently on `main` — not the code about to be released.

So setting `preDeployCommand` redeployed `35f263c`, which had no guard against
publishing a self-declared draft, and **republished the ten documents that had
just been withdrawn**. The guarded release landed thirty minutes later and
reported `alreadyPublished: 10`: a guard can refuse a publish and cannot undo
one.

The ordering advice given at the time was right in principle — *land the guard
before automating publication* — and was undone by not knowing that applying the
setting would deploy. Verifying the configuration took hold is not the same as
verifying what the resulting deploy did.

`docs/deployment/platform-access.md` now says so, with the rule: after any
service update, read `deploys?limit=5` and look for a `service_updated` entry.

### Still open

The drift **detector** proposed in step 3 of the resolution does not exist. The
file and the service agree today because somebody made them agree, and nothing
fails when they diverge again. That is [[ITEM-0084]].

## QA Retest

Production regression against `ef57b2a`: **16/16**, including
`no draft document is published`. All ten public pages confirmed showing their
unpublished state after forcing edge revalidation.

## History

- 2026-08-22 — found while verifying the release of `35f263c`. The deploy
  succeeded, the migrations applied, and the legal documents stayed unpublished;
  the service turned out to have no `preDeployCommand`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0053]]
- Referenced by — [[ITEM-0084]]
- Modules — [[database-architecture]]
- Regression — REG-229 (see the regression register)

<!-- GRAPH:END -->
- 2026-08-23 — fixed. preDeployCommand set and verified by a deploy passing through pre_deploy_in_progress. Applying it republished the withdrawn drafts, because a service update is itself a deploy against the old code; recorded in platform-access.md.
