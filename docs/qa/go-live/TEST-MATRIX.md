# Test matrix — Starter plan, tenant web

Part of [[README]]. Scope: [[STARTER-SCOPE]]. Specs live in `e2e/golive/tests/`; IDs are permanent
(`[DPQA-<SUITE>-<nnn>]` in the test title). Execution history is in `runs/` ([[INDEX]]). Status here is the **latest run**:
PASS / FAIL / NOT RUN / BLOCKED. **Never PASS unless a run recorded it.**

| Suite | Module / feature | IDs | Automation | Latest | Notes |
|---|---|---|---|---|---|
| SMK | Every Starter route renders, no console error/5xx/crash | SMK-001…016, 020 | `01-smoke.spec.ts` (+`@xbrowser @responsive`) | see runs | SMK-004 = [[DP-QA-004]] |
| AUTH | Login failure, empty submit, unauth redirect, API 401, forged token, employee boundary, logout | AUTH-001…004, 010–013, 020, 021, 030 | `02-auth-security.spec.ts` | see runs | AUTH-021 is weak until DP-QA-002 fixed |
| ENT | Plan exclusions: nav, API 403, direct-URL message, feature resolution, plan-gate screen | ENT-001…005, 010, 030, 040, 1001…1005 | `03-plan-entitlements.spec.ts` | see runs | ENT-1xxx = DP-QA-001/003 |
| EMP | Employee create/read/update/validation/duplicate, tabs, list commands | — | **NOT WRITTEN** | NOT RUN | next batch |
| LV | Leave request, balance, approval routing, cancel | — | **NOT WRITTEN** | NOT RUN | needs DP-QA-002 resolved or fixtured |
| ATT | Check-in/out, correction request, list commands | — | **NOT WRITTEN** | NOT RUN | work-site assignment needed |
| DOC | Employee documents upload/list/delete | — | **NOT WRITTEN** | NOT RUN | |
| SET | Branding, tenant profile, users/roles, customization | — | **NOT WRITTEN** | NOT RUN | |
| ISO | Cross-tenant isolation (second tenant) | — | **NOT WRITTEN** | NOT RUN | needs second tenant fixture |
| A11Y | axe sweep + keyboard | — | **NOT WRITTEN** (`@axe-core/playwright` already a dependency) | NOT RUN | |
| RESP | Mobile/tablet layouts | SMK `@responsive` tag only | partial | NOT RUN | projects `mobile`,`tablet` exist |
| XB | Firefox/WebKit | SMK `@xbrowser` tag | partial | NOT RUN | browsers not yet installed |
| PERF | Load/API latency | — | **NOT WRITTEN** | NOT RUN | thresholds below need approval |
| VIS | Visual regression baselines | — | **NOT WRITTEN** | NOT RUN | |

## Provisional performance thresholds (need owner approval — OBS-006)

No documented web targets were found. Proposed, for **local `next dev`** only (not production proof): list/detail page
interactive ≤ 3 s warm; API p95 for list endpoints ≤ 500 ms at 10 concurrent; no request > 2 s; no layout shift > 0.1.
Observed so far: `POST /api/auth/logout` 2.3–3.9 s locally (worth a profile; see OBS in [[DECISIONS-AND-OBSERVATIONS]]).

## Command-bar / subgrid verification list (to execute under EMP/LV/ATT)

Employees list: New · Data Transfer · view selector · column sort/filter · quick filter · rows-per-page · pagination · row select.
Leaves: New · Refresh · Data Transfer · sort/filter. Attendance: Check In · New · Correction Request · Refresh · Data Transfer.
Claims: New claim · Refresh · Data Transfer. (Controls observed via `explore.mjs`; behaviours **not yet exercised**.)
