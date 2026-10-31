# DP-QA-033 — A dead `/documents` link is rendered on the Overview (404 on every prefetch)

| Field | Value |
|---|---|
| Category | Functional (navigation) |
| Severity / Priority | Low / **P3** |
| Status | Open |
| Tests | `DPQA-AUTH-030`, `DPQA-INV-106` fail only on the resulting console error; URL recorded by the new `failed4xx` diagnostics |
| Env | candidate `22a21a14`, production build, roles payroll-manager and employee (tenants S and A) |

Opening the Overview (and `/my-profile`) as a non-admin user triggers a Next.js route prefetch `GET /documents?_rsc=…` that answers **404** and logs `Failed to load resource … 404` on every page view. There is no `/documents` page in `apps/web`; documents live in the employee record's Documents tab. Documents is a Starter feature, so a user-visible link or tile to `/documents` is a dead end if it is clickable.
Fix: point the link at the employee Documents tab, or remove it.

| Run | Result |
|---|---|
| RUN-004 | FAIL (console error in AUTH-030, INV-106) |
| RUN-005 (f47e504c) | **RESOLVED** - NAV-001 pass |
