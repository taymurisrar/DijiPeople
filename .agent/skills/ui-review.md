# Skill — UI Review on the Running Product

Drive a screen in a real browser, and decide whether what it shows is what it
was supposed to show.

This exists because reading a component and concluding it is correct is a
statement about the code, not about the screen. Whether an empty state renders
depends on the response shape, the permission gate and the runtime adapter —
none of which the component file shows. `.agent/agents/ui-ux.md` Stage 2 has
required the running product for as long as it has existed; until browser
control landed, the requirement could not be met and every QA run carried
`BROWSER_E2E = BLOCKED_INFRASTRUCTURE` in its Known Limitations.

**The judgement stays with the role.** This skill is the mechanical part: what
to load, what to drive, what to capture, where findings go. Whether a screen is
good is UI/UX's call, and whether a defect is worth fixing now is the
Architect's.

## Trigger

Invoked by **UI/UX** and **QA** when a task changes or reviews any of:

```
a screen                a form                  a list or table
navigation              an empty/error state    a permission-gated control
a command bar           a dialog                a responsive layout
```

Not invoked for a backend-only change, or for a component with no rendered
surface. `UI_UX_AGENT_STATUS = NOT_REQUIRED` still needs a stated reason.

## Inputs

Known before the browser opens. An agent that skips step 1 can only describe
what it sees, which is not review:

1. **What the screen is supposed to do** — from retrieval, not from the
   component file.
2. **A running stack** — see
   [`docs/development/browser-control.md`](../../docs/development/browser-control.md).
   Nothing starts it for you.
3. **A session**, for anything behind auth — `node e2e/tools/save-auth.mjs`.

## Steps

### 1. Learn the contract before looking

```bash
node scripts/retrieve-knowledge.mjs <module> <component>
```

Then read the rows for that component in
[`.agent/context/component-index.md`](../context/component-index.md) and follow
their `file:line` into the source. Spelling does not matter — `command-bar`,
`command bar` and `ModuleActionBar` all reach the same documents.

Write down, before opening the browser, what should be on the screen. A
prediction made afterwards is not a prediction.

**Declared behaviour is often not in the component.** The admin command bar is
the standing example: which buttons exist comes from `define()` and the
module's `capabilities` map in `platform-module-registry.ts`, not from
`ModuleActionBar`, which renders what it is handed. Reviewing the component
would have told you nothing about which buttons that module gets.

### 2. Drive it

Navigate, then work the axes. Not every screen needs all of them; say which
you skipped and why.

| Axis | What to do | What you are looking for |
|---|---|---|
| **Desktop** | Default 1280×900 | Hierarchy — does the most important thing look like it |
| **Tablet / mobile** | `--device` or a resized viewport | Reflow, truncation, controls off-screen, tap targets |
| **Loading** | Throttle or reload | A state exists at all, rather than a blank frame |
| **Empty** | A filter matching nothing | The shared empty state, with an action — not an empty table |
| **Error** | Break the request | A message that says what to do, not a stack or a blank |
| **Unauthorized** | A role without the permission | The control is absent or explained, never present-and-broken |
| **Keyboard** | Tab through, Escape out of dialogs | Focus visible, order sane, no trap, dialogs dismissable |

### 3. Read the panes, not only the pixels

Take the accessibility snapshot and the console. On a screen that looks fine,
the finding is often in one of them:

- A control with **no accessible name** is invisible to a screen reader — and
  to the agent, which is how you notice.
- A **console error** or a failed request behind a screen that rendered anyway.
- Meaning carried by **colour alone**; `StatusPill` carries text for this
  reason.

### 4. Judge relevancy against step 1

The question is not "does it render". It is whether the content is the content
this screen owes its user:

- Is anything **claimed** here that the data does not support?
- Is anything **missing** that the module's declared contract says belongs?
- Does a number, status or label **agree with the record behind it**?
- Would a first-time user know what to do next?

A discrepancy between a document and the screen is classified, never silently
resolved: `EXPECTED_CHANGE`, `STALE_REPOSITORY_DOC`, `UNIMPLEMENTED_REQUIREMENT`
or `PRODUCT_DECISION_REQUIRED`.

### 5. Record what you found

Every material finding becomes a record under `docs/bugs/` with its evidence,
per [`AGENTS.md`](../../AGENTS.md). A screenshot in a chat transcript is not a
finding, and a task cannot complete while a finding it produced is
unclassified.

Attach the screenshot, the route, the viewport, and the console output. QA
establishes what is true; the Architect decides what to do about it.

## Expected output

- A per-axis verdict, with the axes you skipped named and explained
- Screenshots for anything visual you assert
- A `docs/bugs/` record per material finding
- A line for `UI_UX_AGENT_STATUS` / `QA_STATUS`

## Stop conditions

Halt and report rather than proceeding:

- **The stack is not up, or the API is unhealthy.** A screen failing because
  its API is down is not a UI finding. Say so and stop — reporting it as a
  product defect is the specific failure `browser-e2e.md` warns about.
- **The local database is behind.** `P2022` on one screen reads as a
  regression in that screen and is not. Run `npm run db:preflight`.
- **The browser cannot reach the origin.** Production admin hosts are blocked
  deliberately; see `browser-control.md`.
- **You are about to change data you did not create.** The test-resource policy
  applies here: create what you assert on, clean exactly that.

## Validation

The skill was applied correctly when:

- Step 1 happened **before** step 2, and the prediction is written down
- Every visual claim has a screenshot
- Every material finding has a record id
- Skipped axes are named, not silently dropped

## Evidence requirements

Route, viewport, session role, screenshot, console output, and the retrieval
terms used in step 1. Never a password, a token, or the contents of
`e2e/.auth/`.

## Known limitation

**This is not repeatable and does not run in CI.** An agent-driven review
proves something once, on one machine. A behaviour worth protecting becomes a
spec in `e2e/tests/`; a defect worth preventing becomes a regression entry.
Treat this skill as the thing that *finds* the case, never as the thing that
*keeps* it fixed.
