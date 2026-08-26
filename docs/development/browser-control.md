# Browser Control

How an agent drives the running product: navigates, clicks, reads a page, and
judges whether what it sees is what the screen was supposed to show.

This is the interactive counterpart to [`browser-e2e.md`](browser-e2e.md).
That document covers the Playwright suite — scripted journeys, run in CI, whose
output is a pass or a fail. This one covers a browser an agent steers a step at
a time, whose output is a judgement. Same engine, different job, and they share
the same prerequisites and the same Chromium install.

---

## What it is

`@playwright/mcp` exposes a browser to the agent as ordinary tools: navigate,
click, fill, select, press a key, take an accessibility snapshot, take a
screenshot, read console messages, inspect network requests. It is declared in
[`.mcp.json`](../../.mcp.json) at the repository root, so it is available to
anyone working in this repository once they approve it.

Verified against the committed configuration on 2026-08-25 — the server starts
and exposes 24 tools:

```
browser_navigate        browser_click        browser_snapshot
browser_navigate_back   browser_hover        browser_take_screenshot
browser_find            browser_type         browser_console_messages
browser_fill_form       browser_press_key    browser_network_requests
browser_select_option   browser_drag         browser_network_request
browser_file_upload     browser_drop         browser_handle_dialog
browser_tabs            browser_resize       browser_wait_for
browser_close           browser_evaluate     browser_run_code_unsafe
```

`browser_run_code_unsafe` executes arbitrary Playwright code in the page. It is
left enabled because it is genuinely the escape hatch for a state the other
tools cannot reach — but it is the one tool that can do something no snapshot
will show you afterwards. Prefer a named tool; reach for it deliberately.

**It drives the accessibility tree, not pixels.** The agent receives a
structured snapshot — roles, accessible names, states — and acts on that. This
matters here for three reasons:

1. **It is deterministic.** A click targets a named element, not a coordinate,
   so it does not drift when the layout does.
2. **It fails where a screen reader would fail.** A button with no accessible
   name is invisible to the agent for exactly the reason it is invisible to
   assistive technology. `apps/admin` carries **zero** `data-testid` attributes
   (`apps/web` has them in 11 files, `apps/landing` in none), so admin is driven
   entirely by role and name — accessibility work and automation work are the
   same work here.
3. **Screenshots stay evidence rather than becoming the control surface.** The
   agent still takes them, and still reads them to judge hierarchy, spacing and
   whether a screen looks finished. It just does not need them to click.

---

## Before it can do anything

The same stack the E2E suite needs, and for the same reason — the API will not
boot without a migrated, seeded database, and a screen that renders against a
broken API reports a product failure that has not happened.

