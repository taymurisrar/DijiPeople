# Browser Control

How an agent drives the running product: navigates, clicks, reads a page, validates behavior, and judges whether the rendered experience matches what the screen is supposed to do.

This is the interactive counterpart to `browser-e2e.md`.

`browser-e2e.md` covers scripted Playwright journeys that run in CI and produce deterministic pass/fail results. This document covers an agent steering a browser step by step and producing a reasoned product judgement.

Same engine. Different job.

E2E tests protect known behavior.

Agent-driven browser review explores runtime behavior and usability.

Code review explains implementation and intent.

UI review compares the running product against business, UX, accessibility, and design expectations.

The browser review is not complete until the agent has checked the actual running screen.

---

## 1. What Browser Control Is

`@playwright/mcp` exposes a browser to the agent as ordinary tools. The agent can navigate, click, fill forms, select options, press keys, inspect accessibility snapshots, take screenshots, read console output, and inspect network activity.

It is declared in `.mcp.json` at the repository root, so it is available to agents working in this repository after approval.

Verified against the committed configuration on 2026-08-25. The server exposes 24 tools:

```text
browser_navigate         browser_click              browser_snapshot
browser_navigate_back    browser_hover              browser_take_screenshot
browser_find             browser_type               browser_console_messages
browser_fill_form        browser_press_key          browser_network_requests
browser_select_option    browser_drag               browser_network_request
browser_file_upload      browser_drop               browser_handle_dialog
browser_tabs             browser_resize             browser_wait_for
browser_close            browser_evaluate           browser_run_code_unsafe
```

### Use named tools first

`browser_run_code_unsafe` executes arbitrary Playwright code in the page.

It is intentionally available as an escape hatch for states the named tools cannot reach, but it should not be the default.

Use this order:

1. Named browser tool.
2. Accessibility snapshot.
3. Network or console inspection.
4. `browser_evaluate` for read-only inspection.
5. `browser_run_code_unsafe` only when the other tools cannot perform the required action.

If `browser_run_code_unsafe` is used, the agent should state why the named tools were insufficient.

---

## 2. The Browser Is Controlled Through Accessibility, Not Coordinates

The agent receives a structured accessibility snapshot containing roles, accessible names, states, and element relationships.

It should interact with that structure rather than relying on pixel coordinates.

This matters for three reasons.

### 2.1 Deterministic interaction

A click targets a named element, not an arbitrary position on the page.

That makes interaction more resilient to layout shifts and viewport changes.

### 2.2 Accessibility defects become automation defects

If a button has no accessible name, the agent may fail to locate it for the same reason a screen reader user would.

At the time of writing:

- `apps/admin` contains zero `data-testid` attributes.
- `apps/web` uses them in 11 files.
- `apps/landing` contains none.

Admin therefore depends almost entirely on roles and accessible names.

That means accessibility quality and browser automation quality are directly connected.

### 2.3 Screenshots are evidence, not the control surface

Screenshots are still required for evaluating:

- visual hierarchy,
- spacing,
- density,
- alignment,
- responsive behavior,
- clipping,
- overflow,
- contrast,
- empty states,
- visual completeness.

But the agent should not need screenshots to determine where to click.

---

## 3. What the Agent Must Judge

Browser control is not merely “can the agent click through the page?”

The agent must judge the product across multiple dimensions.

### Functional correctness

- Does the screen load successfully?
- Do primary actions work?
- Do forms save?
- Do buttons perform the expected action?
- Do validation rules appear at the correct time?
- Does navigation land on the correct screen?
- Does state persist after refresh or navigation?

### Content relevance

The agent must compare what the screen shows with what the screen is supposed to show.

It should check:

- page title,
- section names,
- field labels,
- helper text,
- action labels,
- empty-state copy,
- table columns,
- navigation options,
- related records,
- contextual actions,
- whether irrelevant controls are being shown.

A page can be technically functional and still be wrong because its content does not match the business context.

### Information architecture

The agent should check whether:

- important actions are discoverable,
- sections appear in a logical order,
- related information is grouped correctly,
- secondary controls do not dominate the page,
- navigation reflects the product model,
- the user can understand where they are and what they can do next.

### Interaction quality

Check:

