---
title: 2026-08-29 — the identity contract phase
category: release
date: 2026-08-29
---

# Release — the identity contract phase

One merge to `main`, deployed and verified in production across all four
surfaces.

| | |
|---|---|
| **Previous production** | `949f461c` |
| **Release** | `6d17989a` — PR #56, merged 13:42:45 UTC |
| **Released tree** | `4d10f62c`, CI-green with all 15 jobs executed on that exact SHA (run `33254650713`) |
| **Contents** | 28 commits, 99 code files |
| **Migrations** | **Two**, both applied: `20260828220000_platform_exchange_rate` (additive) and `20260829090000_identity_contract` (**one-way for API rollback**) |
| **Rollback class** | **Constrained.** See below — this is not a code-only release. |

## The rollback constraint, first

`20260829090000_identity_contract` is the contract phase of
expand/backfill/contract and makes `User.identityId` `NOT NULL`.

**Do not roll the API back past `6d17989a`.** An older build does not write
`identityId` on its creation paths, and the column no longer permits null, so
that build would be **unable to create users at all** — a rollback that breaks
user creation is worse than whatever it is rolling back from.
`user-creation-links-identity.invariant.spec.ts` pins that every creation path
writes the column.

The migration's precondition was satisfied before it ran: expand and backfill
have been live since 2026-08-22 (217/217 applied). It also refuses before
altering rather than after — it counts unlinked rows and fails naming them,
instead of leaving an operator mid-deployment with a bare constraint error.

`platform_exchange_rate` carries no such constraint: one new table, no column
touched, no data moved, reversible by dropping it.

## What deployed

| Area | Change |
|---|---|
| Auth | the identity contract phase (TASK-0009 WP-09) |
| Leave | policy entitlement becomes a leave balance; approving a request now needs more than permission to read it; a refusal message reaches the screen; an entitlement backfill script |
| Approvals | an unroutable chain names the step and what to configure; a seeded default approval chain |
| Timesheets | the job audit toggle |
| Web runtime | a related-list create carries its parent foreign key; saves that failed in silence now surface; three dead ends in the shell |
| Web shell | the workspace switcher moved under the avatar and names itself once ([[ITEM-0102]]) |
| Admin | revenue converted rather than excluded, plus one deletion rule |
| Go-live | the check that would have caught a silent payment failure; the workspace host a customer is actually sent to |

## Deployment, verified rather than assumed

Render auto-deploy fired **two seconds** after the merge —
`dep-da9e3ls9v7es73di6i60`, build 13:42:47 → live 13:49:03 UTC.

`preDeployCommand` is `npm --workspace api run release`: migrate deploy, then
`seed:config`, `seed:verify`, `seed:admin`, `repair:market-countries`,
`seed:legal`, `legal:publish --confirm`. A non-zero exit aborts the deploy and
leaves the previous instance serving, so reaching `live` is itself evidence that
every step passed. The log confirms it directly:

```
223 migrations found in prisma/migrations
Applying migration `20260828220000_platform_exchange_rate`
Applying migration `20260829090000_identity_contract`
All migrations have been successfully applied.
```

Then: `Seed reference data verification passed.` · commercial catalogue
`0 plan(s) created, 0 reconciled, 0 retired, 0 withdrawn from sale; 0 price(s)
created` with 36 already on catalogue terms — **no price was rewritten** ·
legal `published: 0, alreadyPublished: 10`.

| Surface | State |
|---|---|
| API (Render) | `live`, `/api/health` reports `6d17989a` |
| `diji-people-web` (Vercel) | READY on `6d17989a` |
| `diji-people-admin` (Vercel) | READY on `6d17989a` |
| `diji-people-landing` (Vercel) | READY on `6d17989a` |

`npm run smoke:deployment` against production passed every check: health, the
served commit, the outbox worker draining, unauthenticated rejection of a
protected route, CORS, a launched market with a purchasable plan, published
legal documents, the Stripe webhook secret, and tenant workspace host
resolution.

> Run it with `SMOKE_API_BASE_URL` set. It defaults to
> `http://127.0.0.1:4000/api`, so a bare `npm run smoke:deployment` fails every
> check with `fetch failed` and reads exactly like a production outage.

## What was not verified

The workspace switcher's new placement was not confirmed in a browser. It
renders nothing for anyone with fewer than two workspaces, which is nearly
everyone and includes every account available here, so the check is not
reproducible on demand — see [[QA-TENANT-054]]. Its placement is held by source
assertions instead, and that is stated in the scenario rather than implied away.

## Scope moved mid-release

PR #56 was raised against `25dfd43a` (26 commits) and merged at `4d10f62c` (28).
SESSION-0071 integrated two commits while the PR was open, which cancelled the
first PR run. Seven files, no new migration, so the risk profile did not change
in kind — the PR body was updated to say so before merging rather than after.

## Related

[[ITEM-0102]] · [[QA-TENANT-054]] · [[tenant-application]] · [[auth]]
