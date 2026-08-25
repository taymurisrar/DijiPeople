# Skills

**Agents define ownership and judgement. Skills define repeatable procedures.**

A Skill is a mechanical sequence an agent invokes. It never replaces a role's
judgement, and role behaviour is never encoded inside a Skill.

## Skills here

| Skill | Invoked by | Status |
|---|---|---|
| [`authorization-dry-run.md`](authorization-dry-run.md) | Backend/API, Architect | **Ready** — proven across four remediation batches |
| [`knowledge-capture.md`](knowledge-capture.md) | Knowledge Writer step | **Ready** — mechanical extraction, no judgement encoded |
| [`retrieve-relevant-knowledge.md`](retrieve-relevant-knowledge.md) | Architect, QA, Reviewer | **Ready** — backed by `scripts/retrieve-knowledge.mjs`, so every agent gets the same ranked answer for the same terms |
| [`process-user-feedback.md`](process-user-feedback.md) | Architect, Knowledge Capture | **Ready** — a fixed classification table with exactly one real judgement |
| [`ui-review.md`](ui-review.md) | UI/UX, QA | **New, unproven** — created *with* the tooling rather than before it, per the rule below. It has not yet run on a real screen; correct it from what it gets wrong, not from what it looks like it should say |

## Deliberately not created yet

Assessed against real usage, not speculation:

| Candidate | Status | Reason |
|---|---|---|
| `review-tenant-isolation` | **Needs more pilots** | High value, but the procedure still varies per module. The Reviewer checklist covers it today; extract when the steps stop changing |
| `review-api-data-sensitivity` | **Needs more pilots** | Only two instances observed (compensation, subscription pricing). One more and the pattern is stable enough |
| `create-prisma-entity` | **Defer** | Conventions are well documented in `services/api/prisma/AGENTS.md`, and mistakes are permanent — human review matters more than automation here |
| `create-module-screen` | **Defer** | The runtime registration path was found to contain unused scaffolding; encode it only once the real path is stable |
| `qa-regression-review` | **Defer** | The register has 7 entries — verified, not assumed. `retrieve-relevant-knowledge` already surfaces the relevant ones; a dedicated Skill adds a step without adding a decision. Revisit when reading the register is genuinely a chore |
| `qa-browser-regression` | **Unblocked — superseded** | This row read "Blocked, not deferred — no browser automation exists in any workspace". That stopped being true twice over: the `e2e` workspace brought Playwright and a Chromium install, and `.mcp.json` now gives an agent an interactive browser. [`ui-review.md`](ui-review.md) covers the reviewing half. A *regression* skill is still not written, because the register is the mechanism for keeping a fixed defect fixed and it needs no procedure of its own yet |

A Skill that encodes a convention which then changes is a stale instruction with
extra steps. Four proven Skills beat ten speculative ones — and a Skill for a
capability the environment does not have is not a Skill, it is fiction.

That last rule is why `ui-review` waited. It is also why this table has to be
re-read rather than trusted: it recorded an environment limitation as a
standing decision, and the limitation was lifted by a different task months
before anybody came back to the row. **A "blocked" entry here is a claim about
the environment, and claims about the environment expire.**

## Skill contract

Every Skill file states:

- **Trigger** — when to invoke it
- **Inputs** — what must be known first
- **Steps** — numbered, mechanical
- **Expected output** — the artefact produced
- **Stop conditions** — when to halt and report instead of proceeding
- **Validation** — how to confirm the Skill was applied correctly
- **Evidence requirements** — what must be recorded