- focus behavior,
- tab order,
- keyboard operability,
- disabled states,
- loading behavior,
- optimistic updates,
- confirmation dialogs,
- destructive-action friction,
- success feedback,
- error recovery.

### Visual quality

Check:

- spacing consistency,
- alignment,
- visual hierarchy,
- density,
- responsive layout,
- overflow,
- truncation,
- inconsistent control sizing,
- broken grids,
- awkward empty space,
- visual regressions against the design system.

### Runtime health

The agent must inspect more than pixels.

It should also read:

- browser console,
- failed network requests,
- unexpected redirects,
- authorization failures,
- API response errors,
- client-side exceptions.

A page that looks correct while generating failed requests is not considered healthy.

---

## 4. Before the Agent Opens the Browser

The browser can only judge the product if the product is running correctly.

A broken environment must not be reported as a product defect.

The same prerequisites used by the E2E suite apply here.

Full setup is documented in `browser-e2e.md`.

Short version:

```bash
# 1. Use a disposable database.
#    Migrate and seed it.
#    Do not use the working production-like database.

# 2. Start the applications you intend to inspect.

npm --workspace admin run dev       # 3002
npm --workspace web run dev         # 3001
npm --workspace landing run dev     # 3000
npm --workspace api run start:dev   # 4000

# 3. Install Chromium once.

npm run test:browser:install
```

Nothing starts these services automatically.

`playwright.config.ts` deliberately has no `webServer` block.

A browser that silently starts or mutates its own environment makes infrastructure failures look like product failures.

---

## 5. Authenticated Screens

Sign in once and reuse the session rather than performing authentication on every review.

```bash
export E2E_PLATFORM_ADMIN_EMAIL=...
export E2E_PLATFORM_ADMIN_PASSWORD=...

node e2e/tools/save-auth.mjs
# Use --app web for the tenant product.
```

This writes:

```text
e2e/.auth/admin.json
```

The file contains live session cookies and must be treated as a credential.

It is gitignored.

`save-auth.mjs` rejects any origin that is not `localhost` or `127.0.0.1`, preventing a production session from being written by an accidental flag.

To use the generated session, add:

```text
--storage-state e2e/.auth/admin.json
```

to the MCP server arguments.

This flag is intentionally not committed in `.mcp.json` because the file does not exist until someone generates it.

---

## 6. What the Committed MCP Configuration Decides

| Flag | Purpose |
|---|---|
| `--browser chrome` | Uses real Chrome rather than bundled Chromium. |
| `--viewport-size 1440x900` | Provides a desktop default. The agent should override it for tablet and mobile testing. |
| `--console-level info` | Makes console warnings and errors visible during review. |
| `--test-id-attribute data-testid` | Matches `apps/web`; currently has no effect on admin. |
| `--snapshot-mode full` | Provides full accessibility snapshots. |
| `--snapshot-boxes` | Adds bounding boxes so layout can be evaluated from snapshots as well as screenshots. |
| `--caps vision,devtools,network,storage,testing,config` | Enables visual, console, network, storage, testing, and configuration capabilities. |
| `--output-dir .playwright-mcp` | Stores snapshots, screenshots, downloads, and related output. |
| `--save-session` | Persists browser session state between runs. |
| `--allowed-origins` | Restricts direct browser access to explicitly listed origins. |

---

## 7. Production Access Rules

### The origin list is an allowlist

The current configuration uses `--allowed-origins`.

It includes the three authenticated production hosts plus `www.dijipeople.com`.

The owner made this decision on 2026-08-26 so agents could QA production directly while the environment contains no live customer data.

That decision has consequences.

### Everything not listed is blocked

This includes:

- `localhost`,
- unlisted development hosts,
- `checkout.stripe.com`,
- third-party authentication pages,
- external documentation or support links.

A journey may therefore fail with:

```text
ERR_BLOCKED_BY_CLIENT
```

even when the product itself is behaving correctly.

### The origin list is not a security boundary

Treat it as browser navigation policy, not as a substitute for access control.

### Production access has an expiry condition

Direct agent access to authenticated production should be reconsidered before the environment contains customer data whose loss, corruption, or disclosure would matter.

Before that point, either:

- remove authenticated production origins from the agent allowlist,
- use a dedicated QA environment,
- provide read-only or test accounts,
- or enforce a separate approval boundary for write-capable production actions.

