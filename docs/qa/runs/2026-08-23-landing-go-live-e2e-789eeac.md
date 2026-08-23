# QA Run — landing-go-live-e2e

## Metadata

| | |
|---|---|
| Date / time | 2026-08-23T09:37:00Z |
| Branch | `agent/landing-e2e-go-live` |
| Commit SHA | `789eeaca418919147a9ee0d968705a6ca2462bd5` |
| Worktree | `D:\My Work\hrm-dijipeople\wt-landing-e2e` |
| Environment | Isolated stack: landing production build on `:3010`, API on `:4001`, throwaway database `dijipeople_e2e_live`, Stripe **test** mode with `stripe listen` forwarding webhooks. Production read-only at `https://www.dijipeople.com` / `https://api.dijipeople.com`. |
| QA agent | Architect-directed QA |
| Scope | The whole public site: every route, every public form, the self-service checkout through to a provisioned tenant, accessibility, layout stability and speed — on the pending release **and** on production. Out of scope: the authenticated tenant product, platform admin, the agent desktop, and the `/sign` and partner-token journeys (no live tokens). |

## Requirement

Establish whether `apps/landing` is fit to go live: that every page renders,
every control does what it claims, every form accepts what it should and refuses
what it should not, and — the question the whole site exists to answer — that a
stranger can buy a subscription and receive a working workspace. Both the code
about to ship and the code currently serving customers were tested, because they
turned out not to be the same thing.

## Risk Areas

- **Commercial correctness.** Money is computed in three places
  (`billing-seat-pricing.ts`, `SubscriptionOrderService`,
  `buildRecurringCheckoutLineItem`). `divergent-duplicate-guard` is the obvious
  pattern, and it is exactly what was found.
- **Asynchronous provisioning.** Payment, outbox dispatch, tenant creation and
  readiness are four hops with no user-visible retry. `declared-but-unwired-step`
  applies to each seam — and did, twice.
- **Configuration as truth.** `render.yaml` is not what production runs
  (BUG-0767). Anything the file declares may be absent live, which is
  `silent-config-fallback` at deployment scale.
- **Streaming and status codes.** A route-level `loading.tsx` commits the HTTP
  status before a dynamic segment runs, so `notFound()` cannot take effect —
  `silent-degradation` in a place source reading does not reveal.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every public route renders | happy | 200, one `h1`, title, meta description, no console errors | PASS | `landing-public-surface.spec.ts` — 9 routes |
