# QA Run — landing-uiux-remediation-verification

## Metadata

| | |
|---|---|
| Date / time | 2026-08-18 |
| Branch | `agent/landing-uiux-remediation` |
| Base SHA | `c332992` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-landing-fix` |
| Environment | PostgreSQL on 5432, API on 4000, landing **production build** (`next build && next start`) on 3010, commercial data seeded via `npm run seed:config` |
| QA agent | QA, with UI/UX leading and reviewing |
| Scope | Verification of BUG-0061..BUG-0066, ITEM-0051 and ITEM-0046. All 14 public landing routes at 1440x900, 768x1024 and 390x844. |

## Requirement

Verify that every documented landing finding from
`docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md` is fixed, and close
the two gaps that run explicitly left open: no form was ever submitted, and no
populated pricing was ever exercised.

## Risk Areas

- **Regression in the shared shell.** BUG-0062 and BUG-0064 both change
  `site-shell.tsx`, which every route renders. A mistake there breaks 14 routes
  at once, so overflow, focus visibility and landmark structure were re-measured
  on every route rather than sampled.
- **Over-correction on the forms.** BUG-0063 removes a submit gate. The risk is
  trading a blocked form for one that submits invalid data, so both the invalid
  and valid paths were exercised against the real API.
- **The contract fix hiding a second divergence.** BUG-0065 was one missing key
  on one branch; the fix adds a return type, so a future divergence fails the
  build instead of reaching a console.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| V1 | `/`, `/subscribe`, `/plans` with the API stopped | negative | 200 with degraded copy | **PASS** | all 200, "could not reach our pricing service" |
| V2 | Malformed / empty / error plans payloads distinguished | contract | five named states | **PASS** | `OK · EMPTY · API_UNAVAILABLE · API_ERROR · MALFORMED` |
| V3 | `commercial-config` with no market resolved | contract | `featureCatalog` present | **PASS** | 5 keys, `featureCatalog` array len 12 |
| V4 | `commercial-config` with market seeded | contract | populated | **PASS** | market PK, USD, 4 plans, catalog 12 |
| V5 | Mobile menu closes on navigation | UI-state | closed | **PASS** | mobile + tablet |
| V6 | Mobile menu closes on Escape, focus restored | UI-state | closed, focus on trigger | **PASS** | mobile + tablet |
| V7 | Mobile menu closes on outside click | UI-state | closed | **PASS** | measured with the menu genuinely open |
| V8 | Skip link first tab stop, moves focus | happy | focus in `main` | **PASS** | `{"id":"main-content","tag":"MAIN"}` |
| V9 | Contrast of `--muted-soft` | UI-state | at least 4.5:1 | **PASS** | 5.34 / 4.87 / 4.58 on the three backgrounds |
| V10 | `/request-demo` submit operable, errors associated | negative | 7 invalid fields, focus moved | **PASS** | `aria-invalid` + `aria-describedby` on each |
| V11 | `/request-demo` valid submission | happy | 201 + announced | **PASS** | lead persisted |
| V12 | `/contact` submission | happy | 201 + announced | **PASS** | id returned, lead persisted |
| V13 | `/partners` inquiry submission | happy | 201 + reference | **PASS** | `PIN-20260817-77113D5C` |
| V14 | Duplicate identical submission | idempotency | one row | **PASS** | two 201s, one row |
| V15 | `/subscribe` with checkout unavailable | UI-state | fields disabled + reason | **PASS** | fieldset disabled, 6/6 inert |
| V16 | Checkout initiation boundary | contract | refused with a reason | **PASS** | 400 `VALIDATION_FAILED` |
| V17 | 404 semantics | UI-state | `main`, `h1`, title, recovery | **PASS** | status 404, "Page not found" |
| V18 | Route titles distinct | contract | own titles | **PASS** | 6 routes titled |
| V19 | Hydration on partner activation | UI-state | no warning | **PASS** | zero across 42 production combinations |
| V20 | Accessibility sweep | UI-state | no serious/critical | **PASS** | zero serious, zero moderate |
| V21 | Responsive sweep | UI-state | no overflow | **PASS** | 0 of 42 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx playwright test flow-c-landing-public-surface` | landing regressions (new) | 18 | 0 | 0 | 31.4s |
| `npm --workspace landing run test` | landing jest | 49 | 0 | 0 | ~8s |
| `npm --workspace landing run check-types` | tsc | clean | 0 | — | — |
| `npm --workspace api run check-types` | tsc | clean | 0 | — | — |
| `npm --workspace landing run build` | production build | clean | 0 | — | — |
| exploratory harness | 14 routes x 3 viewports + axe | 42 | 0 | 0 | — |

