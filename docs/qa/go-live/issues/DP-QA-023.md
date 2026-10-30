# DP-QA-023 — Firefox and WebKit raise uncaught fetch errors on `/settings/access` and the Roles page

| Field | Value |
|---|---|
| Category | Functional / cross-browser |
| Severity / Priority | Low / **P3** |
| Status | Open — reproducible, root cause not proven |
| Tests | `DPQA-SMK-011` (`/settings/access`), `DPQA-SMK-015` (`/settings/security-access/roles` → `/authorization/roles`) |
| Env | **production build** (`next build` + `next start`), Firefox 148-class and WebKit 26.5 engines via Playwright; Chromium, mobile and tablet are clean |

Both engines report an uncaught `pageerror` after the page settles:
- Firefox: `NetworkError when attempting to fetch resource.` (in-flight `/api/...` requests logged as `NS_BINDING_ABORTED` — e.g. `settings/resolved-context`, `auth/activity`, `notifications/in-app/unread-count`).
- WebKit (over local HTTPS): `/api/error-logs/client due to access control checks` + `TypeError: Load failed` — i.e. the client error reporter's own POST fails.

Both routes perform a **client-side redirect** (`/settings/access` → `/settings/security-access`; `/settings/security-access/roles` → `/…/authorization/roles`). **SUSPECTED:** requests started by the first route are aborted by the navigation and their rejection is not caught; Chromium reports aborts differently so the console stays clean. Users see the final page normally (headings assert passes).

| Run | Result |
|---|---|
| RUN-003 | FAIL (Firefox, WebKit) |
