---
ID: ITEM-0049
aliases: [ITEM-0049]
Title: Register services/api environment reads or scope the rule to build inputs
Type: INFRA
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [services/api, turbo.json, docs/deployment]
Source: IMPLEMENTATION
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
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

## Resolution

Step 1 — re-derived rather than assumed: `services/api`'s `build` script is
`clean:dist && prisma:generate && nest build` (`services/api/package.json`) —
a plain `tsc` compile plus Prisma client generation. `services/api/prisma/schema.prisma`'s
`datasource` block carries no `env(...)` pointer, so `prisma generate` cannot
resolve, let alone inline, any environment variable's value; the connection
URL is supplied to `@prisma/adapter-pg` at runtime instead
(`services/api/src/**` — see `AGENTS.md`, Database / Prisma). Neither build
step executes application code. **No `services/api` build output varies with
any environment variable.** (Re-measured 2026-09-11: 12 of the API's own
`process.env.*` reads are absent from `globalEnv` today, not the 26 recorded
at creation — `AUTH_NOTIFICATION_COOLDOWN_SECONDS`, `COMPUTERNAME`,
`DIJIPEOPLE_LOG_DIR`, `ENABLE_DEMO_DATA_RESET`, `ERROR_LOG_DIR`, `HOSTNAME`,
`INVOICE_EMAIL_ON_ISSUE_ENABLED`, `LOG_DIR`, `PORT`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `SUPPORT_EMAIL` — all runtime configuration, none of
which changes what `tsc` or `prisma generate` emit.)

Step 2 — amended the rule rather than registering the 12:
`docs/deployment/environments.md#registration-requirement` now states that
`turbo.json` `globalEnv` (item 1 of the four-place registration rule) covers
**build inputs** — anything a Next app's build reads, or anything that would
change `services/api` build output — while ordinary API runtime configuration
needs only `render.yaml` / the dashboard, `docs/environment-variables.md` and
the relevant `.env.example`. `AGENTS.md`'s Security checklist row for
**Secrets** now points at that distinction instead of stating the rule
undifferentiated.

Step 3 — enforced, not merely described: `scripts/check-env-registered.mjs`
gained `checkApiBuildCannotInlineEnv()`, which fails the check (and therefore
`npm run check:env-registered`, already a required step in the `test-runtime`
CI job) if `services/api`'s build script stops matching the exact pipeline
this decision rests on, or if the Prisma `datasource` block ever gains an
`env(...)` pointer — either of which would mean the underlying premise no
longer holds and the decision needs re-deriving, not silently trusting.

No variable whose value differs per environment (`DATABASE_URL`, the JWT
secrets, `STRIPE_SECRET_KEY`, …) was added to `globalEnv` by this change, so
build caching is not broadened.

## History

- 2026-08-17 — created as a scoped follow-up to BUG-0042.
- 2026-09-11 — resolved: established the API build inlines no environment
  variable, amended the registration rule to distinguish build inputs from
  runtime configuration, and made `check-env-registered.mjs` enforce the
  premise the decision depends on.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0042]]
- Modules — [[api-architecture]]

<!-- GRAPH:END -->
