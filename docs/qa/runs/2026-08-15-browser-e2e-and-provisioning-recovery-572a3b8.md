# QA Run — First browser E2E, and provisioning recovery against a real database

## Metadata

| | |
|---|---|
| Date / time | 2026-08-15, evening local |
| Branch | `agent/autonomous-framework-triage` |
| Commit SHA | baseline `b2ba383`; validated at `572a3b8` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-autoframework` (the primary checkout was dirty with unrelated gateway build artefacts and was not touched) |
| Environment | Local API (`start:dev`, :4000), landing (:3000) and admin (:3002) against a **disposable** local PostgreSQL `dijipeople_test` @ localhost:5432 — created for this run, migrated by `prisma migrate deploy`, seeded with `seed:config`, `seed:admin`, `seed:platform-workflows`, `seed:demo`. The developer's working `dijipeople` database was **not** used. Chromium via Playwright 1.62.1. |
| QA agent | QA, with Architect, Backend/API, Frontend and Integrator input |
| Scope | Covered: the first browser-driven coverage this repository has ever had (Flow A and Flow B public entry points through to admin surfaces), and the BUG-0015 recovery anchors against real PostgreSQL constraints. **Not covered:** contract signature (external surface), tenant activation to `ACTIVE`, Stripe (stubbed), the partner onboarding review screens (unreachable — BUG-0019). |

## Requirement

Close `BROWSER_E2E = BLOCKED_INFRASTRUCTURE`, which had appeared in the Known
Limitations of every prior QA run and meant no UI defect in this repository
could be *proven* fixed. Then prove — against a real database rather than a
mock — that a tenant whose provisioning failed before `identities-and-billing`
can converge on a usable state.

## Environment findings recorded before testing

The previous run's finding about `.agent/context/testing-architecture.md` still
held at `b2ba383` and is fixed on this branch (BUG-0023). One new hazard, worth
recording because it produced a silent false result mid-run:

**`node scripts/verify-database.mjs` reported exit 0 while doing nothing.** It
printed `DATABASE_URL is not set. Refusing to continue.` and still exited
successfully when invoked through a shell that had not exported the variable —
`services/api/.env` is read by the API and by Prisma, not by repo-root scripts.
The migration and seed appeared to succeed and the database was empty. Caught
only because `seed:admin` then failed on `public.PlatformUser does not exist`.
Anything downstream of that would have tested nothing.

## Browser E2E — 9 scenarios, all passing

Playwright, Chromium, one worker, serial. Full configuration rationale in
[`docs/development/browser-e2e.md`](../../development/browser-e2e.md).

| ID | Scenario | Verdict |
|---|---|---|
| A1 | Landing `/request-demo` submitted in a browser; a `Lead` row appears | **PASS** |
| A2 | Honeypot submission is silently dropped; no `Lead` row | **PASS** |
| A3 | Platform operator signs in through the real login form and finds the lead | **PASS** |
| A4 | The lead record page opens from the list row | **PASS** |
| A5 | The tenant record and its provisioning operations surface render | **PASS** |
| B1 | Landing partner inquiry submitted in a browser; a `PartnerInquiry` row appears | **PASS** |
| B2 | An identical resubmission adds no second row (`submissionHash` dedup) | **PASS** |
| B3 | The partner surfaces are reachable from admin navigation | **PASS** |
| B4 | The submitted inquiry is discoverable on the partner-inquiries surface | **PASS**, with the reachability half marked `fixme` — see below |

Every mutation above went through the UI. The database was read only to verify
what the UI produced.

### A2 — a test defect that would have reported a false PASS

The first version of A2 filled the honeypot with `page.fill(..., { force: true })`.
The field is `display:none`, and Playwright's `fill` **leaked the text into the
phone number input instead** — producing `+13125550000http://spam.example`, a
client-side validation error, no submission, and therefore no `Lead` row. The
assertion "a honeypot submission leaves no Lead row" passed for entirely the
wrong reason.

Caught by noticing the test failed on the *success panel* assertion rather than
the row assertion, and confirmed by an isolation run with and without the
honeypot step. The scenario now sets the value through the native setter and
dispatches React's `input` event, which is how a scripted submission actually
populates a hidden control. The API's honeypot behaviour was independently
confirmed: `POST /api/leads` with `website` set returns `201 {"submitted":true}`
and writes nothing.