| S2 | Ten legal routes resolve whether or not published | happy | 200 with an `h1` | PASS | same spec |
| S3 | Unknown legal slug | negative | 404 with the not-found page | FAIL → FIXED | BUG-0907; was 200 stuck on "Loading" |
| S4 | Unmatched path | negative | 404 with site chrome | PASS | same spec |
| S5 | robots.txt / sitemap.xml | contract | crawlable; sitemap lists marketing routes and only published legal | PASS | same spec |
| S6 | Baseline security headers | security | nosniff, DENY, referrer, permissions, CSP report-only | PASS | same spec |
| S7 | Every header and footer link resolves | happy | all < 400 | PASS | same spec |
| S8 | Contact / partner / demo forms refuse an empty submission | negative | no request reaches the API | PASS | `landing-public-forms.spec.ts` |
| S9 | The same three refuse a malformed email | negative | no request reaches the API | PASS | same spec |
| S10 | The same three submit and confirm | happy | 201 and a visible confirmation | PASS | 6 `Lead` + 4 `PartnerInquiry` rows created |
| S11 | Demo form honeypot is hidden and unfocusable | security | present, hidden, `tabindex=-1` | PASS | same spec |
| S12 | Contact form honeypot | security | present | FAIL (recorded) | ITEM-0089 — none exists |
| S13 | `/subscribe` offers a purchasable plan | happy | the wizard renders | FAIL | BUG-0898 — DP-CHK-01 on every plan, prod and local |
| S14 | Full checkout → payment → tenant | happy | order PAID, tenant ACTIVE, status READY, workspace URL | FAIL ×3 → FIXED | BUG-0900, BUG-0901, BUG-0902 |
| S15 | Order total equals the Stripe charge | contract | `totalAmount` = `amount_total` | FAIL → FIXED | BUG-0901 — 0.00 vs 12,000 PKR |
| S16 | axe serious/critical across 8 pages | accessibility | zero | PASS | 0 violations; every control has an accessible name |
| S17 | Core Web Vitals, production build | performance | LCP < 2500 ms, CLS ≤ 0.1 | PASS | all 8 routes "good" |
| S18 | CLS under Fast 3G | performance | ≤ 0.1 | PASS (release) / FAIL (production) | release 0.000; production 0.277 on `/` and `/plans` |
| S19 | A merge to `main` deploys | deployment | Render reaches `live` | FAIL | BUG-0899 — `pre_deploy_failed`; prod 14 commits behind |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest` (in `services/api`) | API unit | 1681 | 0 | 0 | 54 s |
| `npm --workspace landing run test` | landing unit | 141 | 0 | 0 | 5 s |
| `npx playwright test` | browser e2e | 76 | 0 | 19 | 4.2 min |
| `npx playwright test landing-checkout-provisioning` | paid journey | 1 | 0 | 0 | 42 s |
| `npm --workspace landing run check-types` | landing tsc | clean | — | — | — |
| `npm --workspace e2e run check-types` | e2e tsc | clean | — | — | — |
| `npx tsc -p services/api/tsconfig.build.json` | api tsc | clean | — | — | — |
| `npm --workspace landing run lint` | landing eslint | clean | — | — | — |
| `npm run validate:framework` | framework | 3598 | 0 | — | — |

The 19 skips are the admin and provisioning-operations flows, which need a
platform session and a database matching the disposable-name allowlist. They
skip loudly, naming what was missing.

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| `billing-seat-pricing.spec.ts` → `billable seats by billing model` | PASS | FAIL — reverting `resolveBillableSeats` to the per-seat expression fails 2 of its 3 |
| `landing-public-surface.spec.ts` → unknown legal slug is a real 404 | PASS | FAIL — run against production, which still carries the defect |
| `landing-checkout-provisioning.spec.ts` | PASS | FAIL — observed directly before each fix: the order at 0.00, then `PROVISIONING_REQUESTED` FAILED at attempt 8, then `readinessStatus NOT_READY` |

## Manual Validation

- Drove the complete purchase in a real browser against Stripe test mode four
  times, paying with `4242 4242 4242 4242` each time, and read the resulting
  `SubscriptionOrder`, `Tenant`, `Subscription` and `OutboxEvent` rows.
- Compared the order's recorded total against the Stripe Checkout session's
  `amount_total` through the Stripe API.
- Established BUG-0907's cause by experiment: rebuilt the app with
  `app/loading.tsx` removed, confirmed the same URL becomes a 404, restored it.
- Reproduced the production deploy failure locally by running `seed:legal` then
  `legal:publish --confirm` against a fresh database.
- Read Render's deploy list and env-var **key** list, and Vercel's deployment
  list. Key material was deliberately not read; `STRIPE_MODE=test` is sufficient
  evidence on its own.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-235 | A flat price bills one subscription | PASS (new) |
| REG-236 | Tenant RBAC bootstrap writes a set as a set | PASS (new) |
| REG-237 | A provisioned workspace is marked ready and its URL returned | PASS (new) |
| REG-238 | An unknown dynamic slug returns a real 404 | PASS (new) |
| REG-229..234 (landing, commerce, admin) | re-run via the existing `flow-c` suite | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-0898 | CRITICAL | No plan price is synced to Stripe — every plan shows DP-CHK-01 and no form. Nobody can buy. | `silent-config-fallback` | No — operational |
| BUG-0899 | CRITICAL | The release chain can never succeed: `seed-legal` writes drafts `legal:publish` must refuse, and its exit 2 aborts the deploy. | `divergent-duplicate-guard` | No — owner decision |
| BUG-0900 | CRITICAL | Provisioning exceeds the 5 s transaction timeout — a paid order is left with no workspace. | `unbounded-render` | REG-236 |
| BUG-0901 | HIGH | A paid order records `totalAmount 0.00` for every FLAT plan. | `divergent-duplicate-guard` | REG-235 |
| BUG-0902 | HIGH | `markTenantReady` has no caller — the workspace URL is never shown. | `declared-but-unwired-step` | REG-237 |
| BUG-0903 | HIGH | Production runs Stripe in test mode. | `silent-config-fallback` | No — operational |
| BUG-0904 | CRITICAL | Production lacks `OUTBOX_WORKER_ENABLED`, which `render.yaml` declares. | `silent-config-fallback` | No — operational |
| BUG-0905 | MEDIUM | Production defines `DIRECT_URL`; the code reads `DIRECT_DATABASE_URL`. | `silent-config-fallback` | No — operational |
| BUG-0906 | HIGH | No legal document is published, so a purchase records no consent. | `declared-but-unwired-step` | No — blocked by BUG-0899 |
| BUG-0907 | MEDIUM | Unknown legal slug answers 200 and hangs on the loading shell. | `silent-degradation` | REG-238 |

Backlog: ITEM-0085 (no bulk Stripe sync), ITEM-0086 (no deployment assertion for
a purchasable price or a running outbox worker), ITEM-0087 (`STRIPE_API_VERSION`
commented out locally, documented with two values), ITEM-0088 (`start:dev` frees
port 4000 regardless of `PORT`), ITEM-0089 (contact form has no honeypot).

## Known Limitations

- **Production writes were not performed.** No lead, inquiry, order, charge or
  tenant was created on production. Every production finding comes from GET
  requests, rendered HTML, and the Render/Vercel control planes. The positive
  form cases and the whole checkout journey ran only against the isolated stack.
- **Production runs different code.** It serves `ef57b2a`, fourteen commits
  behind `main`, so its behaviour is not the release's. Where the two differ —
  BUG-0907's 404, the CLS spikes — both were measured and reported separately.
- **The checkout was proven in Stripe test mode only.** A live-mode purchase has
  never been executed by anyone, and BUG-0903 means it cannot be until the
  environment is switched.
- **`/sign/[token]` and the partner activation and onboarding token journeys
  were not exercised.** They need live tokens, which means creating a contract
  and a partner. Only their unauthenticated failure modes were checked; those
  neither crash nor leak — the token appears solely in the RSC flight payload,
  which the recipient already holds in the URL.
- **No load or concurrency testing.** BUG-0900 is timing-dependent and surfaced
  by chance on a loaded machine; concurrent checkouts were not attempted, so
  other timing failures may remain in the same chain.
- Local Postgres crashed twice under parallel load. Both times it presented as
  `DATABASE_CONNECTION_FAILED` on the API and was environmental rather than a
  product defect — the known local failure mode.

## Final QA Verdict

**FAIL** — for production. Not for the code.

The pending release is in good shape: 76 browser tests, 1681 API tests and 141
landing tests pass; accessibility is clean at serious/critical on every page;
Core Web Vitals are good on every route; and the complete purchase journey now
works end to end and is covered by a test that watches it.

Production is a different matter, and almost none of it is a code problem:

1. **Nobody can buy anything** (BUG-0898). Every plan on `/subscribe` shows
   DP-CHK-01 because no plan price has ever been synced to Stripe. That is the
   site's primary call to action, and it is a dead end today.
2. **Nothing can be released** (BUG-0899). The release chain cannot reach a
   success state while the seeded legal documents declare themselves drafts, so
   production is frozen fourteen commits back and none of the fixes in this run
   can ship.
3. **Even with those solved, a payment would not produce a workspace**
   (BUG-0904), and **no real money would move** (BUG-0903).

Three of the four blockers are configuration or a product decision, which is the
encouraging part — the machinery works, as this run demonstrated by making it
work. But go-live is not a decision the current production state supports.

## Follow-up

Sequenced, because the order matters:

1. Replace the placeholder legal copy with reviewed text (owner + legal), then
   decide whether `legal:publish` should be able to abort a deploy — unblocks
   BUG-0899 and BUG-0906.
2. Switch `STRIPE_MODE` to live with live keys and register the production
   webhook — BUG-0903. This must come **before** step 3: `stripeEnvironment` is
   baked into each price at sync time, so syncing first and switching after
   invalidates all 36 and re-blocks checkout.
3. Sync the SELF_SERVICE prices for every launched market, and confirm with
   `npm run report:commercial` — BUG-0898.
4. Set `OUTBOX_WORKER_ENABLED=true`, and reconcile the live Render service with
   `render.yaml` rather than fixing one variable — BUG-0904, BUG-0905, ITEM-0084.
5. Deploy, then re-run this suite against production with
   `E2E_LANDING_URL=https://www.dijipeople.com`, and complete one real low-value
   purchase and refund it.
6. Close ITEM-0086, so the next unsellable catalogue or stopped outbox worker
   fails a deployment instead of being discovered by a customer.
