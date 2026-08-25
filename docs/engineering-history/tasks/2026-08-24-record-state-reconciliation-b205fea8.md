# Engineering History — Record-state reconciliation — verify what is actually resolved

| | |
|---|---|
| **Task Title** | Record-state reconciliation — verify what is actually resolved |
| **Task Type** | INFRA |
| **Date** | 2026-08-24 |
| **Architect Plan** | NOT_APPLICABLE — no ExecPlan. `PLANS.md` requires one for schema, auth, payroll, provisioning and integration changes; this task changes no code at all. Every edit is to a Markdown record or a generated index. |
| **Agents Used** | Architect (triage and disposition), QA (the retest that seventeen records were waiting on), Integrator (branch, commits, integration). **Deliberately not used:** Backend/API, Frontend, Database, Security — no code was written, so inventing a specialist handoff would have been ceremony. Reviewer was not invoked for the same reason: there is no diff to review for correctness, and the validators are the check that applies. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/record-state-reconciliation` |
| **Base SHA** | `0a5586f7902c5775dc0419ea0d672ff09c910d1c` |
| **Final Task SHA** | `b205fea8` — the branch was rebased onto `origin/develop` mid-task, so the pre-rebase SHAs in the commit list below no longer exist |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin agent/record-state-reconciliation:develop`) in two fast-forwards, `9fbd3958..363fe705` then `363fe705..b205fea8`. No merge commit exists by design: a fast-forward keeps `develop`'s tip byte-identical to the SHA CI verified. |
| **Final Target SHA** | `b205fea8` — `origin/develop` and the task branch are the same commit |

### Commits

Post-rebase, in the order they sit on `develop`:

```
d0081254 docs(backlog): verify seventeen records that were fixed but never retested
524c3579 docs(tasks): close six work packages whose blockers were discharged days ago
61c51526 docs(backlog): close ITEM-0053, narrow ITEM-0068, corroborate BUG-0904
363fe705 docs(knowledge): the unowned-verification-step pattern
b205fea8 docs(ops): ITEM-0094 — the go-live check is blind to webhook delivery
```

The first four were originally `f41fd216`, `90d7bede`, `e5154954` and
`c7764a3b`. `develop` gained two commits mid-task — the `main` merge-back
(`6ed7a440`) and a concurrent session's closure (`9fbd3958`) — so the branch was
rebased onto them and every SHA changed. The superseded ids are recorded here
only so that CI runs `32759286287` and `32760548792` can be traced to commits
that no longer exist.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            a3e15568 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      e5154954 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
```

### Files Changed

54 file(s) against `origin/develop`.

```
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md
M	docs/backlog/items/ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site.md
M	docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md
M	docs/backlog/items/ITEM-0078-no-end-to-end-payment-to-provisioned-tenant-run-against-stri.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si.md
M	docs/bugs/BUG-0714-customer-emails-link-to-the-vercel-app-host-and-api-base-url.md
M	docs/bugs/BUG-0767-render-yaml-is-not-what-production-runs-so-no-seed-or-legal-.md
M	docs/bugs/BUG-0792-qatar-market-resolves-to-gcc-because-its-country-row-is-neve.md
M	docs/bugs/BUG-0793-checkout-quotes-the-alphabetically-first-plan-price-currency.md
M	docs/bugs/BUG-0794-plan-record-page-pricing-tab-is-filtered-out-leaving-plan-pr.md
M	docs/bugs/BUG-0795-saved-table-preferences-hide-every-column-added-to-a-module-.md
M	docs/bugs/BUG-0796-tenant-and-plan-list-summaries-omit-createdbyid-so-the-creat.md
M	docs/bugs/BUG-0877-editing-a-plan-price-always-fails-with-property-synctostripe.md
M	docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md
M	docs/bugs/BUG-0899-production-cannot-deploy-the-release-chain-always-fails-beca.md
M	docs/bugs/BUG-0901-a-paid-order-records-totalamount-0-00-for-every-flat-plan-wh.md
M	docs/bugs/BUG-0902-marktenantready-has-no-caller-so-a-paid-workspace-is-never-m.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/bugs/BUG-0906-production-has-no-published-legal-documents-so-purchases-rec.md
M	docs/bugs/BUG-0907-an-unknown-legal-slug-answers-200-and-hangs-on-the-loading-s.md
M	docs/bugs/BUG-0976-a-disallowed-cors-origin-returns-500-and-writes-an-error-log.md
M	docs/bugs/BUG-0989-every-stripe-webhook-delivery-to-production-fails-so-a-payme.md
M	docs/bugs/BUG-0994-plan-entitlements-blank-out-on-save-and-the-next-save-delete.md
M	docs/bugs/BUG-0995-editing-any-plan-price-500s-once-its-stripe-product-id-goes-.md
A	docs/deployment/release-history/2026-08-24-production-6ed7a44.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
A	docs/qa/scenarios/QA-LEGAL-003-every-seeded-legal-document-is-publishable-by-the-release-ch.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-015-legal.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0049-record-state-reconciliation-verify-what-is-actually-resolved.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
M	docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md
M	docs/tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md
M	docs/tasks/TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-.md
M	docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
M	docs/tasks/TASK-0010-go-live-readiness.md
M	docs/tasks/TASK-0011-first-production-release.md
M	docs/tasks/TASK-0018-legacy-pricing-removed-and-the-commercial-catalogue-made-to-.md
M	docs/tasks/active.md
M	docs/tasks/blocked.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

