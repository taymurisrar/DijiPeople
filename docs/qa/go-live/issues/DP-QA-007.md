# DP-QA-007 — Logout is slow and the client reports "[Logout] Request timed out after 8000ms"

| Field | Value |
|---|---|
| Category | Performance (observation) |
| Severity / Priority | Medium / **P2 (provisional)** — local `next dev` numbers are not production evidence |
| Status | Open — **needs a production-like measurement** |
| Route | profile menu → *Logout* → `POST /api/auth/logout?next=/` |
| Test | `DPQA-AUTH-030` (allows this one console message; asserts the session actually ends) |

## Facts (CONFIRMED locally)
- API `POST /api/auth/logout`: 579 ms, 2 295 ms, 3 936 ms across three runs (`.qa-api.log` AccessLog); web proxy 3.1 s.
- During one run the client logged `[Logout] Request timed out after 8000ms` and the menu sat on "Signing out…".
- After logout the app lands on `/` first; the protected-route redirect to `/login` happens on the next navigation.
- Seven other API calls on the same page are 60–190 ms, so logout is the outlier.

## Suspected
Session revocation does more work than a single update (refresh-token family, session rows, possibly audit). Profile
`AuthService.logout`. Not proven.

## Impact
A user can believe sign-out failed (spinner, then timeout) and close the tab while the session may still be live — a
shared-computer risk. Re-measure against a production-like build (`next start`, warm DB) before ranking.

| Run | Result |
|---|---|
| RUN-001 | OBSERVED |
