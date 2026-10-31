# DP-QA-004 — `/employees/import` fails: "Validation failed (uuid is expected)"

| Field | Value |
|---|---|
| Category | Functional |
| Severity / Priority | Medium / **P2** (bulk import entry point; workaround: *Data Transfer* on the list — **not yet verified**) |
| Status | Open |
| Route | `/employees/import` (link exists in the app: found via sidebar/dashboard link crawl) |
| Role | Tenant admin |
| Test | `DPQA-SMK-004` |
| Evidence | ![import](../evidence/DP-QA-004-employees-import-error.png) |

## Actual
Page title "Import" with a red panel "We could not load the employee module. Validation failed (uuid is expected)". Server
log: `ApiRequestError: Validation failed (uuid is expected)` raised from `EmployeeDetailPage`.

## Analysis
- **SUSPECTED:** the path segment `import` is captured by the dynamic `/employees/[id]` route, which passes the literal
  string `import` to `GET /employees/:id` (`ParseUUIDPipe` → 400). The same family as BUG-2461 (`me/…` shadowed by `:employeeId`),
  here on the web route tree. There is no `employees/import` page file in `apps/web/app/(authenticated)/employees/`.
- **Needs verification:** which UI element links to `/employees/import`, and whether *Data Transfer* on `/employees` is the
  intended replacement (then the link is stale).

## Retest history
| Run | Result |
|---|---|
| RUN-001 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - Import is Growth-gated by contract: SMK-004 passes on Chromium/Firefox/mobile/tablet (clean redirect to the Data Management plan gate); CMD-022 asserts Import absent from Data Transfer; GRW-001..004 backend 403 on Starter; GRW-010..013 entitled access on the Growth tenant (`RUN005-MCP-employees-data-transfer-menu-no-import.png`). WebKit SMK-004 fails for the separate DP-QA-023 reason |
