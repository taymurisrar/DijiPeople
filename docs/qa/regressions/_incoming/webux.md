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
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-338 — ARIA that described a listbox nobody had built

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `apps/web` metadata form runtime, shared form controls |
| **Bug record** | BUG-1956 |
| **Root cause** | `form-control.tsx` has two composite controls, `LookupField` and `SelectField`, and both announced `role="combobox"`, `aria-haspopup="listbox"` and `aria-controls` over a popup that was a plain `div` of `button` elements. The buttons are the root of it: they are why there was no `role="option"`, no `aria-selected` and no `aria-activedescendant` — the popup was navigated with Tab, so there was no "active" option to name — and they are also a `nested-interactive` violation, every option being a focusable child of a widget role. `SelectField` had *already* been given `role="listbox"` on its popup, which made it worse rather than better: a listbox that owns buttons. `aria-controls` was set unconditionally to a portalled id that does not exist while the control is closed. |
| **Regression test** | `apps/web/lib/a11y/listbox-navigation.spec.ts`, `apps/web/app/components/ui/lookup-listbox-semantics.spec.ts` |
| **Scenario** | Movement is a pure function: arrows wrap, Home and End jump, a non-movement key yields nothing, an empty list yields no index, and `aria-activedescendant` resolves to `undefined` rather than to an id naming no element. Over the source: as many listboxes as comboboxes, an option role and a selected state for each, no `type="button"` inside a listbox, no link inside a combobox trigger, and no unconditional `aria-controls`. |
| **Proven to fail without the fix** | Mutation-tested: restoring `aria-controls={listboxId}` fails the dangling-reference assertion; turning the options back into `button` elements fails both the option-role count and the no-button-inside-a-listbox assertion. |
| **Note** | **The correspondence is what is asserted, not either half.** Counting `role="listbox"` alone would have passed against the live defect, because `SelectField` already had one over a list of buttons — attributes written for a thing that was not built is the whole shape of this record, and a guard that counts attributes repeats it. The second control is the finding worth carrying: the record named the lookup, and a fix aimed only there would have left `SelectField` with a *differently* broken version of the same pattern on every module. Two smaller decisions. `role="listbox"` went on the options container rather than on the popup, because the popup also holds the search input and a Clear button and a listbox may not own them. And the movement lives in `lib/a11y/listbox-navigation.ts` shared by both controls, because two implementations of arrow-key movement diverge in exactly the way that produced this record. Also fixed while here, unreported: the link to the selected record sat inside the combobox — a second `nested-interactive` on the same control, and a Tab stop inside the thing the user was trying to open. **Not verified in a browser:** the assertions are over the source, and the `document.querySelectorAll('[role=listbox]')` check in the record's Acceptance Criteria still wants a live run. |
| **Note** | The value here is the mapping from utility-class selector to component, which the audit could not give and which cost most of the time: the spec pins each violation to where it was found so nobody re-derives it. **Two of the four were in `data-table.tsx`**, which every runtime list in the tenant product renders — so this was never one screen's problem, and the record's instruction to audit more than one page is answered from the source rather than by a second audit. The contrast failure is the one worth carrying: it was not a badly chosen pair of values but a colour on a tint of *itself*, which no amount of tenant theming can rescue, so the fix had to change which token is used rather than what it resolves to. And `role="button"` on the row was added *by an accessibility fix* — the keyboard access it came with is what BUG-0043 was actually about, and it survives; the role added nothing a screen reader could use. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-339 — A singular derived by deleting a letter, and a title never derived at all

