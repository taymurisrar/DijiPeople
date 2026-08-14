# QA Run — admin-session-expired-logout

## Metadata

| | |
|---|---|
| Date / time | 2026-08-14T23:02:23.709Z |
| Branch | `main` |
| Commit SHA | `cbc2db8e372040efb81832d2c647dbe297f8b19e` |
| Change under test | `c6aab75`, merged as `7b2da67` |
| Worktree | `D:\My Work\hrm-dijipeople\DijiPeople` |
| Environment | Working tree dirty at scaffold time with two unrelated sets of files: the tenant-control-plane work the repository owner committed himself as `cbc2db8`, and regenerated `gateway/**/obj/` .NET build artefacts. Neither was touched by this task. Admin dev server on `localhost:3002`; API not exercised — session revocation was not observable from this environment. |
| QA agent | Claude (implementer-executed QA) |
| Scope | Covered: the admin logout route's HTTP method contract, the session-expired redirect chain, cookie clearing, and `next` sanitisation. Not covered: server-side revocation of the platform refresh token (needs a live API and a real platform session), and the rendered error modal (no jsdom in this workspace). |

## Requirement

The platform admin session-expired error modal offers "Sign in again" as a link
to `/api/auth/logout?reason=session-expired`. That link must return the operator
to `/login` with the session cleared. In production it returned HTTP 405 and the
browser rendered its own error page, leaving the operator with no route back.
No ExecPlan — single-surface bug fix under the "small, local fix" allowance in
[`AGENTS.md`](../../../AGENTS.md).

## Risk Areas

- **`route-method-mismatch`** (the pattern this run created): the link is a GET;
  the route exported only POST. Nothing type-checks that pair.
- **Open redirect**: the fix introduces a caller-supplied `next` parameter into
  a redirect. `sanitizeAdminNextPath` must reject absolute, protocol-relative
  and backslash paths.
- **Cookie clearing on a redirect**: cookies set through the `next/headers`
  store do not reliably survive a redirect response; they must be set on the
  `NextResponse`.
- **Regression on the existing POST caller**: the admin topbar sign-out shares
  the route and must keep working.
