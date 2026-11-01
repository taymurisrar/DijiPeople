# DP-QA-006 — `/my-profile` logs a React warning: empty string passed to an attribute

| Field | Value |
|---|---|
| Category | Functional (console hygiene) |
| Severity / Priority | Low / **P3** |
| Status | Open |
| Route | `/profile` → `/my-profile` as `employee` |
| Evidence | console capture by `explore.mjs EMPLOYEE /profile`: *"An empty string ("") was passed to the %s attribute… pass null instead"* (React 19 — typically `<img src="">`) |

Cosmetic but fires on every visit and an empty `src` can trigger a duplicate page request in some browsers.
**SUSPECTED:** avatar/logo `src=""` when no image is set. Screenshot not meaningful (no visible defect); trace via DevTools.

| Run | Result |
|---|---|
| RUN-001 | OBSERVED |
| RUN-005 (f47e504c) | **OPEN** - Not reproduced: zero console warnings/errors on employee My Profile via MCP (level warning) and in every UI test (diag fixture fails on console errors). Cannot be Resolved without a located cause; remains P3 Not Reproduced |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - located by the developer (`AccessDeniedState` rendered `<button href="">`); verified by QA with DevTools on the production build: "Back to dashboard" on `/access-denied` is `<a href="/">`, navigates to the dashboard, console clean on `/my-profile` and `/access-denied` (`RUN006-MCP-employee-access-denied.png`) |