None. The branch was cut from `origin/develop` at `0a5586f` and no other session
held a lease on the record indexes during the work — `session.mjs list` reported
zero active sessions at start.

Worth stating explicitly, because this task rewrites six generated indexes and
the remediation inventory, which is exactly the ground two concurrent sessions
would collide on. It was checked first rather than discovered at merge time.

## Conflict Resolutions

Not applicable — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md`](../../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md) — **PASS WITH RISKS**. 16 suites, 134 tests, 0 failures. Risks are stated there: no e2e execution, no stash-and-rerun proof, no read of the production environment. |
| **Bug IDs** | **Closed (FIXED/PRODUCT_DECISION → VERIFIED), 17:** BUG-0163, 0714, 0767, 0792, 0793, 0794, 0795, 0796, 0877, 0899, 0901, 0902, 0906, 0907, 0976, 0994, 0995. **Rewritten:** BUG-0989 (filed as an empty template; now investigated and root-caused). **Rescoped:** BUG-0898 (narrowed from "no price has ever been synced" to "3 of 4 plans cannot be sold, and the one that can is TEST-mode"). **Evidence added, still open:** BUG-0904. **Left FIXED deliberately:** BUG-0900 — its regression test is an e2e spec this run could not execute. |
| **Backlog Items** | **Closed:** ITEM-0053 (all four acceptance criteria verified against production). **Narrowed:** ITEM-0068 — five of six criteria met by `4b1f1953`; retitled to name the one that is not, and moved off `PLAN_REQUIRED` since the plan was executed. **Dependency cleared:** ITEM-0048 (`BlockedBy: BUG-0163`, now terminal). No items created. |

## CI

| | |
|---|---|
| **CI Run ID** | `32761912144` for `363fe705`, `32763516891` for `b205fea8`. Two integrations, two verdicts. Earlier runs on `90d7bede` (`32759286287`) and `c7764a3b` (`32760548792`) authorised nothing — the first was superseded by later commits, the second by the rebase. |
| **CI Result** | **PASS** on both integrated SHAs, each read on the exact commit pushed to `develop`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Because integration was a fast-forward, the merged SHA **is** the validated SHA —
there is no integrated result distinct from the branch. That is the property
ref-push exists to preserve, and it is why this section is short rather than
absent.

Run against the branch at each integrated commit:

| Command | Result |
|---|---|
| `npm run validate:framework` | **PASS** — 3675 checks at `b205fea8`; 3670 at `363fe705` |
| `npm run backlog:check` | PASS — 241 records, 0 structural errors |
| `npm run qa:check` | PASS — 21 plans, 182 scenarios |
| `npm run tasks:check` | PASS — 18 tasks |
| Regression suites | 16 suites, 134 tests, 0 failures (see the QA run) |
| `CI required gate` | PASS on both `363fe705` and `b205fea8` |

No application code changed, so no build or typecheck was warranted beyond what
CI ran.

## Release / Deployment Impact

**None — not deployed, and nothing here can be.** The task changes no code, so
there is nothing to ship and no rollback class applies.

It does, however, **document** a deployment that had gone unrecorded:
[`2026-08-24-production-6ed7a44.md`](../../deployment/release-history/2026-08-24-production-6ed7a44.md)
is the first record in `docs/deployment/release-history/`, written after eight
releases had reached production with none. It documents deployed state verified
from outside — smoke suite, health endpoint, deploy log — and says so plainly
rather than reconstructing deploys nobody observed.

## Knowledge Capture

**One new bug pattern:**
[`docs/qa/known-bug-patterns/unowned-verification-step.md`](../../qa/known-bug-patterns/unowned-verification-step.md).

The lesson is that a state requiring evidence needs an **owner for gathering
it**, not merely a rule forbidding the transition without it. Sixteen records
stalled between two roles: the specialist finishes when the fix and its
regression test land, and QA is invoked per task rather than sweeping records
other tasks left behind. Nothing was broken; the reading of evidence already in
the repository was simply never done.

The pattern deliberately carries its own counterweight — [[premature-completion]]
is the inverse failure, and a careless sweep of stale records causes it. That is
why every closure here names executed output, and why [[ITEM-0068]] was left open
despite a false headline.

**One new QA scenario and one new regression entry:** QA-LEGAL-003 and REG-244,
both covering the seed-versus-publisher contract behind BUG-0899.

## Obsidian Sync

NOT_RUN. `scripts/sync-obsidian.mjs` needs a local vault configuration this
environment does not hold, so running it would fail rather than sync. Recorded
as not run rather than skipped silently.

Everything this task produced is Git-tracked and will reach the vault on the
next sync from a configured machine: the QA run, QA-LEGAL-003, REG-244,
ITEM-0094 and the `unowned-verification-step` pattern all carry the wikilinks
`knowledge:verify` checks for.

## Cleanup

The worktree `D:/My Work/hrm-dijipeople/dijipeople-recon` and the branch
`agent/record-state-reconciliation` are **retained**, not removed, because the
task is not finished: [[BUG-0989]] is diagnosed and awaiting one operator
confirmation (a Stripe **Resend**), and closing it needs this worktree.

`PRIMARY_WORKTREE_STATUS = DIRTY_USER_OWNED`. The user's primary checkout was
not touched at any point and carried the same two modified files throughout:

| Path | Owner |
|---|---|
| `apps/landing/next-env.d.ts` | user — the known [[ITEM-0058]] churn |
| `services/api/prisma/seed-legal.ts` | user — pre-existing, unrelated |

Both were present before this task started and were left exactly as found.
`UNEXPLAINED_DIRTY_FILES = 0`.

One change was made outside the repository, and it is recorded here because
nothing else would record it: `.claude/settings.local.json` in the primary
checkout gained a permission rule for the Render env-var API, at the user's
instruction. **It did not take effect** — the call is still refused — so the
rule is inert and harmless, but it is a real edit to a user-owned file and is
named rather than left for them to find.

## What happened after this record was filed

This record was completed at `b205fea8`, when the session's stated scope —
reconciling stale records — was finished. The session then continued at the
owner's direction and did substantially more. Recording that here rather than
leaving the history to describe a third of the work, because a history that
stops where the plan stopped is the same defect this whole session was about.

**Phase 2 — the payment path, from a single Resend.** Asking the owner to resend
one failed Stripe delivery confirmed [[BUG-0989]] was fixed and immediately
exposed [[BUG-1128]] underneath it: `invoice.paid` could not resolve, because
`invoice.subscription` and `invoice.metadata` moved to
`invoice.parent.subscription_details` in a newer Stripe API version. The handler
was written against one version and exercised against another, and nothing
asserted the two agreed. Fixed to read both shapes.

**Phase 3 — silent data loss.** Re-measuring the catalogue afterwards found nine
Starter prices gone. [[BUG-1133]]: both admin write paths superseded on
`{planId, billingCycle, currency}` while the unique index is on five columns, so
saving a PER_SEAT price destroyed the FLAT price beside it and reached across
markets. [[BUG-1134]], the 500 the owner had reported, turned out to be
*limiting* its blast radius — which is why they were fixed together.

**Phase 4 — the first production release**, `2609275` via PR #46. The deploy
repaired the nine prices by itself, as [[TASK-0019]] predicted before the merge
rather than explained afterwards.

**Phase 5 — a rendering defect nothing could see.** The tenant list led with
`Customer` and showed no tenant name. Not caused by the release — verified
before anything was changed — but a saved column preference overriding the
definition. [[ITEM-0097]], and the first browser coverage of an admin screen.

**Phase 6 — the second release**, `08d79012` via PR #47.

### What this session got wrong

Kept because the corrections are the useful part:

- **A false root cause, stated with evidence and still wrong.** [[BUG-0904]] was
  reasoned from a commit message counting four blockers, assuming the outbox
  worker was among them. Running the script proved it was not. Real evidence,
  from inside the environment, and a false conclusion — because the composition
  of a total was inferred from the total.
- **Four CI failures, all mine.** One prettier violation, then three in Flow G:
  no sign-in, two assertions that would have passed while the table was broken,
  and a selector matched against an accessible name containing more than the
  title. Each Flow G failure was the same error the suite exists to catch,
  committed while writing it.
- **Backticks in a `git commit -m`**, expanded by bash, three words silently
  deleted from a message. A standing note warns about exactly that.
- **Claiming an integration that had not happened** — the landing parity commit
  was reported as integrated while it sat on the branch. Corrected in the next
  message.

### Final state

| | |
|---|---|
| Releases to production | 2 — `2609275`, `08d79012` |
| Records closed | 17 bugs verified, 6 work packages, 3 tasks |
| New records | BUG-1128, BUG-1133, BUG-1134, ITEM-0094 to ITEM-0097 |
| New regressions | REG-244 to REG-248 |
| New QA scenarios | QA-LEGAL-003, QA-BILLING-017 to QA-BILLING-020 |
| Open CRITICAL | 5 → 4 |
| Production price catalogue | 27 → 36 active, repaired by the deploy |
