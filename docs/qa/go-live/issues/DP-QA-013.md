# DP-QA-013 — Colour-contrast failures (WCAG 2 AA) on Overview, Employees, New Employee, Settings and Branding

| Field | Value |
|---|---|
| Category | Accessibility |
| Severity / Priority | Medium / **P2** |
| Status | Open |
| Tests | `DPQA-A11Y-001, 002, 003, 008, 009` (axe-core `color-contrast`, impact *serious*) |
| Env | `qa-prov-a`, owner, Chromium desktop 1440, default theme, 2026-10-30 |

## Actual (CONFIRMED by axe-core 4.13, WCAG 2.0/2.1 A+AA)
| Screen | Nodes failing `color-contrast` |
|---|---|
| `/` Overview | 27 |
| `/employees` | 1 |
| `/employees/new` | 1 |
| `/settings` | 9 |
| `/settings/branding` | 3 |

Other screens (Leave, Attendance, Approvals, Claims, Users) had no serious/critical violations in this run. Per-run node lists are attached to the test as `axe.json`.
Muted helper/label text on white or on the green accent is the likely source; the tenant theme tokens (teal `#0f766e`/`#14b8a6` family) may fail on tinted surfaces. **SUSPECTED**, not traced to a selector.

| Run | Result |
|---|---|
| RUN-002 | FAIL (5 screens) |
| RUN-005 (f47e504c) | **RESOLVED** - A11Y-001/003/006/008/009 pass on tenants using the new default accent (note: tenants with a STORED brand colour keep it - gate) |
