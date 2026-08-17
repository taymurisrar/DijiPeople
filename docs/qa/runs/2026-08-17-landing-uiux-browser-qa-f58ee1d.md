# QA Run — landing-uiux-browser-qa

## Metadata

| | |
|---|---|
| Date / time | 2026-08-17T21:37:52.497Z |
| Branch | `agent/landing-uiux-qa` |
| Commit SHA | `f58ee1d60c8883b18beca91d202f1fbf739054dc` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-landing-uiux` |
| Environment | working tree clean; PostgreSQL live on 5432; API live on 4000; landing dev server on 3010; no external services exercised |
| QA agent | QA, with UI/UX leading the review |
| Scope | `apps/landing` only — all 14 public routes, at 1440x900, 768x1024 and 390x844. No authenticated surface, no payment execution, no email delivery. |

## Requirement

A quick but real UI/UX and browser QA pass over the public landing site, using a
live Chromium against a locally running stack, to establish what is actually
wrong on the public surface and to separate genuinely new findings from those
already recorded. Audit only — no product remediation was attempted. No
ExecPlan; this is a `UI/UX` + `QA` task under
[`.agent/context/task-router.md`](../../../.agent/context/task-router.md).

## Risk Areas

The landing site is the top of the commercial funnel and is entirely
unauthenticated, so every defect here is public. Three areas carried the most
risk going in:

- **API-dependent server rendering.** `/`, `/plans`, `/subscribe`, `/features`
  and `/contact` all resolve commercial configuration server-side; a failure
  there degrades or breaks the page. Related: BUG-0026, BUG-0027, BUG-0031.
- **Public forms.** Four separate lead-capture forms exist, written at different
  times. Related: BUG-0021 (resolved), BUG-0048.
- **Boundary states.** ITEM-0046 records that the app has no `loading`, `error`
  or `not-found` boundary, so any failure falls through to framework defaults.

Bug patterns reviewed: `doc-code-drift`, `ui-permission-backend-mismatch`.

## Scenarios

Expected behaviour was written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | All 14 public routes return a renderable response | contract | 200, or 404 for an unknown route | **FAIL** | `/` returned 500; all others as expected. BUG-0061 |
| S2 | No uncaught page error on any route | UI-state | zero `pageerror` events | **FAIL** | `TypeError: fetch failed` on `/`. BUG-0061 |
| S3 | No browser console errors from application code | UI-state | zero | **FAIL** | `[commercial-config] Expected featureCatalog to be an array` on 6 routes. BUG-0065 |
| S4 | No horizontal overflow at any viewport | UI-state | `scrollWidth <= clientWidth` | **PASS** | 42/42 route-viewport combinations clean |
| S5 | Each page exposes one `main` landmark and one `h1` | UI-state | 1 / 1 | **FAIL** | `/request-demo` has no `h1`; 404 page has no `main` |
| S6 | Keyboard reaches main content without traversing the whole header | happy | a skip link exists | **FAIL** | 9 stops before `main` on every route. BUG-0064 |
| S7 | Mobile menu closes when a destination is chosen | UI-state | closed after navigation | **FAIL** | stays open over the destination page. BUG-0062 |
| S8 | Mobile menu dismisses on Escape | UI-state | closed | **FAIL** | remains open. BUG-0062 |
| S9 | Lead forms report what is wrong when submitted incomplete | negative | per-field messages | **FAIL** on `/request-demo`, **PASS** on `/contact` | BUG-0063 |
| S10 | Form errors are programmatically associated with their inputs | UI-state | `aria-invalid` + `aria-describedby` | **FAIL** on `/request-demo`, **PASS** on `/contact` | BUG-0063 |
| S11 | Primary header CTA navigates | happy | reaches `/subscribe` | **PASS** | probe `header-primary-cta-navigates` |
| S12 | Focus is visible on header controls | UI-state | visible indicator | **PASS** | 2px solid outline |
| S13 | Purchase form can be submitted or clearly cannot be used | happy | a submit control, or no editable form | **FAIL** | 8 editable fields, no submit control. BUG-0066 |
| S14 | Invalid signing / partner tokens render a designed error state | negative | branded error, not a crash | **PASS** | `/sign/*` renders "Signing request unavailable" |
| S15 | axe-core reports no serious violations | UI-state | zero serious | **FAIL** | `color-contrast`, 21 nodes, `/contact` + `/partners`. BUG-0064 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `node scripts/validate-framework.mjs` | framework structural validation | 2448 checks | 0 | 0 | ~12s |
| `npm --workspace landing run test` | landing jest, 3 suites | 49 | 0 | 0 | 8.4s |
| `npm --workspace landing run check-types` | `next typegen && tsc --noEmit` | clean, exit 0 | 0 | — | ~30s |

The two `npm` commands were run in the primary checkout rather than this
worktree, which has no installed `node_modules`. That substitution is sound here
and only here: this task changed **no** product code, so `apps/landing` on this
branch is byte-identical to the base it was cut from. `validate-framework.mjs`
needs only Node builtins and was run in the worktree against the actual changes.

The existing Playwright suites in [`e2e/tests/`](../../../e2e/tests/) —
`flow-a-commercial-onboarding` and `flow-b-partner-journey` — were **not** run.
Both drive platform admin and tenant provisioning, which needs seeded commercial
data this environment does not have; running them would have produced
environmental failures that read as product failures. The browser evidence here
came from a purpose-built exploratory harness driving the same Chromium build
that suite uses.

### Regression-test proof

Not applicable — this run fixed nothing, so there is no fix to prove. Every bug
record created carries a `Regression Coverage` section naming the test that must
fail without the fix, and none of them exists yet.

## Manual Validation

All browser work was scripted rather than hand-driven, so it is reproducible:

- A route/viewport sweep over 14 routes x 3 viewports capturing HTTP status,
  console output, failed requests, axe-core violations, landmark and heading
  structure, overflow, tap-target sizes and form attributes. 42 screenshots.
- An interaction probe set covering mobile menu dismissal, keyboard traversal,
  focus visibility, form validation reachability, error association and CTA
  navigation. 15 probes, each printing its own evidence line.

Screenshots and probe output are attached to the task's engineering history.

## Regression Checks

No entry in `docs/qa/regressions/index.md` covers `apps/landing` public routes,
so there was nothing to re-check. That absence is itself worth noting: the
landing site has no regression coverage at all.

| Regression ID | Scenario | Result |
|---|---|---|
| — | none registered for `apps/landing` | N/A |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-0061 | HIGH | `/` and `/subscribe` return 500 when the plans fetch fails | — | No |
| BUG-0062 | HIGH | Mobile menu stays open after navigating; Escape ignored | — | No |
| BUG-0063 | HIGH | `/request-demo` blocks submission with no feedback; unusable by AT | — | No |
| BUG-0064 | HIGH | No skip link (WCAG 2.4.1 A); `--muted-soft` fails contrast (1.4.3 AA) | — | No |
| BUG-0065 | MEDIUM | `commercial-config` omits `featureCatalog` in the no-market branch | `doc-code-drift` (contract) | No |
| BUG-0066 | MEDIUM | `/subscribe` shows an editable form with no way to submit | — | No |

Grouped medium/low findings went to ITEM-0051. ITEM-0046 was re-confirmed with
new evidence rather than duplicated.

**Already documented, not re-raised:** BUG-0021 (verified fixed — the honeypot
and real field capture are present in the code), BUG-0028, BUG-0029, BUG-0031,
BUG-0032, BUG-0048, ITEM-0046.

## Known Limitations

- **No seeded commercial data.** No market or plan is published locally, so
  every route resolved the no-market path. That surfaced BUG-0065 and BUG-0066,
  which live on exactly that path — but it means the populated pricing table,
  the plan comparison and the Stripe checkout journey were **not** exercised at
  all. A second pass against seeded data is required before anyone concludes the
  purchase flow is sound.
- **No form submissions were completed.** Validation behaviour was tested; no
  lead, partner inquiry or subscription was actually created, so success states,
  duplicate-submit protection under a real request, and the API's own validation
  responses are unverified.
- **Signing and partner activation were tested with invalid tokens only.** The
  error shells are confirmed; the successful signing and activation journeys are
  not.
- **Contrast was checked by axe-core, which does not evaluate placeholder text.**
  `placeholder:text-muted-soft` uses the same failing token and is very likely a
  further violation, but it is not counted in the 21 nodes reported.
- **Click-outside dismissal of the mobile menu is inconclusive** — the probe
  toggled the menu shut before testing it. Recorded as inconclusive in BUG-0062
  rather than as a pass.
- One transient made `/` return 500 during the sweep while the API was up; the
  deterministic reproduction in BUG-0061 is with the API stopped.

## Final QA Verdict

**FAIL**

Six defects were confirmed with direct browser evidence, four of them HIGH, and
all six are on public unauthenticated routes at the top of the commercial
funnel. Two are conformance failures (WCAG 2.4.1 Level A and 1.4.3 Level AA)
that apply to every route rather than to one screen. The verdict is a fail on
the **product surface audited**, not on any change — this task changed no
product code.

What works is worth stating plainly, because it should survive the fixes:
responsive layout is clean at all three viewports with zero overflow across 42
combinations, focus indicators are intact, no control anywhere lacks an
accessible name, and `/contact` and `/plans` are already correct implementations
of the two patterns their neighbours get wrong.

## Follow-up

- BUG-0061 and BUG-0065 are small, well-understood fixes and should go first.
- BUG-0062, BUG-0063 and BUG-0064 all touch `site-shell.tsx` or the shared form
  components; sequencing them together avoids three passes over the same files.
- ITEM-0046 should be fixed alongside BUG-0061 — it is the containment layer for
  exactly that failure.
- The landing site has no regression coverage. The scenarios above are the
  natural seed for one; S4, S6, S7 and S15 are the highest-value durable checks.
- Re-run this pass against seeded commercial data before trusting the purchase
  journey.
