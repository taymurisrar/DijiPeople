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
