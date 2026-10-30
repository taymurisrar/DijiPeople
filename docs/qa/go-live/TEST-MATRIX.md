# Test matrix — Starter plan, tenant web

Part of [[README]]. Scope: [[STARTER-SCOPE]]. Specs: `e2e/golive/tests/` (IDs permanent: `[DPQA-<SUITE>-<nnn>]` in the title).
Status = latest run **[[RUN-003-2026-10-30]]** (per-test rows there; history in [[INDEX]]). Every row is Passed / Failed / Blocked / Not Run with a reason; nothing is "Not Verified" any more.
Environment: **production-mode build** (`next build --webpack` + `next start`) against API :4098, throwaway DB, enforcement `ENFORCE`; tenants **S** (seed-demo), **A**, **B** (provisioned through the real workflow).
Browsers: Chromium (full), Firefox (http), WebKit (https via local TLS front — WebKit refuses Secure cookies on http), mobile Pixel 7, tablet iPad.

## Suite status (RUN-003)

| Suite | Starter feature | Covers | Pass | Fail | Blocked | Issues |
|---|---|---|---|---|---|---|
| SMK | all | 16 routes × 5 engines render clean | 72 | 9 | 0 | SMK-004 → [[DP-QA-004]]; SMK-011/015 (Firefox, WebKit) → [[DP-QA-023]] |
| AUTH | auth | login failure, empty submit, unauth redirect, API 401/forged, employee boundary, logout | 11 | 0 | 0 | |
| SESS | auth | logout invalidates token, tampered token, wrong client, cookie loss, garbled cookie | 5 | 0 | 0 | |
| PWD | auth | no enumeration, invalid token/weak password, full reset | 2 | 0 | 1 | PWD-003 **Blocked(environment)**: reset link needs a mailbox (gate B6) |
| INV | employees/auth | invitation → single-use activation → login; bogus token | 2 | 0 | 0 | |
| ENT | plan | nav, API 403, direct URL, features endpoint, self-enable bypass, gate screen, 4 ungated features | 10 | 11 | 0 | ENT-1001/2/3/5 → [[DP-QA-001]]; ENT-1004 → [[DP-QA-003]]; ENT-060…065 → [[DP-QA-010]] |
| ISO | all | two provisioned tenants: lists, id read/update/delete, mass-assign, login, cookie scope | 12 | 0 | 0 | note [[DP-QA-008]] |
| RBAC | roles | self-context ×4 roles, manager/employee refusals, OWN scope | 9 | 5 | 0 | RBAC-1-* → [[DP-QA-002]]; RBAC-2-MANAGER-03 → [[DP-QA-009]] |
| EMP | employees | list, validation, create via UI + persisted fields, duplicate email, boundaries, edit + reload, tabs, sort/filter | 7 | 2 | 0 | EMP-007 → [[DP-QA-015]]; EMP-008 → [[DP-QA-014]] |
| DT | employees | export, tenant-clean export, template, import rejects, role refusal | 5 | 0 | 0 | |
| ORG | organization | designation / department / team CRUD, duplicates, validation, isolation, role refusal | 5 | 0 | 0 | |
| LV | leave | types, submit, invalid, overlap, self-approve, approve, reject, double-approve, cancel, balance, isolation, UI | 13 | 4 | 1 | LV-001/008 → [[DP-QA-011]]; LV-010 → [[DP-QA-016]]; LV-026 → [[DP-QA-018]]; LV-023 asserts refusal → [[DP-QA-019]]; LV-029 **Blocked** by [[DP-QA-002]]/[[DP-QA-011]] |
| ATT | attendance | manual entry, duplicate day, validation, role, self check-in refusal, isolation, correction create/cancel/read, UI commands | 9 | 1 | 0 | ATT-009 → [[DP-QA-022]]; real check-in on a working day **Not Run (clock)** — see below |
| DOC | documents | upload, type allowlist, size, traversal, round trip, isolation, unauth, delete | 10 | 0 | 0 | |
| SET | settings/branding | features bypass, validation, branding upload, settings UI | 9 | 1 | 0 | SET-003 → [[DP-QA-012]] |
| NOT | notifications | inbox, unread count, isolation, bell UI | 3 | 0 | 0 | email delivery **Not Run** (SMTP intentionally empty; gate B6) |
| CONC | cross-cutting | 5× duplicate employee create, concurrent edits, 3× overlapping leave | 2 | 1 | 0 | CONC-003 → [[DP-QA-020]] |
| CMD | all | command visibility/enablement by role | 8 | 1 | 0 | CMD-011 → [[DP-QA-021]] |
| VIS | all | 8 screenshot baselines (Chromium, masked data) | 8 | 0 | 0 | baselines created in this run; first diff-based verdict comes with RUN-004 |
| A11Y | all | axe WCAG 2.1 A/AA ×10 screens, keyboard, labels, dialog | 8 | 5 | 0 | contrast → [[DP-QA-013]] |
| RESP | all | overflow at mobile/tablet/desktop | 20 | 1 | 0 | RESP-001 mobile → [[DP-QA-017]] |
| PERF | all | warm loads, API outliers, 25-way concurrent reads | 4 | 1 | 0 | PERF-003 → [[DP-QA-024]] (429 under shared-token load; cooldown added) |

