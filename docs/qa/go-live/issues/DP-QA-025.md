# DP-QA-025 — One employee form load fans out into ~100 duplicate API calls (22× `/locations`, 26× `/tenant-settings/resolved`, 20× `/public-branding` …) and exhausts the per-user read limit

| Field | Value |
|---|---|
| Category | Performance / efficiency (with a user-visible failure mode: [[DP-QA-024]]) |
| Severity / Priority | Medium / **P2** |
| Status | Open |
| Found in | RUN-004, candidate `22a21a14` (production build); also visible in the RUN-003 access log |
| Evidence | `e2e/golive/tools/ssr-count.cjs` + API access log |

## Measurement (CONFIRMED)
Opening `/leaves` and then `/employees/new` as the tenant owner produced **174 API requests in the API access log**. Top routes: `/tenant-settings/resolved` 26, `/locations` 22, `/tenant-settings/public-branding` 20, `/work-schedules` 13, `/employee-levels` 10, `/designations` 9, `/departments` 8.
A single `/leaves` load makes only ~6 browser-side API calls, so the fan-out is **server-side rendering of the form's lookup fields**: every lookup field (Location, Official Joining Location, Default Work Schedule, Department, …) fetches the same reference list and the tenant settings again instead of sharing one request.
Over the whole RUN-003 session the API served 1,529 `tenant-settings/resolved` and 1,346 `public-branding` calls.

## Why it matters
- The authenticated read limit is **600 / min per user**. At ~100 calls per form, six opens of New/Edit Employee in a minute (or a few users sharing a service account/NAT-free but busy HR admin) reach **429**, and a 429 on a page load shows the generic error screen (DP-QA-024). QA hit this repeatedly (EMP-006/009, CMD-005, PERF-001/002) and had to add 15-second pacing after every employee form.
- Database and API load scale with form fields, not users.

## Recommended
De-duplicate reference-list fetches per request (request-scoped cache / one batched lookup call), resolve tenant settings once per render, and handle 429 in the shell with a retry-after message.

| Run | Result |
|---|---|
| RUN-004 | OBSERVED |
| RUN-005 (f47e504c) | **RESOLVED** - PERF-001/002 pass; developer reports 127 -> 69 calls |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - PERF-001: pass, PERF-002: pass |
