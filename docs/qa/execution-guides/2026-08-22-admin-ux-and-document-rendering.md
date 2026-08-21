# Execution Guide — Platform Admin UX, document rendering and tenant recovery

> **Written:** 2026-08-22 · **Against:** `agent/document-render-and-theme`
> **Covers:** BUG-0350–0353, BUG-0418–0422 and the three rounds of UX work that
> preceded them.
> **Status when written:** none of it has been opened in a browser.

Everything in this guide exists because the automated coverage cannot reach it.
`apps/admin` jest runs in a node environment with no jsdom and
`apps/landing`'s does the same, so **no component in either app has ever been
rendered in a test** ([[ITEM-0001]]). The specs written alongside these fixes
assert decisions — arithmetic, formatting rules, structural properties of the
source. They do not assert a paint, a scroll, a contrast ratio or a toggle.

That gap is not theoretical. Every defect this guide covers was invisible to
every test that existed and visible in the first screenshot of the screen.

---

## How to read a step

Each step has an id (`A3`, `D7`), an action, and an expected result. Record one
of four verdicts:

| Verdict | Means |
|---|---|
| `PASS` | Observed, and it matched. |
| `FAIL` | Observed, and it did not. Open a BUG record citing the step id. |
| `BLOCKED` | The precondition could not be met. **Not a pass.** |
| `N/A` | The step does not apply to this environment, with a reason. |

Where a step says *observe the first paint*, that means the frame immediately
after the interaction. Several of the defects below were correct one frame late,
which reads as a flicker and is a read of the wrong source.

---

## Environment

```bash
# From the repository root, on the branch under test.
npm ci

# The API must be restarted after this, or new endpoints answer 404 —
# which is exactly how BUG-0350 was reported as an unshipped change.
npm run seed:config
npm --workspace api run start:dev      # :4000
npm --workspace admin run dev          # :3002
npm --workspace landing run dev        # :3000
npm --workspace web run dev            # :3001
```

**Preconditions for the whole guide**

- A platform super-admin sign-in for `localhost:3002`.
- At least one customer account with a plan price, and one tenant in each of
  `ACTIVE` and a non-ready provisioning state.
- The seeded `TENANT_PROVISIONING_SERVICE_ORDER` template, refreshed by
  `seed:config` above. Version 1 of a system template is rewritten on every
  seed, deliberately, so namespace changes reach existing installs.
- A machine whose system colour scheme can be changed **without closing the
  browser** (Suite C step C6 needs this).
- A viewport of at least 1440px for the layout suites, plus one pass at 768px
  and one at 375px where the step says so.

**Before you start:** run the automated floor. If any of it is red, stop —
a manual run over a broken build produces findings about the build.

```bash
npm --workspace api   run test -- placeholder-formatting provisioning-operations
npm --workspace admin run test
npm --workspace landing run test
npm run validate:framework
```

---

## Suite A — What a contract document says

Covers BUG-0418, REG-185, QA-CONTRACT-001.

`formattingRule` was declared on nineteen placeholders and read by nothing, so
executed agreements printed raw values. This suite is about the **generated
document**, not the preview — the preview is Suite B.

| # | Step | Expected |
|---|---|---|
| A1 | Open **Templates → DijiPeople Tenant Provisioning & Service Order**. | The template loads with `{{...}}` placeholders visible in the editor. |
| A2 | Read section 2, "Enabled modules", in the editor. | It shows the token `{{tenant.modules}}`, not a value. The editor shows the template, never a rendering. |
| A3 | Press **Preview sample data**. Read section 2. | A bulleted list: Employees, Attendance, Payroll. **Not** `["Employees","Attendance","Payroll"]`. |
| A4 | Read section 4, "Integrations". | A table with **Name / Type / Status** header cells and one row. Not a JSON array. |
| A5 | Read section 6, "Support and service levels". | "Uptime target 99.5%" — with the per-cent sign, and no trailing zeros. |
| A6 | Read section 3, "Implementation". | The go-live date reads as words: "1 October 2026". Never `2026-10-01` and never `10/01/2026`. "Estimated records: 5,000" with a separator. "Data migration required: Yes" — not `true`. |
| A7 | Read the "Customer:" line under the title. | The country appears **once**. Not "Dammam, Saudi Arabia, Saudi Arabia". |
| A8 | Read section 1, "Tenant". | The provisioned/activated timestamps, where shown, read as words with a UTC time — not as an ISO string. |
| A9 | Generate a real agreement from this template against a customer that has an agreed price, and open the generated document. | Every check A3–A8 holds on the **generated** document, not only the preview. Any money value carries the agreement's currency code, e.g. "SAR 1,200.00". |
| A10 | Find a placeholder whose stored value is not interpretable for its type — set a service level to "to be agreed" if you can, or inspect the renderer output for one. | The raw string prints unchanged. **Never** "Invalid Date", "NaN%" or an empty gap. |

