# QA Run — landing-e2e-local-and-prod

## Metadata

| | |
|---|---|
| Date / time | 2026-08-25T17:56:18.330Z |
| Branch | `agent/landing-e2e-qa` |
| Commit SHA | `42435d59d40bcbc6cd9a9dc7bc546459bc6ad79f` |
| Worktree | `D:\My Work\hrm-dijipeople\wt-landing-e2e-qa` |
| Environment | Local: landing `:3000` + API `:4000` on `develop` @ `42435d59`, against the local `dijipeople` Postgres (219 migrations, up to date). Production: `www.dijipeople.com` (Vercel) + `api.dijipeople.com` (Render, serving `2609275` — **16 commits behind `main`**). Working tree dirty only in `apps/landing/next-env.d.ts`, a pre-existing regenerated file owned by the user, and `apps/landing/.env.local`, created by this run from the checked-in example and gitignored. |
| QA agent | qa (browser-driven, Playwright MCP) |
| Scope | The **public landing site only** — this was the scope the user chose when asked. Marketing pages, header, footer, navigation, content, the contact and partner forms, plan browsing and the `/subscribe` checkout including payment. Explicitly **out of scope**: the tenant product (`apps/web`), platform admin (`apps/admin`), and the agent desktop. |

## Requirement

Exercise the public website the way a visitor would — clicking through it in a
real browser rather than reading its source — on both a local stack and
production, and establish what actually works. No code change was requested and
none was made; the deliverable is evidence and durable records.

The user additionally authorised completing a **test-card purchase in
production**, on the understanding that production Stripe is in test mode.

## Risk Areas

Drawn from `node scripts/retrieve-knowledge.mjs landing checkout` before testing
began. Known-open records for these modules, all of which were watched for:

- [[BUG-0898]] — no plan price synced to Stripe; self-service checkout blocked.
- [[BUG-0903]] — production runs Stripe in test mode.
- [[BUG-0904]] — production lacks `OUTBOX_WORKER_ENABLED`, so nothing provisions.
- [[BUG-0793]] — checkout quotes the alphabetically-first currency, not the market's.
- [[BUG-0028]] — country-to-currency mapping hardcoded in the frontend.
- [[BUG-0021]] — the contact form fabricates lead data and has no honeypot.
- [[BUG-0027]] — admin and checkout pricing come from different models.
- `seeded-but-unsellable` bug pattern — a populated catalogue is not a
  purchasable one; check `checkoutReady`, never the catalogue's appearance.