No retries were needed on any run.

### Regression-test proof

`flow-c-landing-public-surface.spec.ts` is written against the defects rather
than the implementation, so each test fails on the pre-fix code:

| Test | With fix | Without fix |
|---|---|---|
| skip link is first tab stop | PASS | FAIL — no such element existed |
| menu closes after navigating | PASS | FAIL — panel stayed open, screenshot in the prior run |
| submit is operable, errors associated | PASS | FAIL — button disabled, no `aria-invalid` anywhere |
| plans renders without config console errors | PASS | FAIL — error on 6 routes |
| 404 keeps the shell | PASS | FAIL — no `main`, generic title |
| subscribe never offers a form it cannot submit | PASS | FAIL — 6 enabled fields, no notice |

## Manual Validation

All browser work was scripted and reproducible: the same 42-combination sweep as
the original pass, plus 15 interaction probes and 11 form-submission probes.
Screenshots retained for the mobile menu, the skip link, the invalid and
successful request-demo states, and the subscribe unavailable state.

## Regression Checks

No prior `docs/qa/regressions/index.md` entry covered `apps/landing`. This run
creates the first durable landing coverage, which was itself a finding of the
previous run.

## Bugs Found

Two defects were found **during** remediation and fixed in the same package
rather than filed as new open records:

| Finding | Origin | Resolution |
|---|---|---|
| Invalid `<dl>` structure on `/plans` — a `<p>` inside a `<div>` grouping | Latent; only renders when plans exist, which the previous run's missing fixture hid | Qualifier moved inside the `<dd>`. axe `definition-list` serious violation cleared. |
| `try/catch` swallowed Next's `DynamicServerError` | Introduced by the BUG-0061 fix; caught by reading build output | `unstable_rethrow(error)` added in both landing loaders before any network handling. |

The second is worth stating plainly: the first version of the BUG-0061 fix
logged a network outage during every production build, because Next signals
dynamic rendering by throwing. A catch-all around a fetch in a server component
absorbs that signal. It was caught by reading build output rather than by a
test, and there is no test for it — recorded here as a gap.

## Known Limitations

- **Checkout completion was not exercised end to end.** No price in this
  environment is Stripe-verified: readiness requires `stripeProductId`,
  `stripePriceId`, matching environment, `SYNCED` status and `stripeVerifiedAt`.
  Satisfying that means creating objects in a real Stripe test account, which is
  an external side effect this task did not take. **Exact external boundary:**
  `POST /api/public/subscribe` was exercised and correctly refused with
  `400 VALIDATION_FAILED — "This price is not checkout-ready: Stripe
  verification has not succeeded."` Everything up to the Stripe API call is
  verified; the Stripe call itself is not. The `/subscribe` scenario branches on
  checkout availability so it stays meaningful once a verified price exists.
- **Partner activation and document signing were tested with invalid tokens
  only.** The error shells are confirmed; the successful journeys are not.
- **Contrast was verified with axe-core**, which does not evaluate placeholder
  text. Placeholders use the same corrected token, so they improved, but they
  are not independently measured.
- Leads created by this run carry `.test` email domains and are local only.

## Final QA Verdict

**PASS**

All six bug records are verified against a production build, both backlog items
meet their acceptance criteria, and the two gaps the previous run left open —
form submission and populated pricing — are closed with real 201 responses and
persisted records. Across 14 routes at three viewports: zero serious or critical
accessibility violations, zero hydration warnings, zero horizontal overflow,
zero application console errors, and a skip link, `h1` and `main` landmark on
all 42 combinations.

The one thing this run cannot claim is a completed Stripe checkout, and that
boundary is stated above rather than rounded up.

## Follow-up

- ITEM-0053 — privacy and terms copy is a product decision, not engineering.
- A Stripe-verified test price would let the `/subscribe` scenario exercise its
  other branch; the test is already written to handle it.
- `flow-c` is fast (31s) and needs no seeded tenant, so it is a candidate for
  running on every push rather than only inside the full browser job.