### Considerations for Suite A

- **Existing agreements are supposed to be unaffected.** An executed document
  stores its rendered HTML and is immutable; that is a feature of the evidence
  chain, not a miss. Only newly generated documents pick this up. If you check
  an old agreement and see the raw values, that is correct.
- **A9 is the step that matters.** A3–A8 exercise the preview, which now shares
  the renderer — but sharing it is the fix, so verifying only the preview
  verifies the fix by assuming it.
- **A10 is the one people skip.** A formatter that turns an unparseable value
  into "Invalid Date" has replaced the customer's data with a symptom of our
  bug, and nobody downstream can tell what it was meant to say.
- The UUID in section 1 — `Tenant Gulf Horizon (a3f1c7e2-…)` — is **not** in
  scope and is not a finding here. Whether a machine identifier belongs in
  contract prose is a product decision, recorded as such rather than changed
  quietly. Raise it as an ITEM if you disagree; do not fail A8 for it.

---

## Suite B — The template editor

Covers BUG-0419 and BUG-0421, REG-186 and REG-188, QA-PLATFORM-010 and
QA-PLATFORM-012.

| # | Step | Expected |
|---|---|---|
| B1 | Open a contract template. Copy the first paragraph's exact text somewhere. | — |
| B2 | Press **Preview sample data**. **Observe the first paint.** | Sample values are shown immediately. No frame shows the un-substituted document. |
| B3 | Press **Return to editing**. Observe the first paint. | Placeholders are back immediately. No frame shows sample values. |
| B4 | Repeat B2–B3 three times. | Every toggle is correct on its first paint. |
| B5 | While previewing, try to type in the document. | It is read-only. The toolbar is hidden. |
| B6 | Press **Preview sample data**, then **Save** without returning to editing. Reload the page. | The document still contains `{{...}}`. It contains **no** sample value — no "Gulf Horizon", no "Amal Hassan". This is the destructive case. |
| B7 | Open **Fields & signatures**. | A panel opens on the right of the document, not a dropdown over it. |
| B8 | Scroll the document to the bottom with the panel open. | The panel **stays in view** for the whole scroll. If its own content is taller than the viewport it scrolls internally. |
| B9 | Measure the document sheet's rendered width at ≥1440px viewport. | It renders at its full 816px. It is not squeezed by the panel. |
| B10 | Check the page for a horizontal scrollbar. | There is none. |
| B11 | Insert a field from the panel. | It lands at the caret, and **the panel stays open**. Inserting four fields takes four clicks, not four reopen-and-search cycles. |
| B12 | Set the party to a registry party (Platform, Counterparty), give a caption, choose all five lines, and press **Insert signature box**. | A bordered signature block appears with ruled lines. Signature and Date carry tokens; Title and Company are ruled blanks. |
| B13 | Set the party to **Another party (signs by hand)**, type "Witness" as the party name, leave the caption empty, and insert. | The block is captioned "Witness". **No line carries a `{{...}}` token** — every one is a ruled blank. |
| B14 | Save, reload, and find the signature block. | It survived the save. It is a table. It did not vanish. |
| B15 | Press **Print** and check the signature block in the print preview. | Ruled lines, page-break-safe, roughly 90mm wide. |
| B16 | Narrow the viewport to 768px. | The fields panel stacks **above** the document, not below it. |
| B17 | Close the panel with its × and reopen it from the toolbar. | It closes and reopens; the document reclaims the width while closed. |

