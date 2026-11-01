# DP-QA-040 — `/auth/me` reports an idle-expired session as live while every guarded API refuses it

| Field | Value |
|---|---|
| Category | Authentication / consistency |
| Severity / Priority | Low / **P3** |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), test DPQA-SESS-023; direct experiment with tenant B policy 15 min |

**Experiment** (policy `idleTimeoutMinutes` = 15, session `lastActivityAt` aged in the throwaway DB):

| Idle | guarded endpoint (`GET /employees`, Bearer) | `GET /auth/me` (session cookie) |
|---|---|---|
| 0 min | 200 | 200 |
| 10 min | 200 | 200 |
| 16 min | **401 SESSION_EXPIRED** | **200** |

The guard enforces the idle window correctly (DPQA-SESS-020, SESS-021 pass). `/auth/me` is `@Public()`; its `isSessionStillLive` check (BUG-2547) covers revocation and expiry but not the idle window, so it keeps answering with the caller's identity and permissions until the first guarded call fails.

**Impact.** Low: nothing is exposed that the cookie holder did not already have, and the next API call ends the session. The UI may show a signed-in shell for one more request.

**Platform facts recorded (not defects).** `idleTimeoutMinutes` has a product minimum of 15 and maximum of 1440; a lower value is stored as given and enforced as 15 (SESS-022). The absolute lifetime is configured in days and was not run.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — SESS-023 fails |