- No `docs/qa/regressions/index.md` entries existed for this module before this
  run — REG-001..REG-007 are all API-side authorization.

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | `GET /api/auth/logout?reason=session-expired` before the fix | regression | 405 — reproduces production | PASS | `curl -i` → `HTTP/1.1 405 Method Not Allowed` |
| S2 | Same request after the fix | happy | 307 to `/login` carrying `reason` | PASS | `location: http://localhost:3002/login?reason=session-expired&next=%2Ftenants%2Fabc` |
| S3 | Follow the redirect as a browser would | UI-state | Lands on `/login` 200 and the page states the session expired | PASS | `curl -L` → `final_status=200`, `redirects=1`; page contains "Session expired" |
| S4 | Auth cookies after the GET | negative | All four admin auth cookies expired | PASS | Four `set-cookie` headers, each `Max-Age=0; HttpOnly` — access, refresh, session, remember-me |
| S5 | `POST /api/auth/logout` (topbar sign-out) still works | regression | 200 | PASS | `curl -X POST` → `status=200` |
| S6 | `next=https://evil.example.com/steal` | negative | Off-site target refused | PASS | `location: …/login?reason=session-expired&next=%2Ftenants` |
| S7 | `next=//evil.example.com` (protocol-relative) | boundary | Refused | PASS | `location: …/login?next=%2Ftenants` |
| S8 | Plain sign-out with no query parameters | boundary | No `reason`, no `next` on the redirect | PASS | `logout-route.spec.ts` — "omits next entirely for a plain sign-out" |
| S9 | Every other admin auth route reachable by navigation | contract | None — all POST-only routes are `fetch`-only callers | PASS | Grep for `href=`/`<form action=`/`window.location.*=` against `/api/` across `apps/` returned one hit, the one fixed |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace admin run test` | admin jest | 49 | 0 | 0 | 5.96s |
| `npm --workspace admin run check-types` | next typegen + tsc | ok | 0 | 0 | — |
| `npx eslint <3 changed files>` | eslint (no `--fix`) | 0 problems | 0 | 0 | — |
| `node scripts/validate-framework.mjs` | framework | 351 checks | 0 | 0 | — |
| CI run `31847471466` (branch `c6aab75`) | full CI | required gate success | — | — | — |
| CI run `31848127448` (merged `4a0f45a`) | full CI | required gate success | — | — | — |

`eslint` was run directly on the three changed files rather than through
`npm --workspace admin run lint`, because that script passes `--fix` and would
have rewritten the repository owner's uncommitted files.

`Lint services/api (report only — NOT a gate)` failed in both CI runs. It fails
identically on `main` at `adb7a6a`, the commit this work branched from
(run `31846554141`), so it is pre-existing and unrelated — this change touches
no API file.

### Regression-test proof

| Test | With fix | Without fix (pre-fix `route.ts` restored from `adb7a6a`) |
|---|---|---|
| `apps/admin/app/api/auth/logout/logout-route.spec.ts` | PASS (6/6) | **FAIL** (2 failed, 4 passed) — `typeof route.GET` was `undefined` |

## Manual Validation

All of S1–S7 were executed by hand with `curl` against the admin dev server on
`localhost:3002`, first against the unmodified checkout to reproduce the
production 405, then against the fix, then once more after the merge landed on
`main`. The redirect chain was followed end to end (`curl -L`) and the resulting
`/login` markup was checked for the session-expired notice rather than assuming
the redirect target renders.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-001..REG-007 | All API-side authorization entries; no overlap with this frontend route | N/A — not applicable to modules in scope |
| REG-008 | Created by this run | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| B1 | High | `GET /api/auth/logout` returned 405, stranding every admin operator whose session expired | `route-method-mismatch` | yes — `logout-route.spec.ts` |
| B2 | Medium | API session revoked only when the refresh cookie survived, so a "sign out" could leave the platform session live server-side | — | no — not observable without a live API session; see Known Limitations |
| B3 | Medium | `getClearAuthCookieOptions()` unguarded; it throws on a rejected cookie configuration such as an `ADMIN_COOKIE_DOMAIN` on the `.vercel.app` production host, which would turn sign-out into a 500 | — | no — requires production-like env validation |

B1 was the reported defect. B2 and B3 were found by auditing the same path and
were fixed in the same change; `apps/web` already carried the guard B3 restores.

## Known Limitations

- **Server-side revocation was not observed.** The API was not running, so the
  `POST {api}/auth/logout` call is unverified end to end. What was verified is
  that the route now forwards the `X-DijiPeople-App: admin` header and a Cookie
  header built from whichever auth cookies exist — the two inputs
  `AuthService.logout` reads (`auth.service.ts:967`, `getClientId`, and
  `extractTokenFromRequest`, which reads cookies only and ignores the request
  body).
- **The error modal itself was not rendered.** `apps/admin/jest.config.js` is
  node-environment and jsdom is not installed, so the `<a href>` was verified by
  reading the component and by testing the route it targets, not by clicking it.
- **B3 was not reproduced.** Triggering it needs `NODE_ENV=production` plus a
  rejected cookie domain; the fix is a defensive fallback copied from the
  equivalent guard already shipping in `apps/web`.
- The dev server served a hot-reloaded build, not a production `next build`.
  CI's `Build` job passed on both the branch and the merged SHA.

## Final QA Verdict

**PASS**

The reported defect was reproduced locally as the identical 405 seen in
production, fixed, and re-verified end to end including the redirect chain, the
rendered login page, cookie expiry and the pre-existing POST caller. The new
`next` parameter was probed with off-site and protocol-relative values and both
collapse to `/tenants`. The regression test was proven to fail against the
pre-fix route. Both CI runs passed their required gate. The two secondary
defects are fixed but unverified at runtime for the environmental reasons above
— neither is reachable from the flow this run covers, and both are strictly
more defensive than the code they replace.

## Follow-up

- Verify B2 against a live API when one is available: sign out with the refresh
  cookie already expired and confirm the `PlatformRefreshToken` row is revoked.
- Consider extending the `route-method-mismatch` check into a lint rule or a
  repo-wide test that cross-references `href` targets under `app/api/` with the
  methods those route files export. This run did that audit by grep; it will
  drift.
