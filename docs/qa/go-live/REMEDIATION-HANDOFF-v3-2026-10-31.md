# Starter go-live remediation handoff v3 (for QA RUN-005)

Branch `agent/starter-golive-remediation` (local only; not pushed, merged or deployed; no production access).
**Final application commit: `f47e504c`.** This document is committed after it and changes no code.
Status words below are developer claims. Only independent QA marks anything Resolved.

## Validation on f47e504c

| Check | Result |
|---|---|
| Web jest | 134 suites / 2344 tests pass |
| Web `check-types` | pass |
| Web production build (`next build --webpack`) | pass; served by `next start` for all live runs |
| API jest, tsc (build config), lint (787-warning budget) | passed at the last API change (50a3b4aa); no API code changed since |
| Live checks `e2e/remediation/live-check.mjs` / `live-check-round2.mjs` | 56/56 and 25/25 against a throwaway `_test` DB, API :4101, ENFORCE, Starter |
| Playwright Test golive suite (chromium, firefox, mobile, tablet) | WebKit not run (needs a TLS front). Failures triaged below |
| Secrets / `.env` / credential backups | none tracked or staged; QA suite copy and `.env.qa.local` are git-excluded |

## DP-QA-001 to 034 status (developer view)

- Fixed, awaiting QA: 001-005, 008-025, 027-032, 033, 034 (see v1/v2 handoffs and commit log for per-issue commits; 025 `56dfb073`, 027-031 live-checked, **032 `f47e504c`**).
- DP-QA-032 root cause: "Passwords match." mounted on confirm-field blur, i.e. on mousedown over the button; the button moved before mouseup and no click fired (Enter worked). Space is now reserved. Verified in a real browser at 1280x720: click posts `/api/auth/activate-account` and redirects to login. Regression: `activate-button-layout.spec.ts`.
- Not fixed: **006** (empty `src` not located), **007** (needs production-like measurement), **026** (e-mail branding not implemented; owner decision).

## Failures that were test or environment issues, not application defects

- SMK-020 hardcodes port 4098. LV fixtures need a quiet rate-limit window (login throttle 20/10 min, read limit 600/min). LV-031 uses `limit 1` and picks an arbitrary balance row.
- INV-102: fixture ages tokens with a local-time `now()` on a UTC+5 host against `timestamp without time zone`; use `now() at time zone 'utc'`.
- MAIL-002: replaying a consumed token is now refused with 401 before the 400 password-history check (correct per DP-QA-031); update the expectation.
- INV-101: sink `fromEmail` must be `no-reply@qa.dijipeople.test` (config only).
- SMK-004, CMD-022, LV-023, RBAC-2 price and VIS baselines: premise updates (price, colours, data).
- INV-104 was a genuine defect (032), now fixed. Rerun it.

## Owner decisions outstanding

DP-QA-005 cutover/grandfather timing; agent gating; Import on Starter; whether HR gets `attendance.override` / `customers.delete` (not granted without a verified requirement); DP-QA-026 e-mail branding; compliance grant.

## Risks

Remaining New Employee API calls (69, from 127) are inherent tenant-settings/branding proxy calls. WebKit is untested. Production-like performance for 007 is unmeasured.

## RUN-005 instructions

1. Check out `f47e504c`'s branch in a fresh worktree; `npm ci` (do not junction `node_modules`).
2. Create a throwaway database whose name ends `_test`; run migrations and `seed:config`; set Starter plan, `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE`, wildcard DNS ready.
3. Build and start the web app (`next build --webpack`, `next start`) and the API; start the local SMTP sink and point the platform e-mail relay at it (`fromEmail` = `no-reply@qa.dijipeople.test`).
4. Run the golive suite with fixtures per the triage list above, spaced to avoid 429s; rerun INV-101..104, MAIL-002, LV-*, and the 027-032 live checks.
5. Record results on the QA branch; mark Resolved only on your own evidence.