### Considerations for Suite B

- **B6 is the whole suite.** The old implementation kept the real template in a
  second state variable and restored it on exit, so the template survived only
  as long as that path ran. A test that toggles and never saves passes against
  the broken version.
- **B8 will silently be a `FAIL` for the wrong reason if you test it inside a
  scrolling container.** Scroll the *page*, not a panel.
- **B13 is a correctness check, not cosmetic.** `signature.*` placeholders are
  configured `LEAVE_TOKEN`, so a token for a party the platform never fills
  prints literally into an executed agreement. A witness block containing
  `{{signature.witness.name}}` is a `FAIL` even though it looks fine in the
  editor.
- **B14 exists because of the sanitiser.** `cleanContractHtml` strips `div` and
  every `data-signature-*` attribute. If a future change makes the block a div,
  it disappears on save with no error anywhere — the author places it, saves,
  and finds it gone.
- B9 and B10 pull against each other. `overflow-x: clip` on the shell is what
  makes B8 possible; if it re-introduces horizontal overflow on some page, that
  is a finding about that page, not a reason to revert the wrapper.

---

## Suite C — The console theme

Covers BUG-0420, REG-187, QA-PLATFORM-011.

| # | Step | Expected |
|---|---|---|
| C1 | Preferences → theme → **Dark**. Open the dashboard. | The page background, every card and every border repaint. No white card on a dark page. |
| C2 | Open a list page with a data table. | Table surface, header row, row borders and pagination bar all repaint. Row text is legible. |
| C3 | Open a record page with tabs and panels. | Panel cards, definition lists and tab chrome repaint. |
| C4 | Open a form with text inputs, selects and a date field. | Inputs have dark backgrounds with legible text and placeholders. The date field is not light-text-on-light. |
| C5 | Compare a heading to the body text under it. | The heading is **brighter**, not darker. An inverted scale that was only shifted leaves headings receding. |
| C6 | Set theme → **System**. Change the machine's theme **without reloading**. | The console repaints immediately. |
| C7 | Set theme → **Light** on a machine set to dark. | The console stays light. |
| C8 | With Dark active, open a contract template and look at the document sheet. | The sheet is **white**, with dark text. Deliberate. |
| C9 | With Dark active, find a status pill (rose / amber / emerald / sky). | It is legible. Its text still states the status in words. |
| C10 | With Dark active, open the notification popover from the bell. | Panel surface, dividers, row text and the footer button repaint. |
| C11 | Repeat C1–C5 at 375px width. | No surface reverts to light at a smaller breakpoint. |

### Considerations for Suite C

- **C6 is the one that regressed invisibly.** Resolving the system preference
  once at load gives a setting that is right at noon and wrong at sunset.
- **C8 is not a bug.** A contract is paper: what a template author sees must be
  what the counterparty receives, and a dark-rendered agreement would be a
  preview of a document that does not exist.
- **C9 is a known limit, stated in advance.** Status pills are not remapped.
  Each pairs a light tint with dark text of the same hue and both halves are
  held, so they should stay legible. If one is not, record it — it is a real
  finding, and the fix is to convert that call site to a token rather than to
  widen the stylesheet's selectors.
- Arbitrary colour values (`bg-[#f8fafc]`) are likewise not covered. Same rule.
- `color-scheme: dark` alone is **not** a pass for any step here. It repaints
  what the browser draws and nothing the application draws — that was the entire
  previous implementation.

---

## Suite D — A tenant that is stuck

Covers BUG-0422, REG-189, QA-TENANT-009. Also answers the question "it is not
provisioned or stuck — what do I do?"

