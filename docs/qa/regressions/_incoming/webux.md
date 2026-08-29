# Regression entries — tenant web UX burndown (SESSION-0076)

Written here rather than appended to `docs/qa/regressions/index.md` because
several sessions appending to one file conflict on every line. The coordinating
session merges these into the register.

Reserved id range for this session: REG-334 to REG-348.

Entries are consolidated by **root cause**, not by bug record: several of these
records are the same defect seen on two screens, and one entry per screen would
claim more coverage than exists.

---

### REG-334 — The developer's half of the error contract, read aloud to the customer

| | |
|---|---|
| **Bug class** | `internal-vocabulary-reaches-the-user` |
| **Module** | `apps/web` runtime, error presentation |
| **Bug record** | BUG-1963, BUG-1955 |
| **Root cause** | The API's `HttpExceptionFilter` writes `message` for a developer and `description` for the person at the screen. The client rendered `message`. Two paths made that worse. `standard-module-data.adapter.ts:640` threw an Error whose message was the server message with `(${method} ${path})` appended, and `command-execution.service.ts:101` puts a caught handler's `error.message` straight into the command result — so a failed save read "leavePolicyId must be a UUID (POST /api/leave-policies/assignments)". And `authenticated-shell-provider.tsx` `dispatchApiError` built its message from `responseText`, so any response the client could not parse as the contract — a gateway's HTML error page — was rendered verbatim in a modal. `statusToCode` compounded it by mapping every envelope-less 404 to `DATABASE_RECORD_NOT_FOUND`, and the runtime command handler held a second copy of that table with the same mapping. |
| **Regression test** | `apps/web/lib/api-error.spec.ts` |
| **Scenario** | A validation failure resolves to the contract's `description`, and the resolved message contains neither a DTO property name nor `/api/`. A domain refusal keeps its own message, because that is the useful half. An HTML body at status 404 resolves to a written sentence, keeps the body in `details` for the log, and does not report a database error code — while a 404 the API really sent as `DATABASE_RECORD_NOT_FOUND` still reports one. A `traceId` is present on every path. |
| **Proven to fail without the fix** | Mutation-tested. Restoring the appended method and path fails the two assertions that no resolved message contains `/api/`. Restoring `404 → DATABASE_RECORD_NOT_FOUND` in `statusToCode` fails the code assertion while leaving the envelope case green, which is what that control is for. |
| **Note** | The guard is on `sanitizeUserFacingMessage` and `resolveUserFacingMessage` rather than on the two components, deliberately: the components were only where it was noticed. `sanitize` refuses markup, an over-long string and a trailing method+path **wherever a message is normalised**, so the next component to pass a body through cannot reproduce this. The negative assertions carry the weight — a test looking for the description would pass while the message was *also* shown. Worth carrying: `resolveUserFacingMessage` does **not** blanket-replace `message` with `description`. A domain refusal ("An attendance entry already exists for this employee on this date.") is more use than "The action could not be completed.", so the description wins only for a validation failure or when field reasons are present. Replacing it everywhere would have been a smaller diff and a worse product. BUG-1955 was filed BLOCKED for want of a natural reproduction and still has none; what changed is that the branch is confirmed from the source to be reached by *any* non-JSON error response, so a gateway 502 takes the same path the synthetic probe took. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-335 — A shell that never learned which page it was wrapping

| | |
|---|---|
| **Bug class** | `shared-shell-defect` |
| **Module** | `apps/web` authenticated shell |
| **Bug record** | BUG-1950, BUG-1951 |
| **Root cause** | Two structural defects in one shell. `dashboard-topbar.tsx` declared `pageTitle = "Dashboard"` as a default and `app/(authenticated)/layout.tsx`, its only caller, never passed one — so the single `h1` on all 232 authenticated routes said "Dashboard". And no layout supplied a `main` landmark: 89 pages rendered their own and 143 rendered none, so landmark navigation and skip-to-content did not work on most of the product. |
| **Regression test** | `apps/web/app/components/workspace-shell-headings.spec.ts` |
| **Scenario** | The topbar resolves its heading from `usePathname` through the same `resolveRouteTitle` that names the browser tab, so the heading and the document title cannot disagree; the literal `pageTitle = "Dashboard"` default does not exist; a route may still override. The landmark exists **exactly once**, in the layout, with a skip link pointing at it — and the spec walks every `.tsx` under `app/(authenticated)` plus the two shared components that used to render one, asserting none of them does. |
| **Proven to fail without the fix** | Mutation-tested. Restoring the `"Dashboard"` default fails the heading block; adding `main` back to `role-dashboard-page.tsx` fails the walk; removing it from the layout fails the count. |
| **Note** | Aimed at the shell rather than at any page, because a per-page assertion goes stale the moment someone adds the 233rd page — the walk is over the directory, so a new page that renders its own landmark fails without anybody updating the test. **Both directions are asserted on purpose:** zero landmarks and two landmarks are the same failure seen from opposite sides, and the obvious fix for BUG-1951 — add one to the layout — creates BUG-1421's defect on the 89 pages that already had one. That ordering is why this was not a one-line change. Also worth carrying: BUG-1673 deliberately kept this `h1` on the stated grounds that it "renders pageTitle rather than a constant, so it is the page's own". That was true of the code and false of the product, because the prop had a constant default and no caller ever set it — a guard reading the source for `pageTitle` would have agreed with it. REG-302 is the browser coverage that *found* both records; this is the guard that stops them returning. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-336 — State drawn as a colour, and six links with one name