- `read-the-artifact-not-the-pipeline` — legal pages returning 200 is not
  evidence their contents are publishable. Their text was read, not just their
  status codes.

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | All 17 public routes + sitemap + robots return 200 | contract | 200 each | PASS | 20-route sweep, all as expected |
| S2 | An unknown route returns 404 | negative | 404 | PASS | `/nonexistent-page-404-test` → 404 |
| S3 | Homepage renders with no console errors | UI-state | 0 errors | PASS | 0 errors, 0 warnings |
| S4 | Homepage a11y basics | UI-state | alt text, labels, one `h1`, `lang` | PASS | 0 img-no-alt, 0 unlabelled inputs, 1 `h1`, `lang=en` |
| S5 | `/plans` monthly seat maths | happy | seats × unit price | PASS | 25 × QAR 8 = QAR 200; Enterprise correctly forces its own 50-seat minimum over the entered 25 |
| S6 | `/plans` Monthly↔Annual toggle | UI-state | prices and captions switch | PASS | QAR 8/mo → QAR 80/yr, "Save 17% versus monthly" (80 vs 96 = 16.7%) |
| S7 | Plan CTA carries selection into `/subscribe` | happy | plan, interval, seats in URL | PASS | `/subscribe?plan=starter&billingInterval=YEAR&teamSize=25` |
| S8 | Annual per-seat estimate names the right period | contract | "per year" for an annual price | **FAIL** | Says "estimated QAR 2,000.00 per month" for an annual price → [[BUG-1302]] |
| S9 | Contact form rejects an empty submit | negative | required fields blocked | PASS | 4 required fields invalid, focus moved to first |
| S10 | Contact form rejects a malformed email | negative | typeMismatch | PASS | `type=email`, browser validation message shown |
| S11 | Contact form submits | happy | 201 + confirmation | PASS | `POST /api/leads` → 201, "Thanks — we've received your inquiry." |
| S12 | Partner form submits | happy | 201 + reference | PASS | `POST /api/partners/inquiries` → 201, ref `PIN-20260825-A52C3788`; form resets, so no double-submit |
| S13 | Legal pages carry real, versioned text | content | substantive, not drafts | PASS | e.g. Privacy Policy "Version 1 · in force since 23 August 2026", 3,001 chars of real content; all 10 published with version ids |
| S14 | Market currency is not client-controllable | permission | header ignored | PASS | `x-country-code: US/PK/QA` all still render QAR — the BUG-0032 guard holds |
| S15 | Mobile layout and menu at 390×844 | UI-state | usable, dismissible | PASS | Menu opens, lists all nav + Login + CTA, `aria-expanded`/`aria-controls` correct, Escape closes |
| S16 | `DP-CHK-01` fallback CTA reaches contact | UI-state | navigates with context | PASS (with defect) | Navigates correctly — but see S17 |
| S17 | The fallback CTA does not disturb partner attribution | contract | referral untouched | **FAIL** | Stores `DP-CHK-01` as the referral code for 30 days and then blocks a genuine partner code → [[BUG-1303]] |
| S18 | Subscribe step 1 validates required fields | negative | blocked with messages | PASS | "This is required." per field + "Please complete the highlighted fields before continuing." |
| S19 | Subscribe form carries a honeypot | permission | hidden trap field | PASS | unlabelled `name="website"` input present |
| S20 | Owner email is verified before charging | permission | code required | PASS | 6-digit code gate; ITEM-0063 implemented |
| S21 | Country picker offers a usable list | contract | full ISO set | **FAIL** | Production returns 8 countries → [[BUG-1304]]; locally 250 but 8 misordered → [[BUG-1305]] |
| S22 | Payment completes and an order is created | happy | Stripe charges, order recorded | PASS | Test card `4242…` accepted, redirect to `/subscribe/success`, order `ORD-2026-04CEE065` |
| S23 | Stripe charges what the site quoted | contract | amounts and period agree | **FAIL** | Site said "$75.00 per month"; Stripe charged QAR 284.40 **per year** (= $75/yr) → [[BUG-1302]] |
| S24 | Provisioning completes after payment | happy | workspace created | **BLOCKED** | Order stuck `PENDING_PAYMENT`; no webhook listener and outbox worker off locally — see Known Limitations |
| S25 | Production test-card purchase | happy | purchase completes | **BLOCKED** | No plan is purchasable in the visitor's market — see Known Limitations and [[BUG-0898]] |
| S26 | Published copy is free of raw enum values | content | prose only | **FAIL** | "MONTHLY timesheets…" on `/features` and `/plans` → [[BUG-1307]] |
| S27 | Published contact details are real | content | reachable | **FAIL** | Footer publishes `+1 (312) 555-0184`, a reserved fictional number → [[BUG-1306]] |

## Automated Suites

None run. This was a browser-driven exploratory run against a live local stack
and production, which is what was asked for. The existing Playwright suites
under `e2e/tests/` (`landing-checkout-provisioning.spec.ts`,
`flow-c-landing-public-surface.spec.ts` and siblings) cover overlapping ground
and were **not** executed here — see Known Limitations.

### Regression-test proof

Not applicable — no fix was made in this run. Each bug record names the test that
must fail without its fix, for whoever implements it.

## Manual Validation

Everything above was driven manually through a real browser (Playwright MCP):
navigation by clicking, forms by typing, payment by entering a card. Findings
were then traced to source and, where the cause was data rather than code,
confirmed by querying the database or the API directly:

- The annual/monthly mislabel was confirmed three ways — the rendered page, the
  hardcoded literal at `subscribe-form.tsx:555`, and the amount Stripe actually
  charged.
