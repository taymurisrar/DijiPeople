---
PLAN_ID: PLAN-013
aliases: [PLAN-013]
TITLE: Public landing surface
AREA: landing
STATUS: CURRENT
MODULES: [apps/landing]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GOOD
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-0061, BUG-0062, BUG-0063, BUG-0064, BUG-0065, BUG-0066]
RELATED_REGRESSIONS: [REG-057, REG-058, REG-059, REG-060, REG-061, REG-062]
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
VERIFIED_AGAINST_SHA: c332992
---

# PLAN-013 — Public landing surface

## Scope

The 14 public routes of `apps/landing`: marketing pages, the four lead-capture
forms, the plans and subscribe surfaces, and the token-bearing partner and
signing routes.

Everything here is **unauthenticated and public**, which is what makes the area
worth its own plan: there is no permission model to fall back on, so a defect is
visible to anyone, and the acquisition funnel is the first thing a prospect
sees.

Deliberately excluded: the authenticated tenant product (`apps/web`), platform
admin (`apps/admin`), and the Stripe checkout session itself — see Integration
Cases for where that boundary sits.

## Risks

Ranked from what has actually gone wrong here, not from imagination.

1. **A server-side fetch failure taking down a whole page.** BUG-0061 — the two
   highest-value commercial routes returned 500 on any transport failure. The
   landing renders commercial configuration server-side on six routes, so this
   class recurs wherever a new loader is added.
2. **Shared-shell changes breaking every route at once.** The header, footer and
   `PageShell` are on all 14 routes; BUG-0062 and BUG-0064 both lived there.
3. **Form defects only assistive technology or a keyboard reveals.** BUG-0063 —
   a form that looked fine and could not be completed or diagnosed.
4. **API response shapes diverging between branches.** BUG-0065 — the fallback
   branch dropped a key, on exactly the path a fresh deployment takes.
5. **States that render but cannot be acted on.** BUG-0066 — an editable form
   with nothing to submit.
6. **Latent defects hidden by absent fixture data.** The invalid `<dl>` on
   `/plans` existed for as long as the list was empty. An empty state can hide a
   broken populated one.

Related patterns: `doc-code-drift`, `ui-permission-backend-mismatch`.

## Preconditions

- PostgreSQL, the API, and the landing app running.
- `npm run seed:config` for commercial data — markets, plans, prices and the
  feature catalogue. Without it every route resolves the no-market path and the
  populated surfaces are never exercised.
- No tenant, role or credential is needed. That is why this plan's browser
  scenarios are cheap enough to run on every push.
- For a production-fidelity pass: `next build && next start` rather than the dev
  server. Dev-mode on-demand compilation produces hydration warnings that are
  not product defects.

## Test Types

| Type | Status |
|---|---|
| BROWSER_E2E | **Good** — `e2e/tests/flow-c-landing-public-surface.spec.ts`, 18 scenarios |
| E2E | Gap for this area — flows A and B cover the commercial journey beyond the landing site |
| API | Gap for this area — the public endpoints are exercised through the landing proxies |
| UNIT | Gap for this area (tests exist, no scenario record) — `apps/landing/lib/*.spec.ts` covers plan and acquisition presentation |
| SECURITY | Gap for this area — rate limiting on public endpoints is BUG-0031/BUG-0032, not this plan |
| DATABASE | Gap — no landing-specific database assertions; lead persistence is checked through the API |
| PERFORMANCE | Gap — no budget defined for this surface |

## Data Requirements

Seeded commercial configuration from `seed-config`. Leads created by automated
runs use `.test` email domains so they are identifiable and disposable. Never a
real customer record, and never a credential.

## Security Cases

The landing surface holds no tenant data, so the classic cross-tenant cases do
not apply. What does:

- Public endpoints must not enumerate tenants or customers in responses or error
  messages.
- Token-bearing routes (`/sign/[token]`, `/partners/activate/[token]`,
  `/partners/onboarding/[token]`) must not leak the token into page titles,
  headings or any analytics-visible string.
- Checkout must be authorised server-side; the client's idea of a price is never
  trusted. Verified by V16, which is refused with `VALIDATION_FAILED`.

## Negative Cases

- API unreachable, timing out, returning 5xx, returning malformed JSON.
- No market published; market published with no purchasable plan.
- Forms submitted empty, with an invalid email, and twice identically.
- Invalid or expired tokens on all three token-bearing routes.
- Unknown routes.

## State Transitions

The plans/subscribe surface moves between **no market** → **market, no
purchasable plan** → **purchasable plan**. Each renders a different legitimate
state, and the illegal one this plan exists to reject is *any* state presenting
an editable form with no way to submit it.

## Integration Cases

The landing site talks to one boundary, the DijiPeople API, and through it to
Stripe.

**The external boundary is explicit:** checkout initiation is verified up to
`POST /api/public/subscribe`. Completing a Stripe Checkout session requires a
Stripe-verified price — `stripeProductId`, `stripePriceId`, matching
environment, `SYNCED` status and `stripeVerifiedAt` — which cannot be produced
locally without creating objects in a real Stripe test account. The server
correctly refuses an unverified price, and that refusal is the assertion.

## Browser Cases

Fully covered, and this is the area where browser evidence earns its cost: all
six bugs this plan was created from were invisible to a code read.

The suite runs at 1440x900, 768x1024 and 390x844 and asserts: skip link and
focus movement, `aria-current`, footer target size and actionable contact links,
mobile menu dismissal by navigation, Escape and outside click, form validation
association and real submission, config console cleanliness, the subscribe
unavailable state, 404 semantics, route titles, and hydration cleanliness.

## Regression Links

| Regression | Scenario | Bug |
|---|---|---|
| REG-057 | QA-LANDING-001 | BUG-0061 |
| REG-058 | QA-LANDING-002 | BUG-0062 |
| REG-059 | QA-LANDING-003 | BUG-0063 |
| REG-060 | QA-LANDING-004 | BUG-0064 |
| REG-061 | QA-LANDING-005 | BUG-0065 |
| REG-062 | QA-LANDING-006 | BUG-0066 |
