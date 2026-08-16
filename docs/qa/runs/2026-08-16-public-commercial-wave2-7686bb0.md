# QA Run — Wave 2: Public Plans + Features Experience

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `7686bb0` |
| **Branch** | `agent/public-commercial-wave2` |
| **Scope** | `/features`, `/plans`, subscribe handoff, public commercial config API, landing commercial-duplication audit |
| **Records** | BUG-0029, ITEM-0024 |
| **Result** | PASS — with browser-level verification honestly marked NOT_RUN |

---

## Feature inventory (evidence-backed)

Built from `TENANT_FEATURE_DEFINITIONS` and the real web app routes, not from
the public page's claims.

| Classification | Items |
|---|---|
| `IMPLEMENTED_AND_PUBLIC` (entitlement-gated, 12) | employees, organization, leave, attendance, timesheets, projects, recruitment, onboarding, documents, notifications, branding, payroll |
| `IMPLEMENTED_BUT_NOT_MARKETED` | attendance device integration (`attendance-integrations/{connectors,devices,gateways,ingestion}` + the .NET gateway), reports, approvals, benefits, loans, claims, business-trips, employee self-service, roles/permissions |
| `NOT_FOUND` as entitlement features but advertised | "Reporting", "Role-based access", "Multi-tenant architecture" — the first two are real capabilities, the third is architecture, not a product feature |
| Omitted despite being entitlement features | organization, projects, notifications |

Verified against `apps/web/app/(authenticated)/` route folders, so each claim
maps to a screen a customer can reach.

---

## Scenarios

### A — Pakistan market

| id | Scenario | Result |
|---|---|---|
| A1 | Market resolves server-side; no frontend country/currency table involved | **PASS** — `detectRegionCurrency` remains deleted; resolution is `CommercialConfigService` |
| A2 | No currency dropdown anywhere in the authoritative pricing path | **PASS** — grep confirms none in `/plans`, `/subscribe` or plan cards |
| A3 | Resolved currency is displayed | **PASS** — shown once, with the market name |
| A4 | No PKR price is invented | **PASS** — Pakistan is seeded `defaultCurrency: USD` with the existing repository amounts. The PKR schedule remains `OWNER_DECISION_REQUIRED` |

### B — Monthly / Annual

| id | Scenario | Result |
|---|---|---|
| B1 | Each interval shows its own published price | **PASS** |
| B2 | Savings shown only when mathematically true | **PASS** — `calculateAnnualSaving` returns null when annual is not cheaper, when either offer is unavailable, or across currencies |
| B3 | No hardcoded discount percentage | **PASS** — computed from the two published amounts |
| B4 | An interval nothing is priced in is not offered | **PASS** — the toggle only renders intervals with at least one available offer |

### C — Recommended plan

| id | Scenario | Result |
|---|---|---|
| C1 | Highlight comes from configuration only | **PASS** — `highlightLabel` reads plan metadata |
| C2 | No positional fallback | **PASS** — `index === 1` fallback removed in Wave 1; pinned by test here |

### D — Plan entitlements

| id | Scenario | Result |
|---|---|---|
| D1 | Comparison built from backend entitlements | **PASS** — `buildComparisonMatrix` reads `plan.features` against the catalogue |
| D2 | "Everything in X, plus" only claimed when true | **PASS** — `plansAreCumulative` guards it; falls back to listing outright |
| D3 | No unreachable comparison row | **PASS** — contract spec asserts the top plan grants every visible feature |

### E — Enterprise CTA

| id | Scenario | Result |
|---|---|---|
| E1 | Standard Enterprise stays self-service | **PASS** — no plan-key branch exists anywhere in CTA resolution |
| E2 | Sales routing only from `salesModel` | **PASS** |

### F — Missing price

| id | Scenario | Result |
|---|---|---|
| F1 | No zero, no legacy fallback, no guessed currency | **PASS** |
| F2 | No subscribe CTA when no offer resolves | **PASS** — resolves to `UNAVAILABLE`, rendering a contact link |
| F3 | Offer resolves but not self-service eligible → still no checkout | **PASS** |
| F4 | Whole catalogue empty → safe page-level state | **PASS** — renders a contact panel, not an empty grid |

### G — Subscribe handoff

| id | Scenario | Result |
|---|---|---|
| G1 | Growth + Annual + 50 arrives intact | **PASS** — `resolveSubscribeSelection`; previously reset to Starter/Monthly |
| G2 | Exact `planPriceId` still wins | **PASS** |
| G3 | Team size clamped to plan bounds | **PASS** — raised to minimum, capped at maximum |
| G4 | Requested interval unavailable → keeps the chosen plan | **PASS** |
| G5 | Both interval vocabularies accepted (`YEAR`/`ANNUAL`) | **PASS** |