| | |
|---|---|
| **Bug class** | `naive-string-derivation` |
| **Module** | `apps/web` settings runtime, `apps/web` runtime related lists |
| **Bug record** | BUG-1964 |
| **Root cause** | The settings adapter registry derived every record header's singular from its plural with `input.label.replace(/s$/, "")`, so "Leave Policies" produced "Leave Policie". The related-list quick-create dialog titles (`buildGenericQuickCreate`, `buildSubgridQuickCreate` in `module-related-subgrid.tsx`) applied no derivation at all, printing the tab's plural title verbatim — "New Entitlements", "New Assignments". Two mechanisms, one wrong and one absent, free to disagree about the same entity on the same screen. |
| **Regression test** | `apps/web/lib/text/inflection.spec.ts`, `apps/web/lib/text/label-call-sites.spec.ts` |
| **Scenario** | `singularize()` handles irregular plurals, `-ies`/`-es` endings and words already singular that a trailing-`s` strip would mangle ("Status", "Address"), and returns an unrecognised word unchanged. Over the source: the settings registry no longer contains the `replace(/s$/, "")` literal and does contain `singularize(input.label)`, with a declared `input.singular` still taking priority; the related-subgrid dialog titles read `New ${singularize(...)}` at both call sites, not the raw label. |
| **Proven to fail without the fix** | Mutation-tested. Reverting `settings-adapter-registry.ts:432` to `input.singular ?? input.label.replace(/s$/, "")` fails 2 of 6 assertions in `label-call-sites.spec.ts` (the literal-absence and `singularize`-call assertions); reverted immediately after confirming. |
| **Note** | The helper alone does not prove the fix — a correct `singularize()` sitting unused would have left "LEAVE POLICIE" on screen. `label-call-sites.spec.ts` asserts over the call sites' source text specifically so a correct-but-uncalled helper cannot pass. A declared `singular` (dozens of settings modules already have one, e.g. "Compensation Package", "Field Security Policy") always wins over the derived form; `singularize` is only the floor under labels nobody hand-labelled, which is why "Leave Policies" — undeclared — now resolves through derivation to "Leave Policy". Not verified live against a running tenant; verified from source and by the specs above, which was sufficient to reproduce and disprove the exact reported strings ("LEAVE POLICIE", "New Entitlements", "New Assignments") as pure-logic assertions. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

### REG-340 — One surface that stayed silent, and one that was never silent at all

| | |
|---|---|
| **Bug class** | `missing-success-feedback` |
| **Module** | `apps/web` attendance, `apps/web` settings branding |
| **Bug record** | BUG-2006 |
| **Root cause** | The manual attendance create form (`manual-attendance-form.tsx`) already reset itself on a 201 (`setForm(initialForm)`) but reported nothing — no toast, no inline confirmation — so the next feedback the user got was the 409 from pressing Save a second time. The branding settings form, by contrast, already called `setToast({ title: "Branding updated", …, variant: "success" })` on its own 2xx branch (`branding-settings-form.tsx:315-321`, present since `ee10f739`, unrelated to this session) — the record's premise that it stayed silent no longer held by the time this task investigated it. The two surfaces do not share a submit handler — one is a bespoke attendance form, the other a bespoke settings form — so there was never a single layer where fixing one would fix both, contrary to the record's Proposed Resolution. |
| **Regression test** | `apps/web/app/(authenticated)/attendance/_components/manual-attendance-form.spec.ts` |
| **Scenario** | Source-level, because `apps/web` has no jsdom: the attendance form imports and calls the shared `useSideToast()` hook, calls `notifySuccess(...)` on the 201 branch strictly before `setForm(initialForm)` in the same branch, and renders the returned `{toast}` element. No assertion was written for branding, because no code there changed. |
| **Proven to fail without the fix** | Mutation-tested: removing the `notifySuccess(...)` call from the attendance form's success branch fails the "calls notifySuccess on the 201 branch" assertion; reverted immediately after confirming. |
| **Note** | Verify-before-fix mattered here: treating this as one defect and patching a shared layer that does not exist would have either missed the attendance form or duplicated logic already present on branding. The fix reuses `useSideToast`/`SideToast` (already used by `leave-request-action-buttons.tsx`) rather than adding a second toast mechanism, which is the closest available thing to "one mechanism" for two call sites that were never one component. Not verified in a browser — the assertions are over the source, matching the precedent this app already uses (`label-call-sites.spec.ts`) for surfaces jsdom cannot reach. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

### REG-341 — Three places a value's label was never declared, one helper for the floor under all three

