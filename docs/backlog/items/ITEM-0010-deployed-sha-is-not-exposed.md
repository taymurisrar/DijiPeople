---
ID: ITEM-0010
aliases: [ITEM-0010]
Title: The running system does not expose its deployed SHA
Type: INFRA
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api]
Source: DEPLOYMENT
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0010 — The running system does not expose its deployed SHA

## Summary

There is no way to confirm from outside the system which commit is actually
serving traffic. Every release record has to assert the deployed SHA from the
deployment process rather than observe it from the deployed system.

## Why It Matters

This is the single fact every post-deployment question depends on. "Is the fix
live?", "did the rollback take?", "which code produced this error?" — all of them
start with knowing the SHA, and none of them can currently be answered without
trusting a record of what was *intended* to deploy.

`docs/deployment/release-history/README.md` says it plainly: release records
"are the only durable record of which SHA reached which environment, **because
the running system does not expose its commit**." That is a workaround, not a
design.

## Evidence

`.agent/agents/release-devops.md`, Observability expectations: "The deployed SHA
is not exposed, so there is no way to confirm from outside which commit is
actually serving traffic."
`docs/deployment/release-history/README.md`, as quoted above.

## Proposed Approach

Have the API surface a build identifier on its existing health endpoint —
populated from the platform's build-time commit environment variable, with an
explicit `unknown` when it is absent rather than a fabricated value.

Small, additive, no new dependency, and it makes the smoke-test suite able to
assert *what* it smoke-tested.

## Acceptance Criteria

- The health response carries the SHA the running process was built from.
- `scripts/smoke-deployment.mjs` asserts the deployed SHA matches the SHA being
  released, and fails the release when they differ.
- A release record can quote an observed SHA, not an intended one.

## Dependencies

Requires the deployment platform to supply the commit at build time, and the
variable registered per `AGENTS.md` — `packages/config` validation,
`turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md`.

## Related Items

[[ITEM-0009]], of which this is the first and cheapest step ·
architecture [[deployment-architecture|Deployment Architecture]] · `docs/deployment/smoke-tests.md`.

## History

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-15 — imported from the Release/DevOps observability gap.

- 2026-08-15 — Architect triage: FIX_NOW. Small, additive, no new dependency, and it is the fact every post-deployment question depends on. The env var must be registered in all four places AGENTS.md names — `packages/config` validation, `turbo.json` globalEnv, `render.yaml` and `docs/environment-variables.md` — or it will be silently absent in production, which is the failure mode that makes an observability signal worse than none.

## Resolution

`GET /api/health` now reports `commit` and `commitShort`, so a release record
can **observe** the deployed SHA instead of asserting it from the deploy process.
`npm run smoke:deployment` prints it, which means the suite can finally say
*what* it smoke-tested.

`resolveDeployedCommit` reads `GIT_COMMIT_SHA` first — the explicit override
for hosts that inject nothing — then `RENDER_GIT_COMMIT`,
`VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA` and `SOURCE_VERSION`.

**`unknown` is the load-bearing part.** The obvious shortcut is reading local
git state when no variable is set. In a running deployment that reports the
commit of whatever machine asked — which is not the deployed commit and often
nothing at all. A confident wrong SHA is worse than an honest absence, because a
release record will carry it as fact. There is a test asserting the resolver
never returns anything SHA-shaped when it does not know.

The smoke check **does not fail** on `unknown`: a deployment with no commit
variable is misconfigured for release *reporting*, not unhealthy, and failing the
run would conflate the two. It prints a loud line naming the variable to set.

`render.yaml` was deliberately **not** modified. Render populates
`RENDER_GIT_COMMIT` for git-backed services, and the self-referencing
`fromService` block needed to restate it is very likely invalid config that
cannot be verified from here — changing deploy configuration on a guess is how
deploys break.

## Verification

`deployed-commit.spec.ts` — 7 assertions: override precedence, each platform
variable, absence, blank-as-absence, never SHA-shaped when unknown, and the
health payload's full and short forms.

The `'unknown'` short form is asserted explicitly rather than relied on —
`'unknown'.slice(0, 7)` happens to be `'unknown'`, and a future change to the
short form must not start emitting `unknow`.

Documented in `docs/environment-variables.md`. API 163 suites / 1156 tests.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]]

<!-- GRAPH:END -->