- The referral collision was confirmed by reading `sessionStorage` and
  `document.cookie` on production, then proving a genuine partner code was
  subsequently discarded.
- The country findings were confirmed against both the production and local
  endpoints and then against `Country.sortOrder` in the database, which is what
  identified the collision rather than a guess about it.

## Regression Checks

No `docs/qa/regressions/index.md` entry covers the landing checkout surface at
the time of this run, so none were re-run. Two of the new records
([[BUG-1302]], [[BUG-1303]]) name a regression test that should exist and does
not; those are the natural first entries for this area.

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[BUG-1302]] | HIGH | Annual per-seat price labelled "per month" — 12× overstatement, contradicted by Stripe | — | No — named in record |
| [[BUG-1303]] | HIGH | `DP-CHK-01` diagnostic code written into the partner referral cookie, blocking genuine partner attribution for 30 days | — | No — named in record |
| [[BUG-1304]] | MEDIUM | Production country lookup returns 8 countries; the 31-country fallback never engages because 8 is "non-empty" | `seeded-but-unsellable` (sibling shape) | No — named in record |
| [[BUG-1305]] | MEDIUM | Priority-market `sortOrder` collides with alphabetical `sortOrder`, scattering key markets mid-list | — | No — named in record |
| [[BUG-1306]] | LOW | Reserved fictional US phone number published as a `tel:` link site-wide | — | No — named in record |
| [[BUG-1307]] | LOW | Raw `MONTHLY` enum in customer-facing copy on two public pages | `doc-code-drift` (sibling shape) | No — named in record |

Also filed: [[ITEM-0100]] — `apps/landing` env examples omit
`NEXT_PUBLIC_WEB_ROOT_DOMAIN`, and the parity test that would catch it only
covers `apps/web`.

[[BUG-0898]] was re-measured rather than duplicated; its History now records
that QAR — the market the site presents itself in — has 0 of 12 sellable prices.

## Known Limitations

What could not be tested here, and why. These are the reason the verdict below is
qualified rather than clean.

1. **The authorised production purchase could not be made (S25).** Not a
   tooling limitation — a product state. No QAR price is checkout-ready, and the
   market cannot be changed from the client (proven in S14), so there was no
   purchasable plan to buy from the visitor's own market. This is reported as a
   finding, not worked around.
2. **Local provisioning after payment was not verified (S24).** Completing it
   needs a Stripe webhook listener and `OUTBOX_WORKER_ENABLED=true`. The Stripe
   CLI's stored key is expired (`api_key_expired`) and re-authenticating needs
   an interactive `stripe login`, which this session could not perform. The
   order therefore sits at `PENDING_PAYMENT` with `CHECKOUT_STARTED` and
   `CUSTOMER_CREATED` unprocessed in the outbox. Both are known configuration
   gaps ([[BUG-0904]]), not new defects — but this run did not prove the
   provisioning path end to end, and does not claim to have.
3. **Production is 16 commits behind `main`.** `api.dijipeople.com` serves
   `2609275`. Findings traced to API behaviour describe the deployed commit, not
   `develop`.
4. **The existing `e2e/` Playwright suites were not executed.** The user asked
   for the site to be driven like a user, and that is what was done; the suites
   would be complementary evidence and remain unrun.
5. **Not covered by choice of scope:** the tenant app, platform admin, and the
   agent desktop. Also untested: real email delivery (locally the verification
   email was recorded `REJECTED`, as expected with no provider), payment
   failure paths (declined cards, 3DS), refunds, rate limiting on the public
   forms, and cross-browser rendering — everything here ran in Chromium.
6. **Two test records were created in production** by design, both clearly
   marked: a lead from `qa.e2e.20260825@example.com` and partner inquiry
   `PIN-20260825-A52C3788`. They should be deleted.

## Final QA Verdict

**PASS WITH RISKS**

