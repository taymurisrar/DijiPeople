# Branch Protection — recommended settings for `main`

**Status: recommendation, and the missing half of a two-layer control.** These
settings were **not** applied — configuring them requires GitHub repository
admin access, which this environment does not have. Enable them in the
repository settings.

Remote: `https://github.com/taymurisrar/DijiPeople.git`

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

That job (`ci-required` in `.github/workflows/ci.yml`) aggregates the eight
required jobs and fails if any did not succeed. Requiring the aggregate rather
than the eight individually means **adding or renaming a job later does not
require touching branch protection** — a common source of silently-unenforced
rules.

The eight it aggregates:

| Job | What it protects |
|---|---|
| `validate` | Agent framework structure and consistency |
| `typecheck` | All 7 workspaces compile; Prisma schema valid |
| `lint` | web, admin, landing lint clean; **checkout not mutated** |
| `test-api` | 127 suites, 764 tests |
| `test-web` | 16 suites, 379 tests |
| `test-admin` | 4 suites, 23 tests |
| `test-runtime` | Platform runtime schema contract |
| `build` | Monorepo build |

**Deliberately not required** (both `continue-on-error`, see §Known baselines):

- `security-invariant-report`
- `lint-api-report`

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
against a large pre-existing inventory (780 violations of 878 in-scope handlers
at the time of writing). Requiring it would block every unrelated PR on
accumulated debt, which teaches people to bypass CI. Promote it to required once
the inventory reaches zero; progress is tracked in
[`ci-recommendation.md`](ci-recommendation.md).

**`lint-api-report`** — `services/api` carries 2 pre-existing ESLint errors on
`main`, both `@typescript-eslint/unbound-method` in
`src/modules/auth/auth.service.spec.ts` (lines 120 and 125). Fix those two and
this step can move into the required `lint` job. It is a small, self-contained
piece of work, deliberately left out of the CI task's scope because it edits
product test code.

---

## What cannot be configured from here

Repository settings are not modifiable through this environment. Also requiring
manual setup:

- Branch protection itself (the table above)
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
