---
TASK_ID: TASK-0022
aliases: [TASK-0022]
TITLE: Agent UI perception: browser control, component knowledge, UI review skill
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-25
AFFECTED_MODULES: [framework, admin, web]
AGENTS: [architect, ui-ux, qa, knowledge-graph, release-devops, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE: WP-03
NEXT_READY_WORK_PACKAGE: WP-01
COMPLETED_PACKAGES: []
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS:
---

# TASK-0022 — Agent UI perception: browser control, component knowledge, UI review skill

## Objective

An agent asked to review or change a screen in this product can currently do
neither of the two things the job needs: it cannot drive the running UI, and it
cannot reliably retrieve what a component already does. This task closes both,
in that order of dependency — a generated component index and a retrieval layer
that can find it, then browser control through Playwright MCP, then a UI review
procedure that uses both. It is finished when an agent can navigate to an admin
screen, click a command-bar button, and say whether what it sees is what the
module's declared contract says should be there — without a human pasting the
contract into the conversation.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Generated component index | QA | — | knowledge-graph, ui-ux | agent/agent-ui-perception | — | — | ITEM-0098 | — | — |
| WP-02 | Component-aware knowledge retrieval | QA | WP-01 | knowledge-graph | agent/agent-ui-perception | — | — | — | — | — |
| WP-03 | Browser control via Playwright MCP | IN_PROGRESS | — | qa, release-devops | agent/agent-ui-perception | — | — | — | — | — |
| WP-04 | UI review skill | NOT_STARTED | WP-02, WP-03 | ui-ux, qa | agent/agent-ui-perception | — | — | — | — | — |

WP-03 is `PARALLEL_SAFE` against WP-01 and WP-02 — it touches repository
configuration and `e2e/`, neither of which the knowledge packages write.

### WP-01 — Generated component index

A hand-written component catalogue would be stale inside a fortnight; that is
the `doc-code-drift` pattern this repository already has a bug class for. The
component knowledge already exists as doc-comments above the exports — see
`module-action-bar.tsx`, `standard-record-commands.ts`,
`platform-module-registry.ts:461` — so this harvests rather than authors.

Output is `.agent/context/component-index.md`, generated, stamped by the
generator with the `**Last verified:**` and `**Verified against commit:**`
lines `validate-framework.mjs` already requires of every context file. That
choice is the point: it is the one place in this repository where a generated
document proves its own freshness in a format the validator already checks.

### WP-02 — Component-aware knowledge retrieval

`retrieve-knowledge.mjs` scores literal substrings, so a component's several
spellings score independently and none of them reach the relevance threshold.
Demonstrated, not assumed — see A-01. Fix is term normalisation plus the new
index as a source, with a spec that pins the behaviour.

### WP-03 — Browser control via Playwright MCP

`@playwright/mcp` gives navigate / click / fill / snapshot / console / network
over the accessibility tree. Chromium is already installed for the `e2e`
workspace. Needs a storage-state path so an agent reuses an admin session
rather than signing in per look, and documentation of the prerequisite stack.

### WP-04 — UI review skill

The rubric in `.agent/agents/ui-ux.md` Stage 2 — desktop/tablet/mobile,
loading/empty/error/unauthorized, keyboard path, content relevancy against the
module contract — expressed as one repeatable procedure that uses WP-02 to
learn what a screen should do and WP-03 to see what it does.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Component knowledge is present but unretrievable, because scoring is literal-substring | `retrieve-knowledge.mjs "command bar"` returns `.agent/context/runtime-module-system.md`; `command-bar` does not, and filters 9 hits below threshold | HIGH | WP-02 would be treating a symptom; the real gap would be missing content, not missing retrieval |
| A-02 | `@playwright/mcp` runs in this environment | `npx -y @playwright/mcp@latest --help` starts and reports `--storage-state`, `--device`, `--caps vision`, `--test-id-attribute` | HIGH | WP-03 falls back to the script-per-screenshot loop, which works but cannot click |
| A-03 | Admin screens must be addressed by role and accessible name, not test ids | `apps/admin` has 0 files containing `data-testid` (`apps/web` 11, `apps/landing` 0) | HIGH | None material — role/name is the better selector anyway, and failure means a genuine accessibility defect |
| A-04 | Existing doc-comments are substantial enough to harvest into knowledge | `module-action-bar.tsx`, `standard-record-commands.ts`, `platform-module-registry.ts:453-515` each carry multi-paragraph rationale | MEDIUM | WP-01 yields an index of names without meaning; it would then need authored summaries per component, which drift |
| A-05 | Committing an MCP server to repository config is acceptable to the owner | Owner selected the full three-package build | MEDIUM | WP-03 ships as local-only configuration and documentation instead |

## Owner Decisions

- **2026-08-25 — build all three packages.** Asked whether to start with browser
  control, component knowledge, a narrow command-bar spike, or all three; the
  owner chose all three decomposed into work packages.

Open: whether `.mcp.json` is committed for the whole team or kept local until
proven. Recorded as A-05 and carried at MEDIUM rather than blocking — WP-03
delivers either way, and the decision only changes one file's location.

## Repository Health

PRE_TASK_REPO_HEALTH — run at `2d609724` with `--main-baseline 7d91c8a0`.

- Primary worktree baseline (dirty before this task, owner: user):
  `apps/landing/next-env.d.ts`, `services/api/prisma/seed-legal.ts`
- Local `main` 28 behind, local `develop` 41 behind — this task branched from
  `origin/develop` at `2d609724`, not from either local branch.
- Overlap check across `scripts`, `.agent`, `docs/knowledge`, `.mcp.json`,
  `.claude`: `SAFE_PARALLEL`, no leased resource touched.
- One other active session: SESSION-0050 (`agent/dlp-desktop-agent`), no path
  overlap.

## History

- 2026-08-25 — created at `2d609724`.
- 2026-08-25 — decomposed into four work packages; WP-01 started.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[ITEM-0098]]

<!-- GRAPH:END -->
