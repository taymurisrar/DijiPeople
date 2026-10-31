# DP-QA-024 — A single 429 (rate limit) response on a page load drops the user into the generic error screen

| Field | Value |
|---|---|
| Category | Functional / resilience |
| Severity / Priority | Low / **P3** (P2 if real users can reach 600 reads/min — an Employee edit form fires ~20 lookups per open) |
| Status | Open |
| Tests | observed by `DPQA-PERF-003`, `DPQA-EMP-006` (before the cooldown was added); not a dedicated test yet |
| Env | production build, tenant `qa-prov-a`, owner |

When the per-user authenticated read limit (600 requests / 60 s, `authenticated-rate-limit.interceptor.ts`) is exceeded, the next page load logs `Failed to load resource … 429`, then **React error #441** and `[DashboardErrorBoundary]` — the user sees "We hit an unexpected problem while loading this page" instead of a "slow down, retry in a minute" message.
Lookup hydration failures are at least reported per field ("Runtime lookup hydration failed … Too many requests") but the form is left half-populated.
The limit was reached here only because the QA suite shares one owner token across hundreds of calls; the finding is the **failure mode**, not the limit.

| Run | Result |
|---|---|
| RUN-003 | OBSERVED |
| RUN-005 (f47e504c) | **RESOLVED** - PERF-003 pass (rate-limited pages say so; Retry-After sent) |
