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

## Deliberately not created yet

Assessed against real usage, not speculation:

| Candidate | Status | Reason |
|---|---|---|
| `review-tenant-isolation` | **Needs more pilots** | High value, but the procedure still varies per module. The Reviewer checklist covers it today; extract when the steps stop changing |
| `review-api-data-sensitivity` | **Needs more pilots** | Only two instances observed (compensation, subscription pricing). One more and the pattern is stable enough |
| `create-prisma-entity` | **Defer** | Conventions are well documented in `services/api/prisma/AGENTS.md`, and mistakes are permanent — human review matters more than automation here |
| `create-module-screen` | **Defer** | The runtime registration path was found to contain unused scaffolding; encode it only once the real path is stable |
| `qa-regression-review` | **Defer** | The register has 7 entries — verified, not assumed. `retrieve-relevant-knowledge` already surfaces the relevant ones; a dedicated Skill adds a step without adding a decision. Revisit when reading the register is genuinely a chore |
| `qa-browser-regression` | **Blocked, not deferred** | No browser automation exists in any workspace — no Playwright, Cypress or Puppeteer. Writing this Skill now would document a procedure nobody can run, which is worse than not having it. Create it **with** the tooling, not before |

A Skill that encodes a convention which then changes is a stale instruction with
extra steps. Four proven Skills beat ten speculative ones — and a Skill for a
capability the environment does not have is not a Skill, it is fiction.

## Skill contract

Every Skill file states:

- **Trigger** — when to invoke it
- **Inputs** — what must be known first
- **Steps** — numbered, mechanical
- **Expected output** — the artefact produced
- **Stop conditions** — when to halt and report instead of proceeding
- **Validation** — how to confirm the Skill was applied correctly
- **Evidence requirements** — what must be recorded