Full setup is in [`browser-e2e.md`](browser-e2e.md#running-it-locally). The
short version:

```bash
# 1. A disposable database, migrated and seeded. Not your working database.
# 2. The apps you intend to look at:
npm --workspace admin run dev     # 3002
npm --workspace web run dev       # 3001
npm --workspace landing run dev   # 3000
npm --workspace api run start:dev # 4000
# 3. Chromium, once:
npm run test:browser:install
```

Nothing starts these for you. `playwright.config.ts` deliberately has no
`webServer` block, and the same reasoning applies here: a browser that appears
to start its own stack produces environmental failures that read as product
defects.

### Authenticated screens

Sign in once and hand the session to the browser, rather than signing in on
every look:

```bash
export E2E_PLATFORM_ADMIN_EMAIL=...       # no fallback exists by design
export E2E_PLATFORM_ADMIN_PASSWORD=...
node e2e/tools/save-auth.mjs              # admin; --app web for the tenant product
```

That writes `e2e/.auth/admin.json` and prints the flag to add. **The file
contains live session cookies and is a credential.** It is gitignored, and
`save-auth.mjs` refuses any origin that is not `localhost` or `127.0.0.1` so a
production session cannot be written to disk by a mistyped flag.

To use it, add `--storage-state e2e/.auth/admin.json` to the server's args. It
is deliberately **not** in the committed `.mcp.json`: the file does not exist
until someone generates it, and a server that fails to start for everybody who
has not is worse than one that starts unauthenticated.

---

## What the committed configuration decides

| Flag | Why |
|---|---|
| `--browser chrome` | Real Chrome rather than bundled Chromium. |
| `--viewport-size 1440x900` | A desktop default. Override per look for tablet and mobile — the agent can also use `--device "iPhone 15"` or `--mobile`. |
| `--console-level info` | Console errors and warnings reach the agent. A React key warning or a failed fetch is often the actual finding on a screen that looks fine. |
| `--test-id-attribute data-testid` | Matches `apps/web`. Has no effect on admin, which has none. |
| `--snapshot-mode full`, `--snapshot-boxes` | Snapshots carry bounding boxes, so layout can be judged without a screenshot. |
| `--caps vision,devtools,network,storage,testing,config` | Network and console panes, cookie/localStorage control, tracing and video. |
| `--output-dir .playwright-mcp`, `--save-session` | Where snapshots, screenshots, downloads and session state are written. **Gitignored** — see below. |
| `--allowed-origins` | An allowlist: the three authenticated production hosts plus `www.dijipeople.com`. |

### The origins list is an allowlist, and production is on it

This was `--blocked-origins` naming the three authenticated production hosts,
so an agent exploring a screen could not wander into production and click
something that matters — the admin console has an Erase Tenant dialog on it.

It is now `--allowed-origins`, and it names those same hosts plus the public
site. The owner made that call on 2026-08-26 so agents could QA production
directly while it carries no live customer data. Two consequences, stated
plainly because both have already cost time:

- **It is an allowlist, so everything not named is blocked** — including
  `localhost` and `checkout.stripe.com`. A signup journey that reaches Stripe
  Checkout dies at `ERR_BLOCKED_BY_CLIENT` unless Stripe's hosts are added.
- **Neither form is a security boundary.** Playwright's own documentation says
  so, and says it does not affect redirects.

**This is a decision with an expiry date.** It is safe while production holds no
real customer data. Before the first paying tenant carries data worth losing,
restore a block on the authenticated hosts, or accept that any agent given this
repository can drive the production admin console.

`.mcp.json` is read once when the MCP server process starts. **Editing it
mid-session changes nothing** — the running browser keeps the arguments it was
launched with. Restart the editor.

Judgement still applies: prefer to look rather than change, and confirm before
anything destructive.

### The output directory is gitignored, and needs to be

`--output-dir .playwright-mcp` plus `--save-session` means every navigation
writes a snapshot, and sessions persist. A single production QA pass on
2026-08-26 left 95 untracked files in the primary checkout — the user's own
workspace, which they see in their Git client. `.gitignore` now covers
`.playwright-mcp/`.

Note that `--isolated` was removed in the same change, so the browser profile
now survives between runs. Convenient — a signed-in admin session is reused —
but it means a live production session sits on disk.

### If the server will not start in a git worktree

`npx` fails with `Cannot read properties of null (reading 'package')` when the
worktree's `node_modules` is a junction or symlink into another checkout —
which is the usual way a task worktree here gets its dependencies without a
full `npm ci`. npm cannot read the linked tree and gives up before `npx` ever
reaches the package.

Confirmed by removing the junction and re-running: the same command succeeds.
The MCP configuration is not the problem, and neither is the package.

Either run `npm ci` in the worktree so it has a real `node_modules`, or point
the browser at the primary checkout instead. Agent-driven review does not need
to run from the branch under review — it drives a server over HTTP, and which
directory launched the browser is irrelevant to what the browser sees.

---

## What an agent should do with it

Reading a component and concluding a screen is correct is a statement about the
code. Whether the empty state renders depends on the response shape, the
permission gate and the runtime adapter — none of which the component file
shows. That is the whole reason `.agent/agents/ui-ux.md` Stage 2 requires the
running product, and until this existed the requirement could not be met.

The procedure is in the `ui-review` skill. In outline:

1. **Learn what the screen is meant to do** before looking at it —
   `node scripts/retrieve-knowledge.mjs <module> <component>` and
   [`.agent/context/component-index.md`](../../.agent/context/component-index.md).
   Judging relevancy needs a standard to judge against; without one an agent
   can only report what it sees, which is description, not review.
2. **Drive it** — desktop, tablet, mobile; loading, empty, error, unauthorized;
   keyboard only.
3. **Read the console and network panes**, not just the pixels.
4. **Every material finding becomes a record** under `docs/bugs/`, per
   [`AGENTS.md`](../../AGENTS.md#no-finding-may-exist-only-in-a-report). A
   screenshot in a chat transcript is not a finding.

---

## What this does not replace

- **The E2E suite.** Agent-driven exploration is not repeatable and does not
  run in CI. A behaviour worth protecting becomes a spec in `e2e/tests/`, not a
  note that an agent once checked it.
- **Unit and integration tests.** A browser is the slowest way to learn
  something a `*.spec.ts` could tell you in milliseconds.
- **Reading the code.** The browser says what happens. The code and the
  comment beside it say why, and only one of those two is authority.

---

## Related

- [`browser-e2e.md`](browser-e2e.md) — the scripted suite, its gate status and
  its selector policy
- [`.agent/context/ui-design-system.md`](../../.agent/context/ui-design-system.md)
  — the kits, the theming boundary, the known exceptions
- [`.agent/context/component-index.md`](../../.agent/context/component-index.md)
  — generated; what each shared component is, and where it lives
- [`.agent/agents/ui-ux.md`](../../.agent/agents/ui-ux.md) — the review rubric
  this exists to make executable
