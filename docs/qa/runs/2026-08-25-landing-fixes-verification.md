# QA Run — landing-fixes-verification

## Metadata

| | |
|---|---|
| Date / time | 2026-08-25T20:05:00Z |
| Branch | `agent/landing-qa-fixes` |
| Commit SHA | fixes verified at the branch head before integration |
| Worktree | `D:\My Work\hrm-dijipeople\wt-landing-fixes` |
| Environment | Local landing `:3000` + API `:4000` from this branch, against the local `dijipeople` Postgres with the new migration applied. `OUTBOX_WORKER_ENABLED=true` and a live `stripe listen` webhook forwarder — both absent from the previous run, and both are why the provisioning tail could be finished this time. |
| QA agent | qa + ui-ux (Stage 2) |
| Scope | Verification of the six fixes and one backlog item from `2026-08-25-landing-e2e-local-and-prod-42435d5.md`, plus the two scenarios that run left `BLOCKED`, plus the UI/UX post-implementation review that run did not perform. |

## Requirement

Close out the previous landing QA run: fix every finding, verify each fix on the
running product rather than in the diff, finish the two blocked scenarios, and
add the UI/UX Stage 2 review that was missing.

## Risk Areas

The fixes touch the purchase path, which is the highest-consequence surface on
the site. Specific risks carried into this run:

- **Changing `Country.sortOrder` semantics** could break ordering for the 250
  ISO countries as well as the 8 pinned ones. Mitigated by a migration plus an
  invariant test, and verified against the real database below.
- **Rejecting codes in `referral.ts`** could reject *genuine* partner codes if
  the pattern were too broad — a silent revenue defect of exactly the kind being
  fixed. Explicitly tested with near-miss codes.
- **`contactInfo.phone: null`** is consumed in two places; a missed consumer
  would throw on `.replace` of null rather than degrade.
- `seeded-but-unsellable` and `two-writers-one-field` were both watched for.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| V1 | Annual per-seat estimate names a yearly period | UI-state | "per year" | PASS | Live page: `$3 · 25 purchased seats · estimated $75.00 per year.` |
| V2 | Monthly estimate unchanged | regression | "per month" | PASS | Unit tests, `formatSeatTotalEstimate` |
| V3 | V1/V2 fail without the fix | regression | 2 failures | PASS | Reintroduced the literal: `Tests: 2 failed, 11 passed` |
| V4 | Diagnostic code is not stored as a referral | contract | not stored | PASS | `referral.spec.ts`, 9 tests |
| V5 | A partner code wins after a diagnostic was seen | contract | partner stored | PASS | `referral.spec.ts` |
| V6 | An already-poisoned cookie is healed | contract | treated absent | PASS | `readReferralCode` guard + test |
| V7 | V4–V6 fail without the guard | regression | ≥1 failure | PASS | Guard disabled: `Tests: 5 failed, 4 passed` |
| V8 | Near-miss partner codes still accepted | negative | accepted | PASS | `DPCHK01`, `DP-CHK-01-X`, `DP-1`, `DPARTNER-2` all stored |
| V9 | Subscribe link no longer emits the referral param | contract | `?checkout=` | PASS | `subscribe-lock.spec.ts`, comment-stripped scan |
| V10 | Country lookup narrower than the bundle is rejected | contract | fallback used | PASS | `isUsableLookupList`, 8 tests |
| V11 | Full ISO set still accepted | regression | lookup used | PASS | `isUsableLookupList(remote(250))` |
| V12 | Priority markets lead the country picker | UI-state | 8 pinned first | PASS | Live DB: US, SA, PK, QA, AE, IN, GB, CA, then Afghanistan… |
| V13 | No ordering collisions remain | DATABASE | 0 | PASS | 250 rows, `out-of-order within a band: 0` |
| V14 | Migration is applied and idempotent-safe | migration | applies clean | PASS | `prisma migrate deploy` applied `20260825210000_country_priority_sort_band` |
| V15 | Footer publishes no fictional number | content | row absent | PASS | Live footer: Contact us + hello@dijipeople.com only |
| V16 | Form placeholder still illustrative | UI-state | present | PASS | `contactInfo.phonePlaceholder` |
| V17 | Timesheets copy has no raw enum | content | sentence case | PASS | `Monthly timesheets, submission, and approval workflows.` |
| V18 | Workspace address shows a real suffix | UI-state | domain shown | PASS | `fixes-verification-co.localhost is available.` |
| V19 | Env parity test covers every app | contract | 3 apps | PASS | 22 tests across web, admin, landing |
| V20 | The parity test catches a real disagreement | regression | caught | PASS | Found `apps/admin` `WEB_ROOT_DOMAIN=3000` vs `3001`; fixed |
| **V21** | **Payment completes and provisioning finishes** | happy | workspace created | **PASS** | Order `ORD-2026-60EE553C` → `ACTIVATED`; tenant `Fixes Verification Co` → `ACTIVE`; all 11 outbox events `PROCESSED`; all four progress steps green |
| V22 | Accessibility across the public pages | SECURITY/a11y | 0 serious | PASS | axe: **0 serious/critical across 8 pages**; 0 controls without an accessible name |
| V23 | Responsive at phone, tablet, laptop | UI-state | no h-scroll | PASS | 32/32 route×viewport combinations report no horizontal scroll at 375/390/768/1280 |
| V24 | Every control matches its data type | UI-state | correct types | PASS | email→`type=email`, phone→`tel`, website→`url`, seats→`number`, country/industry→lookup |

