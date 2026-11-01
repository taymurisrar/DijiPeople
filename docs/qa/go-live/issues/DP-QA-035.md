# DP-QA-035 — Employees command bar "Import" does nothing on every plan

| Field | Value |
|---|---|
| Category | Functional / navigation — a regression introduced by the [[DP-QA-004]] fix |
| Severity / Priority | Medium / **P2** |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), tests DPQA-IMX-023 (automated) and Playwright MCP (3 reproductions) |
| Evidence | `RUN006-MCP-starter-command-bar-import.png` (menu closed, URL unchanged), network log shows no navigation request, console clean |

**Reproduction.** Sign in as a Starter owner (tenant A) → Employees → *Data Transfer* → *Import*. The menu closes and nothing else happens: no navigation, no toast, no importer, no console message. Same result on every plan; the Settings route works (below).

**Cause (read from the candidate source).** The handler `system.import` (`lib/runtime/module-adapter-command-handlers.ts`) calls `navigate('/settings/data-management')`. The navigator wired in `module-runtime-command-handler.tsx` only follows hrefs accepted by `isSafeModuleHref(href, runtime.module.routeBase)`, i.e. inside `/employees`. The destination is outside that base, so the call is silently dropped.

**Impact.** A visible command is dead. Basic import is reachable (Settings > Data Management > Import & Export, and `/employees/import` redirects there, see DPQA-SMK-004), so this is a usability defect, not a block — but it is the entry point the owner's requirement 1 names ("through Settings **and command bars**").

**Expected.** Import opens Settings > Data Management.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — IMX-023 fails; reproduced in the browser 3×. Chromium; not browser specific |