## The six RUN-001 failures, mapped (all still Open, application untouched)
SMK-004 → [[DP-QA-004]] · ENT-1001/1002/1003/1005 → [[DP-QA-001]] · ENT-1004 → [[DP-QA-003]].

## Previously "Not Verified" — now resolved
| Test | Outcome | How |
|---|---|---|
| EMP-003 create via UI | **Passed** (also asserts the Work Email persists) | combobox opened with retry; verification moved off the page-local quick filter |
| EMP-004 duplicate email | **Passed** — refused 409, also case-insensitively | depended on EMP-003 |
| EMP-006 edit persists | **Passed** | wait for edit mode (Save visible) + cooldown from the 600/min read limit |
| ATT-008 correction create/cancel | **Passed** | cancel DTO takes `comment`, not `reason`; state read as admin because the employee cannot (DP-QA-022) |

## Production-build performance (local machine; still not production assurance)
Warm page loads: Employees 2.7 s, Leave 2.4 s, Overview 1.9 s, Attendance 1.9 s (dev server: 7–11 s). 25 concurrent distinct reads: worst 1.3 s, none failed. Both are **inside** the proposed thresholds (page ≤ 3 s, request ≤ 2 s) — thresholds still need owner approval (OBS-006). Logout remains the slow outlier ([[DP-QA-007]], re-measure).

## Explicitly Blocked or Not Run (with reason)
| Scenario | Status | Reason / unblock |
|---|---|---|
| Real self check-in/out on a working day | **Not Run — clock** | the QA machine date is a scheduled off day (Fri/Sat); server time cannot be faked. Rerun Sun–Thu; the refusal path and its reason text pass (ATT-006) |
| Manager/HR-driven leave approval chain | **Blocked** by DP-QA-002 / DP-QA-011 | non-admin roles cannot reach self-service |
| Leave balance accrual with a policy | **Not Run** | no accrual engine (memory) — only the "no entitlement ⇒ refused" rule is tested (LV-024) |
| Password reset by email | **Blocked(environment)** | no mailbox |
| Notification email delivery | **Not Run** | SMTP deliberately empty |
| Playwright MCP interactive pass | **Blocked(environment)** | see DEC-007 / DEC-010 |
| Visual regression diff verdicts | baselines only | first comparison happens in RUN-004 |
| Valid bulk import (xlsx/CSV with all required columns) | **Not Run** | template parsing needs a spreadsheet library in the QA tree; rejection paths are covered |
| Org: locations CRUD, business-unit CRUD, holiday calendars; branding visual in login/emails | **Not Run** | next batch |