### Editing `.mcp.json` does not affect a running MCP process

The file is read when the MCP server starts.

After changing MCP arguments, restart the editor or MCP process.

---

## 8. Read-Only by Default

Agent-driven UI review should operate under a simple principle:

> Observe freely. Mutate deliberately. Destroy only with explicit approval.

### Safe actions

Usually safe without additional confirmation:

- navigate,
- open tabs,
- inspect records,
- search,
- filter,
- sort,
- expand sections,
- inspect menus,
- take screenshots,
- inspect console/network activity,
- test responsive layouts.

### Mutating actions

Use judgement before:

- saving a form,
- creating a record,
- editing a record,
- changing configuration,
- submitting a workflow,
- triggering a notification,
- sending an email,
- starting an integration.

Prefer test data where possible.

### Destructive actions

Require explicit confirmation unless the task already clearly authorizes the exact destructive action:

- deleting data,
- erasing a tenant,
- removing users,
- revoking access,
- changing billing,
- cancelling subscriptions,
- resetting environments,
- mass-updating records,
- submitting irreversible workflows.

The admin console contains destructive actions. The existence of a clickable button is not permission to click it.

---

## 9. The Required UI Review Workflow

A UI review is incomplete if the agent only opens the page and describes what it sees.

Use the following sequence.

### Stage 1 — Understand the intended screen

Before reviewing the running product, retrieve the relevant product and component context.

```bash
node scripts/retrieve-knowledge.mjs <module> <component>
```

Also inspect:

- `../../.agent/context/component-index.md`

The agent should identify:

- the screen's purpose,
- target user,
- primary task,
- expected data,
- expected actions,
- expected states,
- relevant business rules,
- relevant design-system components.

Without this baseline, the agent can describe the page but cannot judge whether it is correct.

### Stage 2 — Open the running product

Navigate to the actual screen.

Do not conclude that the screen is correct merely by reading its component source.

Runtime behavior can differ because of:

- API response shape,
- permissions,
- feature flags,
- routing,
- data state,
- adapters,
- stale client state,
- authorization,
- environment configuration.

### Stage 3 — Capture the initial state

For every material screen:

- take an accessibility snapshot,
- take a screenshot,
- inspect console messages,
- inspect failed network requests.

This becomes the baseline evidence.

### Stage 4 — Verify the primary journey

Perform the main action the screen exists to support.

Examples:

- create a lead,
- qualify a lead,
- open a customer,
- edit an agreement,
- provision a tenant,
- filter a table,
- submit a form,
- inspect a timeline,
- switch a workspace,
- complete an onboarding step.

Check both the interaction and the resulting state.

### Stage 5 — Review important states

Where applicable, test:

- loading,
- populated,
- empty,
- validation error,
- API error,
- unauthorized,
- disabled,
- read-only,
- success,
- stale data,
- pagination,
- long content,
- many rows,
- zero rows.

### Stage 6 — Review responsive behavior

At minimum review:

- desktop,
- tablet,
- mobile.

For high-value screens, also test a narrow desktop viewport because many layout defects appear before mobile breakpoints.

The agent should look for:

- hidden actions,
- clipped content,
- overflow,
- horizontal scrolling,
- broken grids,
- wrapping problems,
- unusable modals,
- fixed headers obscuring content.

### Stage 7 — Review keyboard behavior

Use keyboard-only navigation for the primary journey where practical.

Check:

- focus visibility,
- logical tab order,
- focus trapping in dialogs,
- Escape behavior,
- Enter/Space activation,
- inaccessible custom controls.

### Stage 8 — Re-check runtime health

After interaction:

- inspect console again,
- inspect failed network requests again,
- confirm no background errors were introduced,
- confirm the visible success state matches the backend response.

### Stage 9 — Record findings

Every material finding must become a record under:

```text
docs/bugs/
```

per `AGENTS.md`.

A screenshot in chat is evidence.

It is not the bug record.

---

## 10. Review Matrix

For important product screens, use this matrix as the minimum standard.

| Area | Questions |
|---|---|
| Purpose | Does the page support the task it exists for? |
| Relevance | Are the labels, actions, sections, and data appropriate to this user and context? |
| Function | Do the primary and secondary actions work? |
| Navigation | Can the user understand where they are and where to go next? |
| Data | Is the expected data shown, formatted, refreshed, and persisted correctly? |
| Validation | Are required fields and invalid states handled clearly? |
| Empty state | Does the page explain what is missing and what the user can do next? |
| Errors | Does failure produce useful feedback rather than silent breakage? |
| Accessibility | Are controls named, focusable, keyboard-operable, and semantically correct? |
| Responsive | Does the screen remain usable at desktop, tablet, and mobile sizes? |
| Visual | Is hierarchy, spacing, density, alignment, and component usage consistent? |
| Console | Are there JavaScript errors, warnings, or hydration issues? |
| Network | Are there failed, repeated, unauthorized, or unexpectedly slow requests? |
| Permissions | Are actions and data appropriate for the current role? |
| Safety | Could the agent accidentally trigger destructive or production-impacting behavior? |

---

## 11. Finding Severity

Use severity based on product impact, not visual annoyance.

### Critical

- destructive behavior,
- security or authorization failure,
- data corruption,
- tenant isolation failure,
- billing error,
- unrecoverable workflow failure.

### High

- primary journey blocked,
- save fails,
- navigation prevents task completion,
- required data missing,
- major responsive failure,
- inaccessible primary action.

### Medium

- secondary workflow broken,
- misleading content,
- inconsistent state,
- important validation problem,
- repeated console/network errors without immediate task failure.

### Low

- spacing,
- alignment,
- wording,
- minor visual inconsistency,
- non-blocking polish issue.

---

## 12. What a Good Finding Contains

A useful finding should answer:

- Where? Screen, route, component, or workflow.
- What happened? Observable behavior.
- What should happen? Expected behavior.
- How was it reproduced? Short deterministic steps.
- What evidence exists? Screenshot, snapshot, console, network request.
- How serious is it? Severity and user impact.
- What context matters? Role, viewport, tenant, state, or dataset.
- Is it reproducible? Always, intermittent, or data-dependent.

Avoid findings such as:

> The page looks weird.

Prefer:

> On `/admin/customers/:id`, the Agreements card overflows the right edge at 768 px. The primary action becomes partially hidden and cannot be reached without horizontal scrolling. Reproduced in Chrome at 768 × 1024 with three agreements loaded.

---

## 13. Evidence Rules

Use the right evidence for the right type of finding.

### Screenshot

Use for:

- layout,
- spacing,
- visual hierarchy,
- overflow,
- missing content,
- unexpected states.

### Accessibility snapshot

Use for:

- missing accessible names,
- incorrect roles,
- disabled state,
- hidden controls,
- navigation structure,
- form semantics.

### Console

Use for:

- React warnings,
- uncaught exceptions,
- hydration failures,
- failed client-side logic.

### Network

Use for:

- failed API calls,
- wrong status codes,
- duplicate requests,
- unexpected payloads,
- authorization failures,
- stale responses.

A strong finding often uses more than one evidence type.

---

## 14. Failure Triage

Not every browser failure is a product defect.

Classify the failure before reporting it.

### Environment failure

Examples:

- API is not running,
- database is not migrated,
- required seed data is missing,
- local service port is unavailable.

### Browser policy failure

Examples:

- origin blocked by `--allowed-origins`,
- Stripe Checkout blocked,
- external authentication host blocked.

### Authentication failure

Examples:

- session expired,
- storage state missing,
- role lacks access,
- account disabled.

### Product failure

Examples:

- UI crashes with healthy services,
- save request returns application error,
- wrong data shown,
- valid action does nothing,
- screen violates the expected workflow.

### Test-data failure

Examples:

- expected entity does not exist,
- workflow requires a state not represented in the seed,
- feature depends on a configuration record that was never created.

The agent should not create a product bug until it has ruled out the first four categories where reasonably possible.

---

## 15. Output Directory and Session Safety

`--output-dir .playwright-mcp` plus `--save-session` means navigation can produce:

- snapshots,
- screenshots,
- downloads,
- session state,
- browser artifacts.

A production QA pass on 2026-08-26 left 95 untracked files in the primary checkout.

`.gitignore` now covers:

```text
.playwright-mcp/
```

`--isolated` was removed in the same change.

The browser profile therefore survives between runs.

That is convenient because authentication can persist, but it also means a live session may remain on disk.

Treat `.playwright-mcp` as potentially sensitive local state.

Do not commit it.

---

## 16. If the MCP Server Will Not Start in a Git Worktree

`npx` may fail with:

```text
Cannot read properties of null (reading 'package')
```

when the worktree's `node_modules` is a junction or symlink into another checkout.

This is the usual setup when a task worktree shares dependencies instead of running a full `npm ci`.

Confirmed behavior:

- with the junction present, `npx` fails before reaching the package;
- after removing the junction, the same command succeeds.

The MCP configuration is therefore not necessarily the problem.

Two valid options:

### Option A — install dependencies in the worktree

```bash
npm ci
```

This gives the worktree a real `node_modules`.

### Option B — launch MCP from the primary checkout

Agent-driven browser review operates over HTTP.

The directory that launched the browser does not need to be the branch currently being reviewed.

---

## 17. Selector Strategy

Use selectors in this order:

- accessible role + name,
- label,
- placeholder or semantic text,
- stable `data-testid`,
- CSS selector only when unavoidable,
- coordinate-based interaction should be treated as a last resort.

The preferred selector should describe the user's mental model of the control.

Good:

```text
button "Create Customer"
```

Weak:

```text
div:nth-child(4) > button:nth-child(2)
```

If the agent cannot identify an interactive element semantically, that may itself be an accessibility or component-quality finding.

---

## 18. Agent Review Contract

When an agent is asked to review a screen, it should behave as if the task means:

> Understand the intended user journey, open the running product, navigate through the relevant states, interact with the real controls, inspect the rendered content, verify data and actions, test responsive and keyboard behavior where relevant, inspect console and network activity, compare what is visible with the expected business context, and record every material defect with reproducible evidence.

It should not treat any of the following as a complete UI review:

- reading source code only,
- reading Storybook only,
- taking one screenshot,
- checking only the happy path,
- checking desktop only,
- reporting visual issues without verifying runtime behavior,
- reporting runtime errors without confirming whether the environment is healthy,
- saying “looks good” without checking the intended content and actions.

---

## 19. Completion Criteria

A browser-driven UI review is complete only when the agent can answer all of the following:

- What is this screen supposed to do?
- Who is it for?
- What is the primary user journey?
- Did that journey work in the running product?
- Was the content relevant to the current user and record context?
- Did loading, empty, failure, and permission states behave correctly where applicable?
- Was the screen usable at required viewport sizes?
- Was the primary journey keyboard-operable?
- Were there console errors or suspicious network failures?
- Were material findings recorded under `docs/bugs/`?
- Was destructive behavior avoided unless explicitly authorized?

If the answer to a material item is unknown, the review is incomplete rather than passed.

---

## 20. What Browser Control Does Not Replace

### The E2E suite

Agent-driven exploration is not deterministic and does not run in CI.

A behavior worth protecting should become a test under:

```text
e2e/tests/
```

not merely a note that an agent once checked it.

### Unit and integration tests

The browser is the slowest place to discover something a `*.spec.ts` can prove in milliseconds.

### Code review

The browser shows what happens.

The code explains how and why it happens.

### Product knowledge

A browser cannot determine whether a page is relevant without a source of truth describing what the page is intended to do.

That is why UI review begins with the product and component context rather than with the screenshot.

---

## 21. Recommended Review Loop

For high-value UI work, use this loop:

```text
Understand intent
    ↓
Open running product
    ↓
Capture baseline
    ↓
Exercise primary journey
    ↓
Check alternate states
    ↓
Check responsive + keyboard
    ↓
Inspect console + network
    ↓
Record findings
    ↓
Fix
    ↓
Re-run browser review
    ↓
Promote stable behavior into E2E tests
```

This keeps browser review, implementation, and regression protection connected instead of treating them as separate activities.

---

## Related

- `browser-e2e.md` — scripted browser suite, gate status, and selector policy
- `.agent/context/ui-design-system.md` — design kits, theming boundaries, and known exceptions
- `.agent/context/component-index.md` — generated shared-component inventory
- `.agent/agents/ui-ux.md` — UI review rubric
- `AGENTS.md` — agent operating rules and bug-record requirements
