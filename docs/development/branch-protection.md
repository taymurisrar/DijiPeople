# Branch Protection — `main` and `develop`

> **Verify, do not read.** `node scripts/verify-branch-policy.mjs` reads the
> live protection objects and reports drift against the intended policy. It is
> read-only by design: a script that could relax protection is one that will
> eventually relax it to make a merge easier.

## The branch model

```
main        production deployment branch   ← RELEASE / DEPLOY / HOTFIX_PRODUCTION
develop     autonomous integration branch  ← every ordinary task
agent/*     isolated implementation branches
```

Rules and rationale:
[`../../.agent/context/branch-model.md`](../../.agent/context/branch-model.md).

---

## `develop` — intended configuration

```
required_status_checks         null    no required check on a direct push
required_pull_request_reviews  null    no PR, no approvals
enforce_admins                 true    so the two prohibitions below bind everyone
allow_force_pushes             false
allow_deletions                false
required_linear_history        false
```

Applied with:

```bash
gh api -X PUT repos/taymurisrar/DijiPeople/branches/develop/protection \
  --input docs/development/develop-protection.json
```

**Why `required_status_checks` is null.** A required status check on a branch
with no pull-request requirement blocks direct pushes outright — the commit
being pushed has no completed check yet — which would reimpose the mandatory-PR
workflow by the back door. Validation before integrating is enforced by the
framework instead (`DEVELOP_VALIDATION_REQUIRED = true`), and CI still runs on
every push, because `.github/workflows/ci.yml` triggers on `'**'` and lists
`develop` under `pull_request`.

**Why `enforce_admins` is true.** With no required checks and no PR requirement,
the only rules on the branch are "no force push" and "no deletion". Those should
bind everyone, admins included, and enforcing them costs nothing — an ordinary
fast-forward push is unaffected.

### Current state — not yet applied

`develop` is presently **unprotected**. The `PUT` above was refused in the
environment that authored this model: the agent tooling blocks GitHub protection
mutations, which is a sensible guardrail rather than a repository problem. Reads
work; writes do not.

Until it is applied, `develop` can be force-pushed and deleted. Everything else
in the model is already in force, because the framework enforces it rather than
the platform. `node scripts/verify-branch-policy.mjs` reports it as `HIGH` drift
on every run, so it cannot be forgotten.

### The inert ruleset

The repository carries one ruleset, **"No push"** (id `15523234`, enforcement
`active`), declaring a pull-request rule with
`required_approving_review_count: 1`. Its ref condition is:

```json
"include": ["refs/heads/\"main\", \"develop\""]
```

That is a literal string, not a ref pattern, so it **matches no branch** and the
ruleset does nothing. `main` is protected solely by the classic branch
protection described below.

It is reported rather than repaired, deliberately. Fixing the pattern would
impose a one-approval requirement on `main` that does not exist today — and that
a single-maintainer repository cannot satisfy, since GitHub forbids
self-approval — and on `develop`, where this model explicitly excludes it.
Deleting it is equally a policy decision, not a cleanup.
`verify-branch-policy.mjs` surfaces it on every run so it cannot quietly begin
matching after a rename.

---

## Branch protection on `main`

> **Status: APPLIED on 2026-08-15** and verified by reading the protection
> object back from the GitHub API. This file used to say the settings were *not*
> applied "because configuring them requires repository admin access, which this
> environment does not have" — that had become false: the credential in use is a
> repository admin. The claim was never re-checked, which is the same
> `doc-code-drift` shape as [`BUG-0023`](../bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md).
> **Re-derive access before believing any statement in this file about what
> cannot be done.**

Remote: `https://github.com/taymurisrar/DijiPeople.git`

## What is actually configured

| Setting | Applied |
|---|---|
| Require a pull request before merging | **on** |
| Required approving reviews | **0** — see below |
| Dismiss stale approvals on new commits | **on** |
| Require status checks to pass | **on** |
| Required check | `CI required gate` |
| Require branches to be up to date before merging | **on** |
| Require conversation resolution | **on** |
| Enforce for administrators | **on** |
| Allow force pushes | **off** |
| Allow deletions | **off** |

**Required approvals is 0, not the 1 recommended below.** GitHub does not permit
self-approval and this repository has a single maintainer, so requiring an
approval nobody can give would block every merge. `enforce_admins` is on, so the
CI gate itself is not bypassable — which is the property that actually matters.
Raise approvals to 1 the moment a second reviewer exists; it is a team-size
decision, tracked as an owner decision on
[`ITEM-0016`](../backlog/items/ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po.md).

**"Require branches to be up to date" is not free, and that is the point.** It
fired within an hour of being applied: PR #5 was refused because another session
merged PR #6 onto `main` while #5 was in review. The branch had to merge `main`
and re-run CI before it could land — which is exactly the "green on a stale base
proves nothing" scenario this setting exists to prevent, enforced by the
platform instead of by discipline.

