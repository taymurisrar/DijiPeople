# Engineering History — Checkout customer fidelity, payment confirmation, and a database four migrations behind

| | |
|---|---|
| **Task Title** | Checkout customer account fidelity, payment confirmation, and the PlanPrice migration drift |
| **Task Type** | BUGFIX + AUDIT — four defects found, two fixed, two recorded with reasons |
| **Date** | 2026-08-21 |
| **Architect Plan** | NOT_APPLICABLE — `PLANS.md` requires an ExecPlan for schema, migration, auth/permission, payroll and attendance changes. No Prisma model changed and no migration was authored; four already-committed migrations were **applied** to a development database, which is an operation, not a schema change. The two findings that *would* need an ExecPlan ([[BUG-0281]], [[ITEM-0076]]) are recorded rather than built, for that reason |
| **Agents Used** | Architect, Backend/API, Database (migration application and coherence verification), QA, Product & Backlog Steward, Reviewer, Integrator, Knowledge & Graph. **Deliberately not used:** Frontend and UI/UX — the landing wizard was read and measured, and deliberately not changed; Security — no guard, permission key or tenant-scoped query changed, and the one authorization question raised ([[BUG-0281]]: never resolve a partner from a client-supplied id) is recorded for the plan that will implement it; Release/DevOps — nothing reaches an environment |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/checkout-account-and-payment-confirmation` |
| **Base SHA** | `cf9ea477ef8b053d6f5668154351409e1c21728f` |
| **Final Task SHA** | `d8d27abeec5df874d18cf53b3fdf83aefc7ac196` |
| **Target Branch** | `develop` |
| **Merge Commit** | None. Integrated by ref-push, so `develop` took the exact CI-verified SHA |
| **Final Target SHA** | `d8d27abeec5df874d18cf53b3fdf83aefc7ac196` — identical to the task SHA |

### Commits

```
fa45bde fix(billing): a self-service customer record that says what the customer bought
d8d27ab docs(records): four bugs and two decisions from the checkout audit
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople            cf9ea47 [develop]  <- user's primary, CLEAN
D:/My Work/hrm-dijipeople/dijipeople-checkout   d8d27ab [agent/checkout-account-and-payment-confirmation]
```

### Files Changed

31 file(s) against `origin/develop`; the source changes are five.

```
M	.github/workflows/ci.yml
M	package.json
M	packages/config/platform-runtime-schema.generated.json
M	scripts/generate-platform-runtime-schema.mjs
M	services/api/src/modules/billing/services/subscription-order.service.ts
A	services/api/src/modules/billing/services/checkout-customer-record.spec.ts
A	docs/bugs/BUG-0280, BUG-0281, BUG-0282, BUG-0283
A	docs/backlog/items/ITEM-0075, ITEM-0076
A	docs/qa/scenarios/QA-BILLING-012, QA-PLATFORM-006
A	docs/sessions/SESSION-0031
M	docs/qa/regressions/index.md  (REG-177, REG-178)
M	docs/tasks/remediation/TASK-0005-inventory.json  (six rows)
M	docs/backlog/*, docs/qa/*, docs/sessions/*, docs/knowledge/dashboards/*  (regenerated)
```

## The four questions, and what each turned out to be

### Why the agent failed

`GET /api/platform-runtime/plans` returned 500 with
`column PlanPrice.overageUnitAmount does not exist`. The column exists in
`schema.prisma` and in migration `20260820140000`. **The development database
was four migrations behind**, and had been since 2026-08-20.

It had not broken before because the generated Prisma client in `node_modules`
was equally stale: a client that does not know about a column does not select
it, so two stale artifacts agreed with each other and the application worked.

The trigger was mine. The previous session ran `prisma generate` to clear
43 phantom type errors during a typecheck; the client caught up at
2026-08-21T15:13:56Z and the first 500 landed at 15:43:54Z — thirty minutes
later, on a screen with no connection to that work. Worth stating plainly: I
made a day-old latent drift visible, and the error log names the module it
surfaced in rather than the cause.

Fixed by applying the four pending migrations — all additive, no `DROP`,
`DELETE` or `TRUNCATE` in any of them — under the `schema` write lease, then
re-executing the exact failing query. It returns four plans with their prices.
`db:preflight` reports all four fields `CURRENT`.

The **guard** is recorded and not built ([[BUG-0283]]): `db:preflight` already
detects this and nothing runs it, and where a pending-migration warning belongs
is a developer-workflow decision. Refusing to boot is explicitly not proposed —
a developer deliberately on an older database should not be locked out.

### Whether checkout reflects all the data on the Customers module

It did not, and the gap had a clean shape. Two paths create a `CustomerAccount`:
`convertLeadToCustomer` writes twenty-two columns, `resolveCustomer` wrote
eleven, and the eleven excluded every commercial column the module reports on.

The reason it survived review is worth keeping. Grepping `selectedPlanId` in
`modules/billing` returns a hit — in `openOnboarding`, which writes
`CustomerOnboarding`, a different row, after payment. From that one line the
column looks covered. `preferredBillingCycle` has no writer in `billing` at all.

Fixed by passing the order's commercial selection into `resolveCustomer`. For a
returning buyer the columns fill gaps and never overwrite, because somebody who
paid for Starter monthly and then abandons a Growth annual checkout must not end
up recorded on a plan they never bought.

Three further gaps were measured and recorded rather than closed: partner
attribution is lost entirely on this path ([[BUG-0281]] — the fix has to resolve
the partner server-side or anyone can assign themselves a commission),
`companySize` is accepted by the DTO and never collected by the wizard
([[ITEM-0075]]), and no owner is assigned to a self-service customer at all.

### How a payment is confirmed

One input: a signature-verified Stripe webhook. `constructEvent` verifies,
`WebhookService` resolves `checkout.session.completed` to an order, and only
when `payment_status === 'paid'` does `confirmPayment` mark it `PAID`, stamp
`paidAt`, set the customer `ACTIVE`, and emit `PAYMENT_CONFIRMED` in one
transaction. The outbox consumer opens onboarding and requests provisioning.
The browser redirect is deliberately not evidence — `provisioning-view.ts` says
so in a comment.

Which is why the reported screenshot sat on "We're confirming your payment": the
most recent Stripe webhook of any kind in that database predated the checkout by
eleven days. In development Stripe cannot reach `localhost` without
`stripe listen --forward-to`, and neither the customer page nor the operator
side says so.

The question asked was whether a manual status could be added to the form. The
answer is on [[ITEM-0076]] with the reasoning: it would let the platform witness
its own payment, and — the part that decides it — it would set the column
without emitting `PAYMENT_CONFIRMED`, so provisioning still would not run and
the failure would merely *look* resolved. The recommendation is a permissioned,
audited "Re-check payment with Stripe" action delegating to the same
`confirmPayment` path.

### The finding nobody asked about

`originChannel` — the column that says whether a customer came from sales or
self-service — could not be displayed by Platform Admin even once written,
because `platform-runtime-schema.generated.json` had drifted from
`schema.prisma`. Four other real scalar columns were invisible with it.

`test:runtime-schema` validates the **registry against the manifest**, so a
stale manifest and a registry built from it agree, and CI passed. The registry's
own `schemaCoverageModules` rule iterates the manifest too, so the missing
columns were missing from the coverage check as well.

Fixed, and guarded: the generator gained a `--check` mode wired into the CI gate.

## Conflicts

None. `session.mjs check --paths` reported no contested lease, and
`origin/develop` did not move during the task.

## Conflict Resolutions

Not applicable.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record; the evidence is the two scenarios and the suites below |
| **Bug IDs** | BUG-0280 (FIXED), BUG-0282 (FIXED), BUG-0281 (OPEN, PLAN_REQUIRED), BUG-0283 (OPEN, PLAN_REQUIRED) |
| **Backlog Items** | ITEM-0075 (DEFERRED), ITEM-0076 (PRODUCT_DECISION) |
| **QA Scenarios** | QA-BILLING-012 under PLAN-016, QA-PLATFORM-006 under PLAN-019 |
| **Regressions** | REG-177, REG-178 |

Both regressions were **observed to fail under mutation**:

- REG-177 — removing `selectedPlanId` from the create payload fails 1 of 4. The
  gap-fill and no-overwrite cases are separate assertions on purpose: one test
  checking only that the columns end up set would pass against an implementation
  that rewrites a paying customer's plan.
- REG-178 — restoring the previous manifest reports
  `customers: missing field originChannel` and eleven more, exit 1; restoring
  the regenerated one exits 0. Both directions were run.

### Known limitation

The checkout flow was **not exercised end to end**. Doing so needs a Stripe
webhook tunnel this environment does not have — which is the subject of
[[ITEM-0076]] — so the customer-record fix is proven by unit assertions over the
exact function that writes the row, not by a purchase. The migration fix *was*
proven against the real database by re-running the failing query.

## CI

| | |
|---|---|
| **CI Run ID** | [32502575998](https://github.com/taymurisrar/DijiPeople/actions/runs/32502575998) — `CI required gate` at `d8d27ab`, all fourteen jobs green |
| **CI Result** | PASS |

## Local Validation

```
npm --workspace api test src/modules/billing        7 suites, 64 tests
  checkout-customer-record.spec.ts                  4 tests, and 1 failure under mutation
npm --workspace admin test                          15 suites, 130 tests
npx tsc --noEmit (api, admin)                       0 errors
npx eslint src/modules/billing                      0 errors
npm run check:runtime-schema                        matches schema.prisma
npm run test:runtime-schema                         3 tests
npm run db:preflight                                PASS, 217 migrations, all applied
npm run validate:framework                          3,138 checks
backlog / qa / sessions / tasks --check             all current
```

The API typecheck needs `NODE_OPTIONS=--max-old-space-size=6144` on this
machine; the default heap dies on `tsconfig.build.json`.

## Post-Merge Validation

Re-run in the task worktree, whose tip is identical to `develop`:

```
node scripts/validate-framework.mjs   3,138 checks, 0 failures
node scripts/db-preflight.mjs         DATABASE_AGENT_STATUS PASS
```

## Release / Deployment Impact

None. No migration authored, no environment variable, no route contract change.
The applied migrations were already committed and are applied on deploy by
`npm run release:api`, so production was already ahead of the development
database rather than behind it.

`DEPLOYMENT_REQUIRED = no`.

## Knowledge Capture

- BUG-0280 / REG-177 — two creation paths for one record diverge silently, and
  the grep that would find it lands on a same-named column of a different model.
- BUG-0282 / REG-178 — the second register entry whose root cause is an
  assertion proving presence rather than reachability, after REG-176. Both
  passed because the artifact defining "everything" was the artifact that was
  wrong.
- BUG-0283 — two independently cached derivations of one schema mask each
  other's staleness, and the failure surfaces at an unrelated moment.
- ITEM-0076 — why payment state is the one commercial column the platform must
  not be its own witness for.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` wrote 35 notes and left 502 current, then
`--verify` read the vault back — the files, not the exit code:

```
OBSIDIAN_SYNC_STATUS          PASS
OBSIDIAN_REPO_TO_VAULT_DIFFS  0     OBSIDIAN_VAULT_TO_REPO_DIFFS  0
OBSIDIAN_SEMANTIC_LINK_ERRORS 0     OBSIDIAN_UNRESOLVED_LINKS     0
OBSIDIAN_GRAPH_ORPHANS        0     OBSIDIAN_STALE_NODES          0
OBSIDIAN_DUPLICATE_NODES      0
```

The 35 written notes are the four bug records, two backlog items, two QA
scenarios, the session, this history record, and the listing surfaces they
appear on.

## Cleanup

The primary checkout was CLEAN at session start and is CLEAN at the end. The
task worktree holds junctioned `node_modules` and a copied, gitignored
`services/api/.env` needed by `db:preflight`; both are removed at cleanup. The
`schema` write lease is released with the session.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0280]] · [[BUG-0281]] · [[BUG-0282]] · [[BUG-0283]] · [[ITEM-0075]] · [[ITEM-0076]] · [[PLAN-016]] · [[PLAN-019]] · [[QA-BILLING-012]] · [[QA-PLATFORM-006]] · [[SESSION-0031]] · [[TASK-0005]]

<!-- GRAPH:END -->
