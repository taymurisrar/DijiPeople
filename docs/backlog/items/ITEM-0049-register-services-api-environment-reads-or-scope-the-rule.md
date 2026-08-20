---
ID: ITEM-0049
aliases: [ITEM-0049]
Title: Register services/api environment reads or scope the rule to build inputs
Type: INFRA
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [services/api, turbo.json, docs/deployment]
Source: IMPLEMENTATION
OwnerAgent: release-devops
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0042
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0049 — Register services/api environment reads or scope the rule to build inputs

## Summary

BUG-0042 registered the 37 environment variables the three Next apps read but
`turbo.json` `globalEnv` did not list, and gated it. `services/api` reads a
further **26** that are also absent. They were deliberately left out of that fix,
because the risk is not the same and the right answer is a decision rather than a
list.

## Why It Matters

The reason BUG-0042 mattered is bundle inlining: a `NEXT_PUBLIC_*` value is
compiled into the client bundle at build time, so an unregistered one can be
changed, rebuilt from cache, and still ship the old value with no error. That
failure mode does not exist for `services/api` — it reads its configuration at
runtime and inlines nothing, so a missing `globalEnv` entry cannot bake a stale
value into an artifact.

What it *can* do is make the API `build` task cache-hit when a variable changed.
Whether that matters depends on whether any API build output actually varies with
those variables, which is worth establishing rather than assuming.

Registering all 26 without deciding would also broaden cache invalidation for
every task in the repo — including `DATABASE_URL`, which changes between every
local, CI and deployment context and would defeat caching wholesale.

## Evidence

`node scripts/check-env-registered.mjs` covers `apps/web`, `apps/admin` and
`apps/landing` and passes. Re-pointing the same scan at `services/api` reports
26 reads absent from `globalEnv`.

Root `AGENTS.md` states the rule generally — "New env vars registered in
`packages/config` validation, `turbo.json` `globalEnv`, `render.yaml` and
`docs/environment-variables.md`" — without distinguishing build inputs from
runtime configuration, which is the ambiguity this item resolves.

## Proposed Approach

1. Establish whether any `services/api` build output varies with an environment
   variable. If none does, the rule as written is stricter than the risk.
2. Either register the subset that genuinely affects build output, or amend
   `AGENTS.md` to say that `globalEnv` covers **build inputs** and that runtime
   configuration belongs in `packages/config` validation, `render.yaml` and
   `docs/environment-variables.md` only.
3. Extend `check-env-registered.mjs` to whichever rule is chosen, so the decision
   is enforced rather than described.

## Acceptance Criteria

- A written rule that distinguishes build inputs from runtime configuration.
- `AGENTS.md` and the check agree with it.
- No variable whose value differs per environment defeats build caching.

## Dependencies

None. BUG-0042 is closed and independent.

## Related Items

[[BUG-0042]] · [[TASK-0005]]