---

## Local validation

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — 8/8 workspaces |
| `npm --workspace landing run test` | **PASS** — 2 suites, 38 tests (new suite) |
| `npm --workspace api run test` (CI pattern) | **PASS** — 150 suites, 1055 tests |
| `npm --workspace web run test` | **PASS** — 391 |
| `npm --workspace admin run test` | **PASS** — 71 |
| Landing production build (`VERCEL=1`, full config) | **PASS** |
| `npx eslint` (web, admin, landing) | **PASS** — 0 errors |
| `npm run test:app-urls` | **PASS** — 16, no BUG-0026 regression |
| `npm run check:no-hardcoded-urls` | **PASS** |
| `node scripts/validate-framework.mjs` | **PASS** — 503 checks |

---

## Duplicate commercial data audit

| Item | Classification | Action |
|---|---|---|
| `marketing/plans-section.tsx` — currency selector with hardcoded **FX rates** (`monthlyRate: 3.64`), emoji flags | `REMOVE` | Deleted — zero importers, proven |
| `marketing/content.ts` → `plans` with `monthlyPriceUsd: 200` | `REMOVE` | Deleted — a dormant **third** pricing truth |
| `marketing/content.ts` → `currencyOptions` with FX rates | `REMOVE` | Deleted |
| `marketing/content.ts` → `valueItems`, `industries` | `REMOVE` | Deleted — unreferenced |
| `marketing/content.ts` → `contactInfo`, `industryOptions`, `companySizeOptions`, `interestedPlanOptions` | `LEGITIMATE` | Kept — form option sets used by live `/request-demo` |
| `hero-section`, `value-section`, `industry-section`, `site-footer` | `REMOVE` | Deleted — zero importers; the live footer is `site-shell.tsx` |
| `lead-form-section.tsx` | `LEGITIMATE` | Kept — rendered by `/request-demo` |

Orphan status was proven, not assumed: zero references outside the folder, no
barrel file, no dynamic `import()`, and the live footer confirmed to come from a
different module.

---

## Findings

### F1 — BUG-0029, public feature list had drifted both ways — **FIXED**

Advertised three non-entitlement items and omitted three real ones. Recorded and
fixed; regression coverage is the catalogue contract spec.

### F2 — A dormant third pricing truth in the landing app — **FIXED**

`content.ts` held `monthlyPriceUsd: 200` and an FX conversion table, and
`plans-section.tsx` held another. Both unreferenced, so neither was serving
wrong prices — but they were one import away from doing so, and they are exactly
the shape of BUG-0028. Removed.

### F3 — `apps/landing` uses `lucide-react` without declaring it — **DEFERRED (ITEM-0024)**

Resolves only via hoisting from `apps/admin`. Not fixed here because changing a
workspace's dependencies is outside this wave's scope. Wave 2's own icons
deliberately avoid the dependency entirely.

### F4 — Sitemap and `metadataBase` hardcoded the production domain — **FIXED**

Every non-production deployment published a sitemap advertising production URLs.
Both now resolve from `landingEnv.appOrigin`.

---

## Not verified

`BROWSER_E2E = NOT_RUN`. `RESPONSIVE_VISUAL = NOT_OBSERVED`.
`PRODUCTION_DEPLOYMENT = NOT_OBSERVED`.

Responsive and accessibility work was done structurally — the comparison table
scrolls inside its own `overflow-x-auto` container so the page body never
scrolls sideways; the toggle and estimator are real `button`/`input` elements
with `aria-pressed`, `aria-expanded`/`aria-controls` and associated `<label>`;
the comparison conveys inclusion with `sr-only` text rather than colour alone;
icons are `aria-hidden` beside visible labels; tables use `scope` and a
`<caption>`.

**None of that is the same as having looked at the rendered pages at 1366px and
on a phone.** The repository's browser E2E job exists but covers other journeys,
and no screenshots were taken. Stated plainly rather than claimed.

---

## Finding classification

| Finding | Disposition | Record |
|---|---|---|
| F1 — feature list drift | `FIXED` | BUG-0029, REG-019 |
| F2 — dormant pricing duplicates | `FIXED` | Covered by this run |
| F3 — undeclared dependency | `DEFERRED` | ITEM-0024 |
| F4 — hardcoded domain in SEO | `FIXED` | Covered by this run |

## Owner decision still open

Exact Pakistan PKR per-active-employee price schedule for Starter, Growth and
Enterprise. Unchanged from Wave 1 and deliberately not invented here: the market
remains seeded with the repository's existing USD amounts, and the pages render
whatever is published.