Recorded because it is the failure mode this whole suite exists to prevent — a
green assertion that proves nothing.

### B4 — what it does and does not prove

It proves the company that submitted an inquiry is **discoverable**. It does not
prove the review screen is reachable: `/partner-inquiries` redirects to
`/partners?viewId=partner-inquiries`, which lists **Partner** rows, and a
partner inquiry creates a `Partner` carrying the same company name — so the name
would appear even with the inquiry entirely unreachable. Rows open
`/partners/{partnerId}`, a different entity from
`/partner-inquiries/{inquiryId}`, which still has no inbound link anywhere in
the app.

The assertion BUG-0019 is actually about is present and marked `test.fixme`, so
the gap appears in every report rather than being absent from it. This corrects
an earlier, looser reading of the same scenario.

## Database-backed provisioning recovery — 7 scenarios, all passing

`services/api/test/tenant-provisioning-recovery.e2e-spec.ts`, against real
PostgreSQL. These assert the constraints the BUG-0015 fix depends on, which a
mocked Prisma cannot test — it would happily "prove" idempotency against
constraints that do not exist, which is how the step came to be classified
non-retryable on a reading of the code rather than of the schema.

| Scenario | Verdict |
|---|---|
| A tenant failed before `identities-and-billing` has 0 business units and 0 users | **PASS** |
| The owner and its default business unit are created on first convergence | **PASS** |
| A second user with the same email in the same tenant is refused | **PASS** |
| The same email is still permitted in a **different** tenant | **PASS** |
| A second subscription for the same tenant is refused | **PASS** |
| An existing invoice for the subscription is found, which is what suppresses a second one | **PASS** |
| The tenant reports converged once business unit, owner and subscription exist | **PASS** |

Unit-level idempotency (no duplicate owner, service account, role grant,
subscription, feature override or invoice on replay; nothing reported as newly
created on a replay, so nobody is re-invited) is covered by
`tenant-identities-provisioning.service.spec.ts`.

## Verdict

| Area | Verdict |
|---|---|
| `BROWSER_E2E` | **PASS** — no longer `BLOCKED_INFRASTRUCTURE` |
| `TENANT_PROVISIONING` recovery anchors | **PASS** |
| Partner onboarding review state machine | **PASS** (unit) |
| Partner lifecycle guards | **PASS** (unit) |
| Tenant activation to `ACTIVE` | **NOT REACHED** — see ITEM-0004, now unblocked |
| Contract signature | **NOT COVERED** — external surface |
| Partner review screens | **NOT COVERED** — unreachable, BUG-0019 |

## Known Limitations

- The browser suite covers the **public entry points and the admin read
  surfaces**. It does not drive lead → agreement → signature → conversion →
  provisioning end to end, because signature is external. Substituting an API
  call for that step would make the suite pass while claiming a journey it never
  drove.
- Tenant activation to `ACTIVE` has still never been reached in any test. This
  run removed the *blocker* (BUG-0015) and proved the recovery anchors; it did
  not reach activation. ITEM-0004 moves from `BLOCKED` to `READY`, not to
  `DONE`.
- Everything ran against a single-worker local stack. Concurrency behaviour under
  parallel workers is unproven and the suite is deliberately serial.
- The browser job is **report-only** in CI and has never run on a CI runner as
  of this record. Its promotion criteria are in `docs/development/browser-e2e.md`.

## Findings

No new product defects were found by the browser run. One new defect —
[[BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-]] — was
found by the Reviewer while fixing BUG-0016, and is fixed with regression
coverage. One **test** defect was found and fixed in this run (A2 above); it
produced no bug record because the product behaviour was correct throughout.

## Related

[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]] ·
[[BUG-0016-partner-onboarding-review-has-no-state-machine]] ·
[[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] ·
[[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist]] ·
[[BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-]] ·
[[ITEM-0001-no-browser-e2e-tooling-exists]] ·
[[ITEM-0004-tenant-activation-never-proven-end-to-end]]

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0015]] · [[BUG-0016]] · [[BUG-0019]] · [[BUG-0023]] · [[BUG-0025]] · [[ITEM-0001]] · [[ITEM-0004]]

<!-- GRAPH:END -->