| # | Step | Expected |
|---|---|---|
| D1 | Open a tenant record → **Operations**. | A "Next step" line appears above the Provisioning panel for any non-ready state, saying what to do in one sentence. |
| D2 | Read the **State** field. | It shows a derived state — IN_PROGRESS, AT_RISK, BREACHED, STALLED, MANUAL_ACTION_REQUIRED, FAILED or READY — not the raw `RUNNING`. |
| D3 | Start provisioning a tenant and stop the API process before the run completes. Restart the API. Open Operations immediately. | State IN_PROGRESS. Retry **disabled**, with a reason that says it becomes available if the run stops making progress. |
| D4 | Wait past the stall threshold (30 minutes) and reload. | State **STALLED**. "Next step" says the process that owned the run is gone and to retry. Retry **enabled**. |
| D5 | Press **Retry provisioning**. | The retry runs. Only retryable steps replay; the panel's own note says which are never repeated. |
| D6 | After the retry, check the tenant's workspace hostname, owner, business unit and subscription. | All present. See the consideration below before recording a verdict. |
| D7 | While a genuine run is executing, open the panel. | Retry is disabled, whatever the target clock says. |
| D8 | Open a tenant with no recorded provisioning run at all. | The panel says so plainly, and "Next step" tells you where to look instead. |
| D9 | Open the provisioning queue across tenants. | The same states appear there. A tenant that is STALLED on its record is STALLED in the queue. |

### Considerations for Suite D

- **D6 is where an honest verdict matters most.** [[BUG-0015]] is **open** and
  is not fixed by this work: a tenant that failed at or before the business-unit
  step still cannot be activated, and the retry may report SUCCEEDED anyway.
  This suite verifies that a stuck tenant becomes *recoverable*. It does not
  verify that every recovered tenant is *usable*. If D6 finds a missing business
  unit, that is BUG-0015 observed again — record it against that record, not as
  a new one.
- **D4 needs thirty minutes.** There is no shortcut in the UI. To exercise the
  boundary in both directions without waiting, run
  `npm --workspace api run test -- provisioning-operations`, which asserts it
  from both sides. Record D4 as `BLOCKED` if you skip the wait — not `PASS`.
- **D7 is the safety check.** Allowing retry from STALLED is safe *because*
  replay is idempotent by design. If a future change makes a non-retryable step
  replay, this gate becomes dangerous, and D7 is where that shows up.
- For the specific tenant that prompted this — `43857604-73ee-436f-ab5d-…` —
  open Operations and read D1 and D2. The screen now answers the question. If
  the state is STALLED, press Retry. If it is FAILED, the failed step is named
  and its message is the cause.

---

## Suite E — Notifications

Covers the previous round's popover, which has never been observed.

| # | Step | Expected |
|---|---|---|
| E1 | Sign in and look at the bell. | A count badge only when there is something unread. **No permanent dot.** |
| E2 | Click the bell. | A popover opens with up to six notifications, each showing severity **in words** as well as colour. |
| E3 | Read a row. | Title, two lines of detail, severity, relative time, and "Unread" where it applies. |
| E4 | Click a row that has a destination. | It navigates there and the popover closes. |
| E5 | Find a row with no destination. | It is not rendered as a link and does not look clickable. |
| E6 | Press **Mark all read**. | The count clears in the badge and in the panel, without a reload. |
| E7 | Open `/notifications` in a second tab, then mark all read from the bell in the first. | The second tab's feed updates. |
| E8 | Press **View all notifications**. | It routes to `/notifications` and the popover closes. |
| E9 | Press Escape with the popover open. | It closes and focus returns to the bell. |
| E10 | Click outside the popover. | It closes. |
| E11 | Stop the API and open the popover. | It says notifications could not be loaded. It does **not** show an empty state, which would read as "nothing has happened". |
| E12 | Open the popover at 375px width. | It fits the viewport and does not hang off the right edge. |

### Considerations for Suite E

- **E11 is the interesting one.** The badge deliberately shows nothing on a
  failed request — a dot on a failed fetch is exactly the defect the badge
  replaced. The open panel is the opposite case: somebody is looking straight at
  it, so silence would be a lie.
- **E1 fails if you cannot produce an unread notification.** Cause one: a failed
  provisioning run, a failed billing operation or a webhook failure. Routine
  audit traffic is deliberately excluded and its absence is not a finding.

---

## Suite F — The public site

Covers BUG-0350 and BUG-0351 from the previous round, plus the features page.