## Automated Suites

| Command | Suite | Pass | Fail | Skip |
|---|---|---|---|---|
| `jest --config jest.config.js` (landing) | landing unit | 172 | 0 | 0 |
| `node --test packages/config/env-examples.test.js` | env parity | 22 | 0 | 0 |
| `jest src/modules/lookups` (api) | lookups | 7 | 0 | 0 |
| `jest src/modules/lookups src/modules/tenant-settings` (api) | changed modules | 58 | 0 | 0 |
| `npm --workspace landing run check-types` | tsc | clean | — | — |
| `npm --workspace api run check-types` | tsc | clean | — | — |
| `npm --workspace landing run lint` | eslint | clean | — | — |
| `npm --workspace api run lint` | eslint | 0 errors | — | 801 pre-existing warnings |
| `e2e/tools/accessibility-sweep.mjs` | axe | 0 violations | — | — |
| `e2e/tools/responsive-sweep.mjs` | responsive | no h-scroll | — | — |

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| `formatSeatTotalEstimate` period assertions | PASS (13) | **FAIL (2)** ← required |
| `referral` diagnostic-code guard | PASS (9) | **FAIL (5)** ← required |

Both were run with the fix deliberately reverted, then restored. Neither passes
both ways.

## Manual Validation

The full purchase was driven by hand in a browser, from `/subscribe` through
Stripe Checkout with test card `4242…` to the success page, and then verified in
the database rather than from the page alone. This is the run's most important
result: **V21 was `BLOCKED` in the previous run and now passes end to end**, with
the workspace actually created rather than the payment merely accepted.

The two country fixes were verified against the real database, not only through
mocks — the previous run's finding was a data defect, so a passing unit test
would not have been sufficient evidence.

## UI/UX — Stage 2 post-implementation review

`.agent/agents/ui-ux.md` requires this stage against the **running UI**, and the
previous run did not perform it. That was a real gap, not an oversight worth
glossing: the role exists precisely because "the diff is correct" and "the
journey works" are different claims.

**`UI_UX_POST_REVIEW_STATUS = PASS`**

| Check | Result |
|---|---|
| Intended journey completes end to end | **PASS** — five wizard steps, email verification, Stripe, provisioning, "Open DijiPeople" |
| Visual hierarchy | PASS — price is the largest element on the plan card; the primary CTA is the only filled button per section |
| Discoverability | PASS — when a plan cannot be bought the panel names the reason, quotes a code, and offers two routes out |
| Responsive (desktop/tablet/mobile) | PASS — no horizontal scroll at any of four widths; wizard stacks cleanly at 390px |
| Accessibility | PASS — 0 serious/critical axe violations across 8 pages; every control has an accessible name; mobile menu carries `aria-expanded`/`aria-controls` and closes on Escape |
| State feedback | PASS — required-field errors are per-field *and* summarised; the provisioning page shows four discrete states rather than a spinner |
| Consistency with neighbours | PASS — the fixed estimate line now agrees with `/plans`, which it previously contradicted |
| Destructive-action clarity | NOT_APPLICABLE — the public site has no destructive action |
| Control audit (every field) | PASS — see V24; no free text where a list exists |

Two things flagged by tooling that are **not** defects, checked rather than
assumed:

- `a "Skip to main content" 32×16` — measured while visually hidden; documented
  in `responsive-sweep.mjs` as investigated on 2026-08-23.