| | |
|---|---|
| **Bug class** | `raw-token-reaches-user` |
| **Module** | `apps/web` settings branding, `apps/web` runtime, `apps/web` dashboard |
| **Bug record** | BUG-2009 |
| **Root cause** | Three independent label-resolution paths each had a gap that fell through to the raw stored token. `branding-settings-form.tsx`'s `COLOR_FIELD_LABELS`/`TEXT_FIELD_LABELS` maps were missing entries for six of sixteen colour tokens and four of thirteen text fields, falling back to the bare key (`mutedTextColor`, `supportEmail`, …). `runtime-value-formatter.ts`'s `formatRuntimeFieldValue` printed the raw stored value for an optionset field with no matching declared option, and for any field with no metadata at all — the shape a generic related list frequently has. `dashboard-widget-renderer.tsx`'s `formatValue` printed a raw enum constant (`DRAFT`, `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED`) verbatim. None of the three shared a lookup; they shared only the symptom. |
| **Regression test** | `apps/web/app/(authenticated)/settings/branding/_components/branding-field-labels.spec.ts`, `apps/web/lib/runtime/runtime-value-formatter.spec.ts`, `apps/web/app/components/dashboard/dashboard-widget-formatting.spec.ts` |
| **Scenario** | Branding: every key in `BRANDING_COLOR_KEYS`/`BRANDING_TEXT_KEYS` — not just the ten reported — resolves to a label that is never equal to the key itself, plus the ten reported labels by exact value, plus a hypothetical undeclared key to prove the fallback humanises rather than repeats. Runtime formatter: a declared optionset label wins; an undeclared optionset value and a field with no metadata at all both humanise; ordinary prose passes through unchanged. Dashboard: an enum constant humanises, an entity display name does not. |
| **Proven to fail without the fix** | Mutation-tested, three separate mutations, one per surface. Branding: reverting `resolveColorFieldLabel` to `COLOR_FIELD_LABELS[key] ?? key` fails the undeclared-key assertion. Runtime formatter: reverting the optionset fallback to `declaredLabel ?? rawValue` fails the no-matching-option assertion; reverting the final fallback to `String(value)` fails the no-metadata assertion. Dashboard: covered under REG-342 (same function, same file). Each reverted immediately after confirming. |
| **Note** | The completeness assertion in the branding spec is the part of this record's Proposed Resolution worth more than the three fixes: it walks every declared key rather than the ten the QA run happened to observe, so a seventeenth colour token added later without a label fails the test instead of shipping unlabelled — which is exactly what happened here, since the schema had already grown from twelve tokens to sixteen (`successColor`, `warningColor`, `dangerColor`, `infoColor`) between the record being filed and this fix, none of which the record could have named. Not verified in a browser; the specs are over pure logic, which is what this app's jest can reach. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

### REG-342 — A recognised timestamp, formatted for the wrong tenant

| | |
|---|---|
| **Bug class** | `unenforced-formatting-convention` |
| **Module** | `apps/web` dashboard |
| **Bug record** | BUG-2010 |
| **Root cause** | `dashboard-widget-renderer.tsx`'s `formatValue` already recognised an ISO-8601 timestamp and formatted it, but with `Date.prototype.toLocaleString(undefined, {...})` — the visiting browser's own locale and local timezone, not the tenant's configured `dateFormat`/`timeFormat`/`timezone`. This is the direct violation of the AGENTS.md rule this record's own Evidence section cites ("never call `toLocaleDateString` ad hoc"), on the one widget that had partially tried to handle it and gotten the source of truth wrong. |
| **Regression test** | `apps/web/app/components/dashboard/dashboard-widget-formatting.spec.ts` |
| **Scenario** | With `setDefaultFormattingContext` set to one tenant configuration (`MM/dd/yyyy`, 12h, UTC), a timestamp formats to that shape and contains no raw `T`. With a *different* configuration (`dd/MM/yyyy`, 24h) over the *same* input, the result changes accordingly — proving the fix reads configuration rather than coincidentally matching one tenant's format. A date-only ISO string formats through the same helper. |
| **Proven to fail without the fix** | Mutation-tested: reverting the timestamp branch to `parsed.toLocaleString(undefined, {...})` fails both configuration-format assertions; reverted immediately after confirming. |
| **Note** | `formatDateTime`/`formatDate` are called with no explicit context argument — both fall back to the module-level `runtimeDefaultContext` that `resolved-settings-provider.tsx` installs for the whole authenticated shell from the tenant's resolved settings, so no prop needed threading through the widget renderer to reach it. The truncation this record's Acceptance Criteria also named was a symptom of the 39-character raw-looking string, not a separate defect — a formatted date is short enough on its own. Shares a commit and a file with REG-341 (BUG-2009 surface 3, the same function's enum-humanisation branch, found while investigating this record). Not verified in a browser. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

### REG-343 — A cell that already had a link and a label, neither ever read

| | |
|---|---|
| **Bug class** | `unwired-existing-data` |
| **Module** | `apps/web` inbox |
| **Bug record** | BUG-2017 |
| **Root cause** | The inbox's "Related record" column rendered `row.relatedRecordNumber ?? row.relatedEntityId ?? "No record"` as plain text — no link at all, and a bare UUID whenever the denormalised number was absent. `InboxNotification` already carried `targetUrl` (the direct navigation target, already used by `notification-bell.tsx` and `notification-popup-provider.tsx` for exactly this purpose) and `relatedRecordNumber` (the denormalised human label the bug record's own Proposed Resolution asked for); neither was read by this one cell. |
| **Regression test** | `apps/web/app/components/inbox/inbox-related-record-cell.spec.ts` |
| **Scenario** | A bare UUID with nothing else set never appears as the cell's content. `targetUrl` + `relatedRecordNumber` renders a link whose `href` and visible text match exactly. `targetUrl` with no record number falls back to the humanised entity type ("leave-request" → "Leave Request"). No `targetUrl` renders plain text, not a link. Nothing at all renders the literal "No record". |
| **Proven to fail without the fix** | Mutation-tested: reverting `relatedRecordCell` to the pre-fix expression (`row.relatedRecordNumber ?? row.relatedEntityId ?? "No record"`) fails 4 of 5 assertions — every case that exercised the link, the entity-type fallback, or the plain-text-without-a-link path. Reverted immediately after confirming. |
| **Note** | No API or notification-payload change was needed. Both fields the fix depends on already existed on the type, were already populated by the API, and were already trusted for the identical purpose elsewhere in this app — the defect was one cell in one component never reading them, not a missing capability. The one case this fix cannot close without an API change — an id with no target and no label at all — no longer shows the id either: it reads "Related record" as inert text rather than a UUID or a guessed link. Not verified in a browser; no flow in the ITEM-0034 E2E suite opens `/inbox`. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