The site is in good shape as a *site*. Every route resolves, the console is
clean, the pages are well-built and genuinely accessible — labelled controls, a
keyboard-dismissible mobile menu, correct `aria-expanded`/`aria-controls`, one
`h1` per page, real alt text. Both lead-capture forms work end to end with
correct validation on empty and malformed input. The legal pages carry real,
versioned, published text rather than the drafts they once did. Pricing
arithmetic on `/plans` is right, including the awkward case where a plan's own
seat minimum exceeds what the visitor entered. Market currency cannot be
spoofed from the client. Payment itself works: a card was charged and an order
recorded.

The risks are commercial and they are concentrated in the purchase path:

- **Production cannot sell to the market it presents itself in.** QAR has 0 of
  12 checkout-ready prices, so a Qatar visitor — the site's own default — is
  refused on every plan. Growth, Enterprise and all annual billing are
  unsellable in every currency, and Stripe is still in test mode. The
  authorised production purchase was impossible for this reason.
- **Where an annual price *is* sellable, the site misstates it by 12×**, and
  disagrees with the amount Stripe then charges. That combination is the most
  damaging thing found here, because it is wrong on the last screen before
  payment and the site elsewhere promises the price shown is the price paid.
- **The product's own error path burns partner attribution.** Because no QAR
  plan can be bought, the `DP-CHK-01` fallback is currently the *normal* route
  through `/subscribe`, so this is not a rare edge.

None of these is a regression introduced by recent work, and none blocks the
site from operating as a brochure. All of them block it from operating as a shop.

## Follow-up

Architect triage, applied at the close of this run:

| Record | Disposition | Why |
|---|---|---|
| [[BUG-1302]] | `FIX_NOW` | A wrong price on the screen before payment. The fix is one expression plus a unit test, and the defect contradicts a promise the site makes in writing. |
| [[BUG-1303]] | `FIX_NOW` | Silently loses partner commission attribution, and today sits on the *normal* path through `/subscribe`. Small, self-contained fix. |
| [[BUG-1304]] | `PLAN_REQUIRED` | The durable fix moves reference geography into seeds, which touches seed architecture and deployment — an ExecPlan decision, not a patch. |
| [[BUG-1305]] | `PLAN_REQUIRED` | Changes the meaning of a column and needs a migration or seed correction for existing rows. Must ship **with** BUG-1304. |
| [[BUG-1306]] | `PRODUCT_DECISION` | Engineering cannot invent the real phone number, or decide whether the footer should carry one. |
| [[BUG-1307]] | `PRODUCT_DECISION` | Recasing is trivial; deciding whether timesheet periods are configurable is not, and the wording depends on the answer. |
| [[ITEM-0100]] | `DEFER` | Real and cheap, but developer-experience only. No user-facing consequence. |

No code was changed in this run. The two `FIX_NOW` records are a recommendation
for a follow-up task, not work performed here — this was a QA run and fixing was
neither in its scope nor authorised.

Remaining follow-ups:
- [[BUG-1304]] and [[BUG-1305]] should be fixed **together** — fixing the first
  alone exposes the second to every production buyer.
- Delete the two production test records listed in Known Limitations (6).
- Re-run S24 and S25 once a `stripe login` is available locally and once at
  least one price is sellable in production, to close the two BLOCKED scenarios.
- Consider promoting S8, S17, S21 and S23 into durable QA scenarios — they are
  the checks that found the material defects and none of them exists as a test.
- Observation, not filed as a bug: when no legal documents are published for a
  region, the Agreements step renders an explanatory note and the wizard
  proceeds with nothing accepted. Production publishes all 10 with version ids
  so it is enforced there, and the skip was only reachable locally where none
  are seeded. Worth a decision on whether an unpublished region should block
  checkout rather than waive terms.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0021]] · [[BUG-0027]] · [[BUG-0028]] · [[BUG-0032]] · [[BUG-0793]] · [[BUG-0898]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-1302]] · [[BUG-1303]] · [[BUG-1304]] · [[BUG-1305]] · [[BUG-1306]] · [[BUG-1307]] · [[ITEM-0063]] · [[ITEM-0100]]

<!-- GRAPH:END -->