| # | Step | Expected |
|---|---|---|
| F1 | Open `/subscribe` and reach the Organization step. | **Country is a `<select>`**, populated, on the first paint. |
| F2 | Stop the API and reload `/subscribe`. | Country is **still a `<select>`**, with a shorter list. It does not become a text box. |
| F3 | Restart the API and reload. | The list widens to the full ISO set. |
| F4 | Select a country, go forward a step, then come back. | The selection is still there. |
| F5 | Read the step rail at 1440px, 1024px and 768px. | Five labelled steps. **No label is clipped or ellipsized** at any width. |
| F6 | Check the current, completed and unreached steps. | Distinguishable without relying on colour — a tick, a fill, an outline — plus a written "Step N of 5". |
| F7 | Click a completed step. | It navigates back to it. |
| F8 | Open `/features`. | Hero, proof numbers, a numbered lifecycle panel, a contents rail, cards. |
| F9 | Scroll past the hero. | The contents rail sticks **below** the site header, not underneath it. |
| F10 | Click a contents-rail entry. | The section heading lands clear of both the header and the rail. |
| F11 | Check the three proof numbers in the hero. | They match the catalogue — capabilities, areas, lifecycle stages. They are counted, not typed. |
| F12 | Open `/features` at 375px. | The rail scrolls horizontally; nothing is clipped; no horizontal page scroll. |

### Considerations for Suite F

- **F2 is the point of the whole item.** A lookup that degrades to a text box
  when unreachable is indistinguishable from a lookup that was never built —
  which is precisely how it was reported after it had shipped.
- F5 must be checked at more than one width. The defect was width-dependent and
  looked deliberate, because ellipsis reads as intent.
- F11 guards against a marketing page claiming a number the product does not
  have, which is the same class of defect as a badge that counts nothing.

---

## Suite G — Lists that state their size

Covers BUG-0352 from the previous round.

| # | Step | Expected |
|---|---|---|
| G1 | Open a tenant record → **Timeline** on a tenant with substantial history. | "Showing 1–25 of N" above the list. |
| G2 | Page to the end. | The last page stops at the end of the list; Next is disabled. |
| G3 | On the last page, switch the category filter to one with fewer entries. | The panel shows **rows**, not an empty state. The pager agrees with what is on screen. |
| G4 | Switch filters repeatedly. | Each switch returns to page 1. |
| G5 | Check a tenant with fewer than 25 entries. | No pager is rendered; the count line still appears. |

### Consideration for Suite G

G3 is the failure that the fix for G1 could easily have introduced: a page
number held in state survives the list being filtered under it, and an empty
panel over a list that plainly has rows reads as "there is nothing here", which
is false.

---

## Suite H — Cross-cutting

Run these against every screen touched above. They are listed once rather than
repeated per suite.

| # | Step | Expected |
|---|---|---|
| H1 | Traverse each screen by keyboard alone. | Every control is reachable and has a visible focus ring. No trap. |
| H2 | Open each popover and dialog, then press Escape. | It closes and focus returns to the control that opened it. |
| H3 | Check every state indicator. | Meaning is carried by text as well as colour. |
| H4 | Force each data surface into loading, error and empty states. | Each is a designed state, not a blank area or a spinner that never ends. |
| H5 | Check each disabled control. | Its reason is stated, the reason is **true now**, and some sequence of actions enables it. |
| H6 | Run each screen at 1440px, 768px and 375px. | No horizontal page scroll; wide content scrolls inside its own container. |
| H7 | Read every user-facing string for machine data. | No JSON fragment, ISO timestamp, bare enum constant or UUID in prose. |

### Consideration for Suite H

H5 and H7 are the two that caught real defects this round: a retry button
disabled under a false reason for hours, and a service order printing a JSON
array. Both would pass a review of the component that renders them, and both
fail on sight.

---

## Recording the run

Create a run record under [`../runs/`](../runs/) with a row per step id and its
verdict. A guide with no recorded verdicts has not been executed, whatever was
looked at.

When steps fail, open BUG records citing the step ids, leave
`ArchitectDisposition` as `TRIAGE_REQUIRED`, and stop there. QA establishes what
is true; the Architect decides what the project does about it.