| | |
|---|---|
| **Bug class** | `visible-but-not-accessible` |
| **Module** | `apps/web` dashboard, `dashboard` |
| **Bug record** | BUG-2148, BUG-2149 |
| **Root cause** | `dashboard-widget-renderer.tsx` held two renderings of one idea. `SeverityDot` was `aria-hidden` with a background colour class as its entire output, so a widget's state reached sighted users as hue and everyone else not at all — while `SeverityPill`, in the same file, already rendered the same `DashboardSeverity` union as text. Separately, `dashboard.service.ts:2598` builds every metric card's action with the constant label `Open`, so six cards on the overview offered six links with identical accessible names. |
| **Regression test** | `apps/web/app/components/dashboard/dashboard-widget-accessibility.spec.ts` |
| **Scenario** | The dot is not `aria-hidden`, carries `role="img"` and a name derived from the severity, and `SEVERITY_LABELS` is declared exactly once and read by both renderings. Every member of the union has an entry. A metric card's link takes its accessible name from the card's own title, at **every** call site, and the visible text is unchanged. |
| **Proven to fail without the fix** | Mutation-tested: restoring `aria-hidden` on the dot fails two assertions; dropping the title from one of the four call sites fails the call-site count while leaving the name assertion green, which is what that assertion is there for. |
| **Note** | The one-map assertion matters more than the label. The dot and the pill were two copies of an answer to the same question about the same union, and the dot's copy had already stopped being a copy — it held colour classes where the pill held words, which is how the defect came to exist at all. BUG-2149 was fixed in the renderer rather than in `dashboard.service.ts`, keeping a presentation string out of an API contract three clients read; the visible "Open" stays, because six cards reading "Open" is a deliberate rhythm and the defect was only ever the accessible name. Source-reading rather than rendering: `apps/web` runs jest with no jsdom, which both records anticipated. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-337 — Four axe violations, three of them in shared components

| | |
|---|---|
| **Bug class** | `shared-token-accessibility-regression` |
| **Module** | `apps/web` settings, `apps/web` data table |
| **Bug record** | BUG-1986 |
| **Root cause** | An axe audit of one settings screen returned four critical or serious violations whose selectors were Tailwind utility strings. Three are not settings components. `button-name`, five nodes: the settings runtime nav's category toggle, one per category, whose only child is a lucide chevron and therefore had no name. `color-contrast`: the current-page indicator paired `text-accent` with `bg-accent-soft`, and `--accent-soft` is that same accent mixed 18% into white, so no tenant palette could pass. `aria-allowed-attr` **and** `nested-interactive` on one node: BUG-0043 gave the shared data table's clickable row `role="button"` while making it keyboard reachable — a button may not contain focusable children, and this one contains the selection checkbox and every link its cells render, while `aria-selected` is unsupported on `button` though `row` supports it. |
| **Regression test** | `apps/web/app/(authenticated)/settings/settings-accessibility.spec.ts` |
| **Scenario** | The category toggle has an accessible name and both chevrons are `aria-hidden`. The current-page indicator no longer pairs the accent with a tint of itself, and still carries `aria-current="page"`. A clickable table row has no widget role, keeps `tabIndex` and its key handler, and keeps `aria-selected`. The settings shell does not nest an `aside` inside the one `SettingsLayout` supplies. |
| **Proven to fail without the fix** | Mutation-tested: restoring `role="button"` on the row fails the role assertion; restoring `text-accent` fails the contrast pair. |
| **Note** | The value here is the mapping from utility-class selector to component, which the audit could not give and which cost most of the time: the spec pins each violation to where it was found so nobody re-derives it. **Two of the four were in `data-table.tsx`**, which every runtime list in the tenant product renders — so this was never one screen's problem, and the record's instruction to audit more than one page is answered from the source rather than by a second audit. The contrast failure is the one worth carrying: it was not a badly chosen pair of values but a colour on a tint of *itself*, which no amount of tenant theming can rescue, so the fix had to change which token is used rather than what it resolves to. And `role="button"` on the row was added *by an accessibility fix* — the keyboard access it came with is what BUG-0043 was actually about, and it survives; the role added nothing a screen reader could use. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |
