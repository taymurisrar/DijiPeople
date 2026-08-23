# Engineering History — Landing site full E2E: what a go-live actually requires

| | |
|---|---|
| **Task Title** | Landing site full E2E: what a go-live actually requires |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-23 |
| **Architect Plan** | TODO — path to the ExecPlan, or NOT_APPLICABLE with a reason |
| **Agents Used** | TODO — and which were deliberately not used |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/landing-e2e-go-live` |
| **Base SHA** | `1dd74a25d2cf6179658a3e69e74df096ced79653` |
| **Final Task SHA** | `cbf9090eb2e743d10eb56a0d41596437d94484bf` |
| **Target Branch** | `develop` |
| **Merge Commit** | TODO — filled after the merge |
| **Final Target SHA** | TODO — filled after the target is pushed |

### Commits

```
78ece817 fix(commerce): a paid customer gets the workspace they paid for
539d99ce test(landing): cover the public surface, and stop a soft 404 being indexed
789eeaca test(e2e): make the paid-customer journey a test, and give the inventory a generator
cbf9090e docs(qa): the go-live run, and a disposition for every finding it produced
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            7b7d0858 [develop]
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
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        cbf9090e [agent/landing-e2e-go-live]
```

### Files Changed

58 file(s) against `origin/develop`.

```
M	apps/landing/app/legal/[slug]/page.tsx
M	docs/backlog/README.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0085-no-bulk-command-exists-to-sync-plan-prices-to-stripe-so-a-la.md
A	docs/backlog/items/ITEM-0086-smoke-deployment-does-not-assert-that-a-launched-market-has-.md
A	docs/backlog/items/ITEM-0087-stripe-api-version-is-commented-out-in-the-local-api-env-and.md
A	docs/backlog/items/ITEM-0088-npm-workspace-api-run-start-dev-always-frees-port-4000-regar.md
A	docs/backlog/items/ITEM-0089-the-contact-form-is-the-only-public-lead-creating-form-with-.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
A	docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md
A	docs/bugs/BUG-0899-production-cannot-deploy-the-release-chain-always-fails-beca.md
A	docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md
A	docs/bugs/BUG-0901-a-paid-order-records-totalamount-0-00-for-every-flat-plan-wh.md
A	docs/bugs/BUG-0902-marktenantready-has-no-caller-so-a-paid-workspace-is-never-m.md
A	docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md
A	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
A	docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md
A	docs/bugs/BUG-0906-production-has-no-published-legal-documents-so-purchases-rec.md
A	docs/bugs/BUG-0907-an-unknown-legal-slug-answers-200-and-hangs-on-the-loading-s.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-23-landing-go-live-e2e-789eeac.md
A	docs/qa/scenarios/QA-BILLING-016-a-flat-plan-price-bills-one-subscription-not-one-seat-per-he.md
A	docs/qa/scenarios/QA-LANDING-016-an-unknown-legal-slug-is-a-real-404-not-a-streamed-200.md
A	docs/qa/scenarios/QA-ONBOARDING-001-a-paid-self-service-order-provisions-a-workspace-and-reports.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-004-commercial-onboarding.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-016-seat-billing.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0044-landing-site-full-e2e-ui-forms-checkout-payments-provisionin.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
A	e2e/fixtures/landing-target.ts
A	e2e/tests/landing-checkout-provisioning.spec.ts
A	e2e/tests/landing-public-forms.spec.ts
A	e2e/tests/landing-public-surface.spec.ts
A	e2e/tools/README.md
A	e2e/tools/accessibility-sweep.mjs
A	e2e/tools/drive-checkout.mjs
A	e2e/tools/layout-shift-detail.mjs
A	e2e/tools/layout-shift-throttled.mjs
A	e2e/tools/sync-stripe-prices.mjs
A	e2e/tools/web-vitals.mjs
M	package.json
A	scripts/sync-remediation-inventory.mjs
M	services/api/src/modules/billing/billing-seat-pricing.spec.ts
M	services/api/src/modules/billing/billing-seat-pricing.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/permissions/permission-bootstrap.service.ts
M	services/api/src/modules/super-admin/provisioning-requested.handler.ts
```

## Conflicts

TODO — Integrator. For each conflict: the files, the type from the nine-type
taxonomy in [`.agent/agents/integrator.md`](../../../.agent/agents/integrator.md),
and what each side intended.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

TODO — Integrator. For each conflict above: what was chosen, and **what would
have been lost by choosing the other side**. This is the field a script cannot
fill and the reason this record is prose.

## QA

| | |
|---|---|
| **QA Report** | TODO — `docs/qa/runs/…` and the verdict |
| **Bug IDs** | TODO — `BUG-nnnn` records created or closed by this task |
| **Backlog Items** | TODO — `ITEM-nnnn` records created, advanced or closed |

## CI

| | |
|---|---|
| **CI Run ID** | TODO — the run whose `CI required gate` verdict authorised the merge |
| **CI Result** | TODO — PASS / FAILED / PENDING / BLOCKED_BY_ACCESS / UNAVAILABLE |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

TODO — QA. The commands actually run against the **merged** SHA, and their
results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

TODO — Release/DevOps. Whether this reaches an environment, the rollback class,
and the release record if one exists. `None — not deployed.` is a complete
answer.

## Knowledge Capture

TODO — which `docs/knowledge/` files were written or updated, and their
categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

TODO — whether `node scripts/sync-obsidian.mjs` ran, and which `Generated/`
folders changed.

## Cleanup

TODO — worktree removed, local branch deleted, or the reason neither was.