Verify at any time with:

```bash
gh api repos/taymurisrar/DijiPeople/branches/main/protection
```

---

## Why both layers are required

The framework now refuses to merge into a shared target without a verified CI
`PASS` — see
[`../../.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).
That constrains **agents that follow their instructions**. It does nothing about:

- a human pushing straight to `main`
- a different Git client, or tooling that never loads the framework
- an agent that ignores its instructions
- an ordinary mistake made in a hurry

Branch protection is the layer that cannot be argued with. **Neither layer
substitutes for the other**, and this repository currently has only the
framework half — which is exactly the gap that let a merge land on `main` with
an unread CI verdict.

---

## Required status check

Require exactly **one** check:

```
CI required gate
```

That job (`ci-required` in `.github/workflows/ci.yml`) names eleven dependency
jobs and fails if any dependency result is not `success`. The browser job is a
current exception: job-level `continue-on-error` converts a failed browser step
to a successful dependency result, so it remains fail-open despite being named.
Requiring the aggregate rather than the jobs individually means **adding or
renaming a job later does not
require touching branch protection** — a common source of silently-unenforced
rules.

The eleven jobs currently named by the aggregate:

| Job | What it protects |
|---|---|
| `validate` | Agent framework structure and consistency |
| `typecheck` | Workspace typechecks compile; Prisma schema valid |
| `lint` | API, web, admin and landing lint checks; **checkout not mutated** |
| `test-api` | API unit/invariant tests, excluding the named dual-permission invariant |
| `test-web` | Tenant-web pure-logic tests |
| `test-admin` | Admin pure-logic tests |
| `test-landing` | Landing pure-logic tests |
| `test-runtime` | Platform runtime/config contract tests |
| `database-migration` | Empty-database migration and configuration-seed verification |
| `build` | Monorepo build |
| `browser-e2e` | Browser journeys; currently fail-open because the job retains `continue-on-error: true` |

**Deliberately report-only** (both `continue-on-error`, see §Known baselines):

- `security-invariant-report`
- `database-e2e-report`

---

## Settings to enable

### Branch protection rule for `main`

| Setting | Value | Why |
|---|---|---|
| Require a pull request before merging | **On** | Nothing reaches `main` unreviewed |
| Required approvals | **1** | Matches a small team; raise later |
| Dismiss stale approvals on new commits | **On** | An approval describes the diff it saw |
| Require status checks to pass | **On** | The point of the exercise |
| Required check | `CI required gate` | Single aggregate |
| Require branches to be up to date before merging | **On** | Prevents "green on stale base" — see below |
| Require conversation resolution | **On** | Reviewer findings cannot be merged past silently |
| Require linear history | Optional | Only if you prefer squash/rebase over merge commits |
| **Allow force pushes** | **Off** | Non-negotiable; the Integrator never force pushes either |
| **Allow deletions** | **Off** | |
| Do not allow bypassing the above | **On** (recommended) | Otherwise admins silently bypass the gate |

### Why "up to date before merging" matters here

`main` moves while a task branch is in review. Without this, a branch can pass
CI against an older base and merge into a `main` it was never tested against.
With it, GitHub forces a rebase or merge and CI re-runs — which is exactly the
Integrator's "branch advanced during the task" scenario, enforced by the
platform instead of by discipline.

---

## Known baselines — why two checks are not required yet

Both run on every push and report in full. Neither is weakened, disabled or
suppressed.

**`security-invariant-report`** — the dual-permission wiring invariant fails
against a large pre-existing inventory (796 violations of 894 in-scope handlers
in the latest audited run). Requiring it would block every unrelated PR on
accumulated debt, which teaches people to bypass CI. Promote it to required once
the inventory reaches zero; progress is tracked in
[`ci-recommendation.md`](ci-recommendation.md).

**`database-e2e-report`** — all fifteen suites now execute against ephemeral
PostgreSQL, but the latest audited run had 6 failing suites and 136 failing
tests. The job also swallows the Jest exit status. Fix and stabilize the suites,
then remove the fail-open handling before promotion; [[BUG-0049]] tracks the
evidence-integrity failure.

---

## What still needs manual setup

Branch protection **is** configurable from here and has been applied — see the
top of this file. What remains:

- Any repository or environment secrets CI may need later (none are needed by
  the current workflow — it uses only a placeholder `DATABASE_URL`)
- Deployment environments and their protection rules, if you later add a
  deploy job

---

## Verifying it works

After enabling, confirm the rule is real rather than nominal:

1. Open a PR with a deliberate typecheck error → `CI required gate` fails and
   merge is blocked.
2. Fix it, let CI pass, land the PR normally.
3. Confirm a direct push to `main` is refused.

A protection rule that has never been observed blocking anything should not be
assumed to be working.
