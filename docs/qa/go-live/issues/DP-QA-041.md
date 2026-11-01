# DP-QA-041 — Settings sub-pages are unusable at phone width: the content column is 0 px wide and off-screen

| Field | Value |
|---|---|
| Category | Responsive layout |
| Severity / Priority | Medium / **P2** (the settings pages, including the Import & Export page the owner just made available on every plan, cannot be used on a phone) |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), test DPQA-SMK-004 on the `mobile` project (Pixel 7, 412 px); 1 of 22 mobile tests failed; tablet passes |
| Evidence | `RUN006-MCP-starter-data-management-mobile.png` (settings navigation fills the screen, horizontal scrollbar), layout probe `golive/tools/mobile-layout-probe.cjs` |

**Measured** (Pixel 7 profile, demo-tenant admin, production build):

| Page | `innerWidth` after load | `h2` of the page content |
|---|---|---|
| `/settings/data-management` | 653 (should stay 412) | "Import & Export" x = 455, **width 0** |
| `/settings/branding` | 822 | "Branding" x = 455, **width 0** |
| `/settings/access`, `/settings/security-access/roles` | 623 / 658 | content column not present in the probe's `h2` list |
| `/employees` | 412 | fits |

The settings shell renders the "Configuration" navigation card first and the page content in a column that collapses to zero width at x = 455, so the layout viewport grows to 623–822 px (the browser zooms out) and the page scrolls horizontally. Playwright therefore reports the "Import & Export" heading as not visible (`isVisible: false`, box `{x:455, width:0, height:96}`), although it is in the DOM and the accessibility tree.

**Impact.** On a phone the user sees the settings menu and has to scroll sideways to a zero-width column. The import/export page and Branding are confirmed affected (zero-width content column); two further sub-pages probed did not expose a content heading at all and were not investigated further, so the full extent across Settings is unmeasured. Desktop and tablet are fine. The `/settings` index page passes the existing no-overflow check (DPQA-RESP-006), so the existing responsive coverage missed the sub-pages.

**Not claimed.** This was not measured on `f47e504c`, so whether it is a regression of this candidate is unknown.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — SMK-004 fails on `mobile`; passes on chromium, firefox, webkit, tablet |
