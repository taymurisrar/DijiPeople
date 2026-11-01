# DP-QA-012 — `PATCH /tenant-settings` accepts an invalid timezone ("Not/AZone"); afterwards every page of the tenant throws RangeError

| Field | Value |
|---|---|
| Category | Functional (validation) / UI stability |
| Severity / Priority | High / **P1** (a tenant admin typo, or a crafted request, degrades the whole tenant UI; no server-side validation) — downgrade to P2 if the web UI constrains the field to a list *and* no integration can set it |
| Status | Open |
| Test | `DPQA-SET-003` (fails). Side effect observed by `DPQA-A11Y-002/003/020/021`, `DPQA-RESP-002/003` (console error on every page) |
| Env | tenant `qa-prov-a`, owner, 2026-10-30 |

## Steps
1. `PATCH /api/tenant-settings` `{"updates":[{"category":"organization","key":"timezone","value":"Not/AZone"}]}` as the tenant owner.

## Expected
400 with a field error; stored value unchanged.

## Actual (CONFIRMED)
200; the value is stored (`GET /tenant-settings/resolved` → `"timezone":"Not/AZone"`). From then on, every page that formats a date logs
`RangeError: Invalid time zone specified: Not/AZone at formatConfiguredDate (lib/formatting-context.ts:107)` in the browser console on Employees, New Employee, Leave and others.
The QA suite restored `UTC` and now restores in a `finally` block.

## Analysis
Server accepts any string for a settings value that is consumed by `Intl.DateTimeFormat`. Validate against `Intl.supportedValuesOf('timeZone')` server-side; harden `formatting-context.ts` to fall back to the tenant default instead of throwing.
Check the other settings catalog keys for the same (date format, language, currency, week start).

| Run | Result |
|---|---|
| RUN-002 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - SET-003 pass (400 on invalid, usable value stored) |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - SET-003: pass |