### REG-344 — A rail with no width, and a nav row that could not wrap

| | |
|---|---|
| **Bug class** | `unconstrained-responsive-width` |
| **Module** | `apps/web` authenticated shell, `apps/web` payroll |
| **Bug record** | BUG-1668 |
| **Root cause** | Two of the record's three separated causes. `dashboard-sidebar.tsx`'s `<aside>` had no width class at all below `xl` (only `xl:w-[76px]`/`xl:w-[280px]`), so its width came from unwrapped nav-item label text — measured at 217px on a populated tenant, 56% of a 390px screen, with the collapse control that would let a user shrink it `hidden ... xl:block` and unreachable at that width. `payroll-nav.tsx`'s outer `<nav>` already had `flex-wrap`, but each link group's own row (`flex items-center gap-1`, no wrap) did not, so a whole group wrapping onto its own line did not help once that group's six-item row was still wider than the viewport by itself. The third cause the record names, the `/employees` resize handle, was traced and found not to reproduce: the handle is `absolute` inside a `relative <th>` inside an `overflow-x-auto` wrapper, the same containment the record's own 1440px measurement already certified as correct — no code changed there. |
| **Regression test** | `apps/web/app/(authenticated)/_components/workspace-mobile-overflow.spec.ts` |
| **Scenario** | Source-level, no jsdom and no browser available to this task. The `<aside>` carries `w-16` and `shrink-0`; the nav-item label is `sr-only ... xl:not-sr-only` rather than conditionally unrendered; the full-label desktop width classes (`xl:w-[76px]`/`xl:w-[280px]`) are unchanged; the compact brand card no longer references the `h-10 w-10` logo size that does not fit a 64px rail. The payroll nav group row no longer matches the pre-fix non-wrapping class string and now contains `flex-wrap`. The shared data table's resize handle is still `relative`-contained inside `overflow-x-auto` (a verification, not a fix — no mutation test applies to unchanged code). |
| **Proven to fail without the fix** | Mutation-tested, three separate mutations, each reverted immediately after confirming. Reverting the `<aside>`'s width classes fails the width/shrink assertion. Reverting the label span to plain `min-w-0 flex-1` (no `sr-only`) fails the visibility assertion. Reverting the payroll nav group's className to the pre-fix non-wrapping string fails both the negative and positive assertions in that group's test. |
| **Note** | Comments had to be stripped from the source before matching (`label-call-sites.spec.ts`'s established pattern in this app) — the fix's own explanatory comments quote the classes they introduce, which made an early version of this test pass vacuously against the reverted code because the comment alone satisfied `.toContain`. **Deliberately not a drawer pattern.** The record's own 2026-08-29 recommendation named a drawer (hamburger trigger, overlay, focus trap) as the right shape and sized it `PLAN_REQUIRED` — real shell work with consequences for every route. Building that without a browser to verify focus handling, animation, or that the trigger is reachable was judged the wrong trade; the fix instead gives the existing icon-only rail (the same width the desktop *collapsed* state already used) a floor so content cannot push it past the viewport, which resolves the overflow without inventing new interactive surface. Not verified in a browser: the record's own `e2e/tests/flow-j-tenant-settings.spec.ts` `test.fixme('J — settings does not scroll sideways on a phone')` was deliberately left `fixme` rather than un-fixmed on source-reading alone. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |
