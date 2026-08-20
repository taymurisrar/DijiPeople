# QA Run — self-service-onboarding-provisioning

## Metadata

| | |
|---|---|
| Date / time | 2026-08-20T02:00Z (started 2026-08-19T23:57Z) |
| Branch | `agent/self-service-onboarding-provisioning` |
| Commit SHA | `f5bd870` at start; findings fixed on top |
| Worktree | `D:\My Work\hrm-dijipeople\DijiPeople-selfservice` |
| Environment | Working tree dirty at start with this campaign's own fixes in progress — see below. Real PostgreSQL 18 at `localhost:5432/dijipeople_wp08_test`, created for this run and disposable. No external services hit: Stripe was exercised against the real test sandbox earlier in this parent. |
| QA agent | QA, under TASK-0008 WP-08 |
| Scope | The self-service acquisition path end to end — public onboarding API, email verification, payment-authorised provisioning, onboarding status, the landing wizard and the post-payment page. Plus every other DB-backed suite in the repository, because a campaign that only runs its own tests cannot tell a regression from a pre-existing failure. |

**On the dirty tree.** The uncommitted files were this campaign's own fixes for
findings F3 and F4 below, written while the run was in progress. Nothing else
was uncommitted; the user's primary checkout was untouched throughout.

## Requirement

TASK-0008 closes the gaps between the self-service brief and the repository: a
visitor buys a plan on the public site and finishes inside their own provisioned
workspace with no Platform Admin intervention. WP-08 is the campaign that
decides whether that is true, against a real database rather than mocks.

## Risk Areas

| Area | Why it could break | Pattern |
|---|---|---|
| Payment-authorised provisioning | WP-10 removed a pre-payment tenant and added the missing outbox consumer in one change. Getting half of it wrong takes the platform from "provisions the wrong way" to "does not provision at all". | `emitted-not-handled` |
| Slug reservation under concurrency | A nullable-unique column is only correct if the losing writer is handled. A racing pre-check is not. | `check-then-act` |
| Public enumeration | Five new unauthenticated endpoints. | `tenant-existence-oracle` |
| Legal consent evidence | Agreements are captured at checkout and must name the version agreed to. | `unversioned-consent` |
| Landing wizard | WP-11 rewrote a screen that had already been fixed once. | `structural-guard-lost-in-rewrite` |

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Payment confirmation is what authorises provisioning | contract | No tenant before `paidAt`; the outbox consumer creates it after | PASS | `payment-authorised-provisioning.e2e-spec.ts` — 12 tests |
| S2 | A repeated submission reuses the order rather than creating a second | idempotency | Same `orderNumber` returned | PASS | same suite |
| S3 | Two orders cannot reserve one workspace address | concurrency | The database refuses the second; the API resolves the holder and returns `WORKSPACE_SLUG_TAKEN` | PASS | `subscription-order.e2e-spec.ts` |
| S4 | The owner's address is proved before anybody is charged | negative | First submit issues a code; a checkout URL only after verification | PASS | `payment-authorised-provisioning.e2e-spec.ts` |
| S5 | Slug availability refuses to answer without a live order | permission | 404 for a dead session and a fabricated one alike, same body | PASS | WP-07 review of `public-billing.controller.ts` |
| S6 | Legal documents seed as drafts and stay unresolvable | contract | Ten routes seeded, `published: 0`, public index empty | PASS | `legal-seed.e2e-spec.ts` |
| S7 | Legal documents name the real operator and no other entity | contract | Every long digit run in the corpus is one the owner supplied | PASS *after F4* | `legal-seed.e2e-spec.ts` |
| S8 | The wizard never collects data it cannot submit | UI-state | Inputs inert and `Continue` disabled when checkout is impossible | PASS *after F3* | `plans.spec.ts`, `flow-c-landing-public-surface.spec.ts` |
| S9 | The post-payment page claims nothing the API has not evidenced | UI-state | No step DONE without a row; no workspace button without a domain | PASS | `provisioning-view.spec.ts` — 20 tests |
| S10 | The page cannot rate-limit itself out of its own purpose | boundary | Poll budget stays inside the guard's 120 GET / 10 min | PASS | `provisioning-view.spec.ts`, the arithmetic test |
| S11 | Every direct-API route handler forwards the visitor's address | contract | 24 handlers across three apps, all forwarding | PASS *after F2* | `forwarded-headers.invariant.spec.ts` ×3 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test` | api unit | 1388 | 0 | 0 | ~33 s |
| `npx jest --config ./test/jest-e2e.json` | api e2e, real PostgreSQL — **post-merge** | 326 | 0 | 0 | ~5 min |
| ⤷ same, pre-merge (stale base) | | 231 | 81 | 0 | — |
| `npm --workspace landing run test` | landing | 109 | 0 | 0 | ~2 s |
| `npm --workspace web run test` | web | 408 | 0 | 0 | ~4 s |
| `npm --workspace admin run test` | admin | 101 | 0 | 0 | ~3 s |
| `npm --workspace api run check-types` | api tsc | — | 0 | — | — |
| `npm --workspace landing run check-types` | landing tsc | — | 0 | — | — |
| `npm --workspace landing run lint` | landing eslint | — | 0 | — | — |
| `npm run validate:framework` | framework | 2740 | 0 | 0 | — |

**Re-run after merging `develop`: 26 suites, 326 tests, zero failures.** The 81
pre-merge failures were a stale-base artefact — see Known Limitations.

Database prepared as `.github/workflows/ci.yml` prepares it, plus two seeds CI
does not run: `prisma:migrate:deploy` → `seed:config` → `seed:demo` →
`seed:admin` → `seed:platform-workflows` → `seed:legal`.

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| `forwarded-headers.invariant.spec.ts` (landing) | 10 passed | 1 failed / 9 passed — forwarding stripped from `app/api/leads/route.ts` |
| `provisioning-view.spec.ts` — `canOpenWorkspace` | 20 passed | 3 failed — guard weakened to ignore the workspace field |
| `plans.spec.ts` — `checkoutBlockedReason` | 7 passed | 2 failed — made to return null for a null price |
| `legal-seed.e2e-spec.ts` — operator named | 7 passed | 1 failed — **not synthetic**: the new assertion found `billing-terms` genuinely missing the operator block on its first run |

Every mutation was reverted immediately and `git diff` confirmed no residue.

## Manual Validation

Read every new public route handler against `PublicRateLimitGuard`,
`resolveClientIp` and `isProxyTrusted` rather than only running the suites — the
six questions and their answers are recorded in TASK-0008's WP-07 section.
Confirmed `Referrer-Policy: strict-origin-when-cross-origin` in
`packages/config/security-headers.js`, which is what keeps the onboarding id out
of cross-origin requests once it is in the address bar.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-075 | A flat price is never described as per-employee | PASS |
| REG-076 | Every direct-API handler forwards the client address | PASS (added here) |
| REG-077 | The wizard refuses to collect data it cannot submit | PASS (added here) |
| BUG-0066's browser scenario | Subscribe never offers an unsubmittable form | **FAILED against the rewritten wizard** — F3 below |
| REG-027 | Workspace domain resolution cannot be pointed at another tenant | PASS — `workspace-domain-isolation.e2e-spec.ts` |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[BUG-0081]] (F2) | MEDIUM | Three apps claimed a forwarded-headers invariant test that did not exist | `assertion-without-a-check` | REG-076 |
| [[BUG-0082]] (F3) | HIGH | The wizard collects five steps of data it cannot submit | `editable-form-that-cannot-submit` | REG-077 |
| F4 — fixed in place | — | `billing-terms` named no operator, and `seed:legal` was in no aggregate seed script | `contract-without-a-counterparty` | `legal-seed.e2e-spec.ts` |
| [[ITEM-0066]] | LOW | `verify-database.mjs` cannot spawn npm on Windows | — | deferred |
| [[ITEM-0067]] | — | Three e2e suites need two seeded tenants | — | **withdrawn — duplicate of [[ITEM-0047]], already fixed on `develop`** |

F4 is recorded here rather than as its own bug record because it was found and
closed inside one change, by an assertion written in that same change, and
nothing shipped carrying it. Both halves — the seed wiring and the missing
operator block — are in the commit.

## Known Limitations

**81 e2e failures — corrected after merging `develop`.**

As run, `attendance-engine`, `attendance-integrations-http` and
`gateway-runtime` threw in `beforeAll` on *"These tests need two tenants with at
least one business unit."* `seed:demo` creates one. The reading was right and
the diagnosis was right, and it was **also already fixed**: `develop` was 36
commits ahead of the branch this campaign ran against, carrying
[[ITEM-0047]] / REG-070 — per-suite fixtures via `createTenantPair()`, the
three suites converted, `legal-seed` made to run its own seed, and
`platform-workflows` given its invitation data. The same work promoted
`database-e2e` into the required gate, which it could only do because these
failures were gone.

So the pre-merge number was a **stale-base artefact**, not a finding.
[[ITEM-0067]] is withdrawn as a duplicate. Re-run against a fresh database after
the merge: **26 suites, 326 tests, zero failures, exit 0** — the whole
database-backed set green, including the three suites that had appeared broken
and the two seeds that had appeared missing.

The process lesson is worth more than the number: **a QA campaign that
establishes a baseline must merge the integration branch first.** Otherwise
every failure somebody else has already fixed gets rediscovered, investigated
and re-filed — and the campaign's own findings become harder to see among
them.

**No browser run here.** Playwright needs three Next servers, an API, a seeded
database and browser binaries, and the Nest CLI does not start reliably in this
environment. The two browser assertions this campaign changed were corrected by
reading them against the rewritten components — which is how BUG-0082 was found
— but they are proven by the `browser-e2e` gate on push, not by this run.

**No second Stripe purchase.** The payment path was proven against the real test
sandbox earlier in this parent. Re-running it would exercise the provider, not
this change.

**No load or true-concurrency testing.** Slug contention is proven by the unique
index and the losing-writer path, not by racing clients.

## Final QA Verdict

**PASS WITH RISKS.**

Re-issued after merging `develop`, against the whole database-backed suite
green — 26 suites, 326 tests, zero failures.

The acquisition path holds against a real database: payment authorises
provisioning and nothing else does, an order cannot be double-created, a
workspace address cannot be taken twice, nobody is charged before their address
is proved, and the page they wait on reports only what the API evidenced. Two
material defects were found; both are fixed with regression coverage behind
them, one of them mutation-proven by a real failure rather than a staged one.

The risks, named rather than buried:

1. **Browser coverage is proven by CI, not by this run.** BUG-0082 is the
   argument for taking that seriously: a browser regression survived a rewrite
   that every unit test still passed. The gate runs it on push; if it goes red,
   that is this verdict changing, not a new event.
2. **The e2e baseline was first taken on a stale base.** Corrected and re-run:
   326 / 326. The correction cost a wasted investigation and one withdrawn
   record, which is the cheapest form this mistake takes.
3. **No legal document is published.** The wizard requires only agreements
   carrying a published version, so with none published it requires none, and a
   purchase records no consent. That is an owner decision already open, not a
   defect — but it is the one thing between this path and being genuinely
   sellable.

## Follow-up

- Owner: publish the legal drafts, and supply real PKR and QAR prices. Until
  then a Qatari visitor meets BUG-0082's now-honest "no published price" state.
- [[ITEM-0067]] — withdrawn as a duplicate of [[ITEM-0047]].
- [[ITEM-0066]] — sweep `scripts/` for the same Windows spawn shape.
- WP-09 — Reviewer, exact-SHA CI, develop integration.
