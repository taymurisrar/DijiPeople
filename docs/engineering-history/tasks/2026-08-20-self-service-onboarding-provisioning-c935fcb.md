# Engineering History — Self service onboarding provisioning

| | |
|---|---|
| **Task Title** | Self service onboarding provisioning |
| **Task Type** | FEATURE (LARGE) — with BUGFIX, SECURITY, DATABASE and QA packages inside it |
| **Date** | 2026-08-20 |
| **Architect Plan** | [`TASK-0008`](../../tasks/TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-.md); [`EXECPLAN-0001`](../../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md) for WP-10 |
| **Agents Used** | Architect, Database, Backend/API, Frontend, UI/UX, Integration, Security, QA, Reviewer, Integrator. **Not used:** Release/DevOps — nothing here deploys and `main` is untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/self-service-onboarding-provisioning` |
| **Base SHA** | `5a47dfff0c4cb98cd10d8df533645147e7ac8c72` |
| **Final Task SHA** | `c935fcbd83e7a9a8aa7856fdc70b1840a0774269` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integration was a ref-push, so `develop` fast-forwards to the task SHA rather than gaining a merge commit |
| **Final Target SHA** | `09f24ea98e18412c69ef84a32e64e1c5a3548ebe` on `develop` |

### Commits

```
a40f038 fix(billing,guards): rate limit the public subscribe write, and let the invariant see it — BUG-0075
8b51613 docs(task): correct the TASK-0008 reconciliation against CustomerAccount
4f966ea feat(billing): reserve the workspace address at checkout — TASK-0008 WP-01
0177db9 docs: TASK-0007 WP-07 closed DONE with half its scope unbuilt — BUG-0077, BUG-0078
73b25b6 docs(session): record SESSION-0018 scope, concurrency and outcome
7480756 feat(provisioning): payment authorises provisioning — BUG-0077, BUG-0078, TASK-0008 WP-10
46c24b1 feat(billing): report real provisioning state to the buyer — TASK-0008 WP-03
b68c7bf feat(billing): prove the owner email before charging — TASK-0008 WP-02
1da7add feat(billing,legal): the onboarding API surface — TASK-0008 WP-04
2b07be4 feat(landing): the public onboarding wizard — TASK-0008 WP-11
a60ba83 feat(legal): entity blanks that cannot be published unfilled
7557d14 feat(legal): name the operator — DijiPeople (SMC-PRIVATE) LIMITED
d4c0b00 feat(billing): placeholder PKR schedule, seeded as drafts — OD-01
4081e79 docs: the checkout path proven against real Stripe — BUG-0080
e9f977c fix(landing,legal): the prices were right, the words were wrong — BUG-0080
ffda0e3 feat(landing): the success page reports provisioning instead of guessing at it
71f1795 fix(landing,web,admin): write the invariant three comments claimed existed — BUG-0081
f5bd870 fix(landing): the wizard stops collecting data it cannot submit — BUG-0082
d054769 test(api,legal): the QA campaign, and the two things it found in the legal seed
c935fcb merge: bring develop into agent/self-service-onboarding-provisioning
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            5a47dff [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                c935fcb [agent/self-service-onboarding-provisioning]
```

### Files Changed

106 file(s) against `origin/develop`.

```
A	apps/admin/lib/forwarded-headers.invariant.spec.ts
M	apps/admin/lib/forwarded-headers.ts
A	apps/landing/app/api/public/onboarding/[onboardingId]/status/route.ts
A	apps/landing/app/api/public/onboarding/[onboardingId]/verification-code/route.ts
A	apps/landing/app/api/public/onboarding/[onboardingId]/verify-email/route.ts
A	apps/landing/app/api/public/onboarding/[onboardingId]/workspace-address/route.ts
A	apps/landing/app/api/public/onboarding/route.ts
M	apps/landing/app/features/page.tsx
M	apps/landing/app/plans/page.tsx
M	apps/landing/app/plans/plans-experience.tsx
A	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/app/subscribe/page.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/app/subscribe/success/page.tsx
A	apps/landing/app/subscribe/success/provisioning-progress.tsx
M	apps/landing/lib/env.ts
A	apps/landing/lib/forwarded-headers.invariant.spec.ts
M	apps/landing/lib/forwarded-headers.ts
M	apps/landing/lib/legal-server.ts
A	apps/landing/lib/onboarding-wizard.spec.ts
A	apps/landing/lib/onboarding-wizard.ts
M	apps/landing/lib/plan-presentation.spec.ts
M	apps/landing/lib/plan-presentation.ts
A	apps/landing/lib/plans.spec.ts
M	apps/landing/lib/plans.ts
A	apps/landing/lib/provisioning-view.spec.ts
A	apps/landing/lib/provisioning-view.ts
M	apps/landing/next-env.d.ts
A	apps/web/lib/forwarded-headers.invariant.spec.ts
M	apps/web/lib/forwarded-headers.ts
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0060-schema-prisma-and-the-applied-migration-history-do-not-agree.md
A	docs/backlog/items/ITEM-0061-notification-coverage-is-asymmetric-seat-change-applied-and-.md
A	docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md
A	docs/backlog/items/ITEM-0063-self-service-checkout-must-prove-the-owner-email-before-char.md
A	docs/backlog/items/ITEM-0064-unscoped-duplicate-planprice-rows-shadow-every-real-price.md
A	docs/backlog/items/ITEM-0066-verify-database-mjs-cannot-spawn-npm-on-windows.md
A	docs/backlog/items/ITEM-0067-three-e2e-suites-need-two-seeded-tenants-and-no-seed-produce.md
M	docs/backlog/open.md
A	docs/bugs/BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian.md
A	docs/bugs/BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou.md
A	docs/bugs/BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic.md
A	docs/bugs/BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab.md
A	docs/bugs/BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d.md
A	docs/bugs/BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-19-self-service-onboarding-provisioning-f5bd870.md
A	docs/qa/scenarios/QA-BILLING-007-every-unauthenticated-write-handler-is-rate-limited.md
A	docs/qa/scenarios/QA-BILLING-008-an-unpaid-public-subscribe-creates-no-tenant.md
A	docs/qa/scenarios/QA-BILLING-009-a-confirmed-payment-provisions-exactly-one-workspace-automat.md
A	docs/qa/scenarios/QA-BILLING-010-checkout-cannot-open-until-the-owner-email-is-verified.md
A	docs/qa/scenarios/QA-LANDING-009-a-flat-price-is-never-described-as-per-employee.md
A	docs/qa/scenarios/QA-LANDING-010-every-direct-api-route-handler-forwards-the-visitor-address.md
A	docs/qa/scenarios/QA-LANDING-011-the-subscribe-wizard-refuses-to-collect-data-it-cannot-submi.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-017-subscription-orders.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0018-self-service-onboarding-provisioning-domain-routing-and-cent.md
M	docs/sessions/active.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	e2e/tests/flow-c-landing-public-surface.spec.ts
M	services/api/package.json
A	services/api/prisma/migrations/20260819090000_subscription_order_requested_slug/migration.sql
A	services/api/prisma/migrations/20260819140000_subscription_order_email_verification/migration.sql
A	services/api/prisma/migrations/20260819160000_subscription_order_owner_job_title/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-legal.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts
M	services/api/src/modules/auth/user-invitations.service.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/controllers/public-billing.controller.ts
A	services/api/src/modules/billing/dto/check-workspace-address.dto.ts
M	services/api/src/modules/billing/dto/public-subscribe.dto.ts
A	services/api/src/modules/billing/dto/start-onboarding.dto.ts
A	services/api/src/modules/billing/dto/verify-owner-email.dto.ts
M	services/api/src/modules/billing/services/billing.service.ts
A	services/api/src/modules/billing/services/owner-email-verification.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/billing/services/webhook.service.ts
A	services/api/src/modules/legal/legal-placeholders.spec.ts
M	services/api/src/modules/legal/legal.service.spec.ts
M	services/api/src/modules/legal/legal.service.ts
A	services/api/src/modules/outbox/emitted-events-have-consumers.invariant.spec.ts
M	services/api/src/modules/super-admin/commercial-bootstrap.ts
M	services/api/src/modules/super-admin/markets.catalog.ts
M	services/api/src/modules/super-admin/platform-onboarding.service.ts
A	services/api/src/modules/super-admin/provisioning-requested.handler.ts
M	services/api/src/modules/super-admin/super-admin.module.ts
M	services/api/test/legal-seed.e2e-spec.ts
A	services/api/test/payment-authorised-provisioning.e2e-spec.ts
M	services/api/test/subscription-order.e2e-spec.ts
```

## Conflicts

Nineteen files, in three groups. `develop` had moved 36 commits ahead while this
parent ran, carrying `agent/ci-e2e-remediation` and the TASK-0007 closure.

**Group 1 — generated indexes (13 files).** The four backlog indexes, the QA
coverage matrix, the scenario and test-plan indexes, both session indexes, both
task indexes and both dashboards. `DERIVED_ARTIFACT`. Both sides regenerated the
same files from different record sets; no text on either side was authored.

**Group 2 — durable records both sides edited (3 files).** The regression
register, the remediation inventory, and `TASK-0007`. `SHARED_RECORD`. Each side
appended its own work to a file the other was also appending to.

**Group 3 — three QA test plans.** `PLAN-002-authorization`,
`PLAN-007-tenant-provisioning`, `PLAN-013-landing`. The conflicting regions were
entirely inside the generated graph blocks.

Underneath the file-level conflicts sat one real collision: **both branches
independently claimed REG ids from 065 onward.** Develop's
`agent/ci-e2e-remediation` took 065–070; this branch had taken 065–069 and then
071–072. That is the second time this repository has hit it — develop's own
`2aacab8 docs(qa): renumber this branch's REG ids to 069-070 after the collision
on develop` is the first.

## Conflict Resolutions

**Group 1 — took develop's copy, then re-ran every generator.** Choosing either
side's text would have been wrong in the same way: an index is a statement about
the records, and after a merge the records are the union of both. Taking one
side produces a file that is internally consistent and factually wrong.
`validate-framework` caught exactly that, twice, while this was being settled.

**Group 2 — merged by hand, one at a time.**

- *Regression register.* Develop's 065–070 kept as authored; this branch's seven
  entries renumbered to 071–077 and appended. Taking either side outright would
  have deleted six real regressions. Renumbering the other direction was
  available and rejected: develop is the shared branch, its ids are already
  referenced by records that merged cleanly, and a task branch that renumbers
  the integration branch makes every other branch in flight wrong.
- *Remediation inventory.* Develop as the base, plus this branch's thirteen new
  rows and two `qa_scenarios` additions. `ITEM-0047` took develop's version
  entirely — it had moved from `READY` to `DONE` there, and keeping this
  branch's `READY` would have reopened finished work on paper.
- *TASK-0007.* Took develop's outright. This branch had no business editing it;
  its only local change was an index regeneration side-effect.

**Group 3 — took develop's copy and re-ran `rebuild-qa.mjs`,** which rewrote the
graph blocks from the merged scenario set.

**The renumbering was the expensive part, and the cost is worth recording.**
Seven ids across six bug records, seven QA scenarios, the QA run, the inventory
and the parent task — every reference had to move together, and a missed one
would not have failed loudly. It would have pointed a record at somebody else's
regression and read perfectly well. The id allocator that exists for BUG and
ITEM ids does not exist for REG ids, which is why this has now happened twice.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-19-self-service-onboarding-provisioning-f5bd870.md`](../../qa/runs/2026-08-19-self-service-onboarding-provisioning-f5bd870.md) — **PASS WITH RISKS** |
| **Bug IDs** | Created and fixed: BUG-0075, BUG-0077, BUG-0078, BUG-0080, BUG-0081, BUG-0082 |
| **Backlog Items** | Created: ITEM-0060 … ITEM-0064, ITEM-0066, ITEM-0067. Triaged to DEFER: ITEM-0061, ITEM-0064, ITEM-0066. Withdrawn as DUPLICATE: ITEM-0067 |
| **Regressions** | REG-071 … REG-077, renumbered from 065–069 and 071–072 |
| **QA Scenarios** | QA-BILLING-007 … 010, QA-LANDING-009 … 011 |

