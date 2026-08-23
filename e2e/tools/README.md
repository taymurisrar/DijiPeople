# Diagnostic tools

Scripts that answer a question a pass/fail test cannot. A spec tells you the
site is broken; these tell you *what* and *by how much*, which is what a bug
record needs.

They are not run by `playwright test` and nothing in CI depends on them. Point
each at a deployment with its first argument.

| Tool | Answers |
|---|---|
| `web-vitals.mjs` | How fast is each page, and how stable — TTFB, FCP, LCP, CLS, per route. |
| `layout-shift-throttled.mjs` | Does CLS appear under a real connection? On localhost every asset arrives instantly, so a page that reflows when its webfont lands still scores 0. |
| `layout-shift-detail.mjs` | *Which element moved*, from which rectangle to which. Turns "CLS 0.313" into something to fix. |
| `accessibility-sweep.mjs` | axe serious/critical violations per page, plus every control with no accessible name. |
| `drive-checkout.mjs` | Drives the whole self-service purchase — wizard, email verification, Stripe test card, provisioning — and reads back what the database recorded. |
| `sync-stripe-prices.mjs` | Performs the operator step that makes seeded plan prices sellable. Test mode only; refuses otherwise. |

```bash
node tools/web-vitals.mjs https://www.dijipeople.com
node tools/layout-shift-throttled.mjs https://www.dijipeople.com "/,/plans"
node tools/layout-shift-detail.mjs https://www.dijipeople.com "/"
node tools/accessibility-sweep.mjs http://localhost:3010
```

## Measure performance against a production build, never `next dev`

A dev server compiles on first request and ships an unminified bundle. Numbers
taken from it describe the dev server, not the product, and quoting them is
worse than not measuring. Use `npm --workspace landing run build && … start`, or
point the tool at a real deployment.

## The two that write

`drive-checkout.mjs` completes a real purchase: a customer, a Stripe charge and
a tenant. `sync-stripe-prices.mjs` creates Stripe products and prices. Both
refuse to run outside a local, disposable environment — `drive-checkout` on the
target URL and on a `DATABASE_URL` that must be localhost and contain `_e2e_`,
`sync-stripe-prices` on `STRIPE_MODE` having to be `test`. Those guards are the
point; do not loosen them to make a run convenient.