- A dark circular badge over the mobile viewport — the Next.js dev-tools
  indicator, absent from a production build.

One observation, deliberately not filed as a bug: with `contactInfo.phone` now
`null`, the footer's Contact column carries two entries against Product's four.
It reads as intentional whitespace rather than a gap, and the alternative —
publishing a number nobody answers — is the defect that was just fixed. It
resolves itself when a real number is supplied.

## Regression Checks

The previous run's six findings are the regression surface for this one, and all
six were re-checked on the running product (V1, V4, V10/V12, V15, V17, V18).
None reproduced.

## Bugs Found

None from the verification itself — no fix introduced a defect.

**Three found afterwards, while unblocking production checkout.** Syncing the
QAR prices to Stripe was authorised in order to complete the production test
purchase. It worked, and within minutes it exposed defects that had been latent
for as long as the endpoint existed. Recorded here because this run is where the
evidence lives.

| ID | Severity | Description | Found by |
|---|---|---|---|
| [[BUG-1378]] | HIGH · SECURITY | `/public/plans` published `SALES_ASSISTED` internal flat pricing to anonymous callers and marked it `checkoutReady`; **neither public write path checked the channel at all**, so a caller holding an id could buy an internal rate | Tracing BUG-1369 to its cause, then reading the write paths |
| [[BUG-1369]] | HIGH | Checkout resolved a price on two of its three dimensions, so it quoted QAR 249 flat against an advertised QAR 8 per employee | Comparing `/plans` and `/subscribe` immediately after the sync |
| [[BUG-1364]] | MEDIUM | A coordinate-leak assertion substring-matched JSON and failed when the clock spelled a coordinate | CI, on a branch that changed nothing in attendance |

All three are fixed, verified and closed. `REG-258`, `REG-259` and `REG-260`
carry the coverage; `QA-BILLING-021`, `QA-LANDING-023` and `QA-ATTENDANCE-001`
are the reusable scenarios.

The sequence is worth keeping: **making a thing reachable is how its defects
become findable.** BUG-1369 and BUG-1378 were both present before this task and
invisible while no market had two sellable models. Nothing about the sync
created them; it removed the condition that was hiding them.

## Known Limitations

1. **The production test purchase is still not done** — and the reason changed
   twice in one evening, which is worth recording in order.

   It began as "no QAR price is sellable" ([[BUG-0898]]), and making one meant
   syncing prices while production Stripe is in `TEST` mode ([[BUG-0903]]) —
   which shows real prospects a payment form that declines real cards. That
   trade-off is commercial, so it was put to the user, who chose to sync.

   The sync succeeded: QAR went from 0/12 to 12/12 checkout-ready and the
   wizard rendered for the first time. It then immediately quoted **QAR 249
   flat against an advertised QAR 8 per employee** ([[BUG-1369]], caused by
   [[BUG-1378]]).

   **The purchase was deliberately not completed at that price.** Buying at a
   figure the site does not advertise would have created a real subscription on
   a rate the customer was never offered, and demonstrating a pricing defect by
   paying it is not evidence anyone needs. Both defects are now fixed and
   released; the purchase is worth attempting again once that deployment is
   confirmed.

   Note also what is still true: with `STRIPE_MODE=test`, only test cards work.
2. **The API test suite was run for the changed modules, not in full.** The
   changes are confined to `lookups`, `tenant-settings` and the landing app; a
   full API run is CI's job and gates the merge.
3. **`apps/admin` was not exercised in a browser**, though its `.env.example`
   was corrected. The correction is covered by the widened parity test.
4. The local verification email records as `REJECTED` — no mail provider is
   configured locally. The code is read from `PlatformOutboundEmail`, which is a
   mailbox read, not a bypass: it still goes through `POST /verify-email`.

## Final QA Verdict

**PASS**

All six findings and the backlog item are fixed, each verified on the running
product rather than in the diff, and the two highest-severity fixes carry
regression tests proven to fail without them. The scenario that mattered most —
a payment that actually produces a workspace — now completes end to end, where
the previous run could only show the payment being taken.

The one previously-blocked scenario that remains blocked is blocked on a
commercial decision, not on engineering, and says so plainly.

## Follow-up

- Decide whether to activate production checkout in test mode (Known
  Limitations 1).
- `BUG-1306` needs a real phone number before the footer row can return.
- Re-run the production surface after deployment to confirm the fixes shipped.