## CI

| | |
|---|---|
| **CI Run ID** | [`32318019957`](https://github.com/taymurisrar/DijiPeople/actions/runs/32318019957) — on `09f24ea`, the exact SHA integrated |
| **CI Result** | **PASS** — `CI required gate` success, all fourteen jobs green including Browser e2e and Database e2e |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `c935fcb`, the merge commit — not against the pre-merge branch,
which is a different tree.

| Command | Result |
|---|---|
| `npm --workspace api run test` | 1418 / 1418 |
| `npx jest --config ./test/jest-e2e.json`, real PostgreSQL | **326 / 326, 26 suites, exit 0** |
| `npm --workspace landing run test` | 109 / 109 |
| `npm --workspace web run test` | 408 / 408 |
| `npm --workspace admin run test` | 101 / 101 |
| `npm --workspace api run check-types` | pass |
| `npm --workspace landing run check-types` | pass |
| `npx eslint` — landing, web, admin | 0 errors (25 pre-existing warnings) |
| `npm run validate:framework` | 2855 checks |

The e2e figure is the one that moved. On the pre-merge branch the same command
reported 231 / 312, with 81 tests failing in `beforeAll` on a missing second
tenant. Every one of those had already been fixed on `develop` under ITEM-0047 /
REG-070 before this campaign ran. **The lesson is the ordering:** a QA baseline
taken before merging the integration branch rediscovers work somebody else has
finished, and buries its own findings in the noise. Recorded in the QA run, in
TASK-0008's WP-08 section, and as the withdrawal reason on ITEM-0067.

## Release / Deployment Impact

None — not deployed. `main` is untouched.

Two things here will matter at deploy time, called out so a future release does
not meet them cold:

- **One migration.** `requestedSlug` on `SubscriptionOrder` — a single nullable
  unique column. Additive, no backfill, safe to apply ahead of the code.
- **`seed:legal` joined `seed:all`, deliberately not `release`.** Adding a seed
  to the production release path is a deployment decision and this is not a
  `RELEASE` task. Whoever makes it should know the documents seed as DRAFT and
  publish nothing on their own.

## Knowledge Capture

Three lessons outlive this parent, and all three are about how defects survive
rather than about the self-service path itself:

1. **A guard made of markup is deleted by the next rewrite.** BUG-0066's fix was
   a disabled `<fieldset>` and an id on a paragraph. WP-11 rewrote that screen,
   kept the fields, replaced everything around them, and the guard vanished
   without a single test noticing — BUG-0082. A named function with a unit test
   survives what an element cannot.
2. **A comment claiming a check is worse than no check.** Three apps asserted
   that `forwarded-headers.invariant.test.ts` failed the build. No such file
   existed. The convention held anyway, which is precisely what made it
   dangerous: nothing to find, and a sentence telling every reviewer not to
   look — BUG-0081.
3. **A test's premise expires; its guard should not.** `legal-seed` forbade any
   legal entity because "DijiPeople is not incorporated". The company now
   exists. Inverting the assertion — the operator must be named, and every
   registration-shaped number must be one the owner actually gave — kept the
   guard and found a real defect on its first run: `billing-terms` named no
   counterparty at all.

Captured in the bug records, the regression register (REG-076, REG-077) and the
scenarios, which is where `retrieve-knowledge.mjs` reads from.

## Obsidian Sync

`npm run knowledge:sync` ran, then `npm run knowledge:verify` reported
`OBSIDIAN_SYNC_STATUS = PASS` with `OBSIDIAN_PARITY_DIFFS 0`.

The first verify failed, and usefully: every `[[REG-nnn]]` wikilink resolved to
nothing. REG entries live in one register file rather than as individual notes,
so the links were pointing at notes that cannot exist. Stripped to plain text
across five records — the same correction `8cff00f` had already made once on
another branch.

## Cleanup

Task worktree kept — `D:/My Work/hrm-dijipeople/DijiPeople-selfservice` still
carries the branch, and WP-06 remains open against it. Branch not deleted for
the same reason.

Throwaway databases dropped: `dijipeople_t8_test` and `dijipeople_wp08_test`.
`dijipeople_wp09_test` retained until this record is filed, then dropped. The
populated `dijipeople` development database was read-only throughout and
`dijipeople_wp_test` was left to its owning session.

The user's primary checkout at `D:/My Work/hrm-dijipeople/DijiPeople` is clean
and was never written to by this session.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0066]] · [[BUG-0075]] · [[BUG-0077]] · [[BUG-0078]] · [[BUG-0080]] · [[BUG-0081]] · [[BUG-0082]] · [[ITEM-0047]] · [[ITEM-0060]] · [[ITEM-0061]] · [[ITEM-0062]] · [[ITEM-0063]] · [[ITEM-0064]] · [[ITEM-0066]] · [[ITEM-0067]] · [[PLAN-002]] · [[PLAN-007]] · [[PLAN-013]] · [[PLAN-017]] · [[QA-BILLING-007]] · [[QA-BILLING-008]] · [[QA-BILLING-009]] · [[QA-BILLING-010]] · [[QA-LANDING-009]] · [[QA-LANDING-010]] · [[QA-LANDING-011]] · [[SESSION-0018]] · [[TASK-0005]] · [[TASK-0007]] · [[TASK-0008]]

<!-- GRAPH:END -->
