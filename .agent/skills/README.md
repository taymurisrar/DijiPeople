# Skills

**Agents define ownership and judgement. Skills define repeatable procedures.**

A Skill is a mechanical sequence an agent invokes. It never replaces a role's
judgement, and role behaviour is never encoded inside a Skill.

## Skills here

| Skill | Invoked by | Status |
|---|---|---|
| [`authorization-dry-run.md`](authorization-dry-run.md) | Backend/API, Architect | **Ready** — proven across four remediation batches |
| [`knowledge-capture.md`](knowledge-capture.md) | Knowledge Writer step | **Ready** — mechanical extraction, no judgement encoded |

## Deliberately not created yet

Assessed against real usage, not speculation:

| Candidate | Status | Reason |
|---|---|---|
| `review-tenant-isolation` | **Needs more pilots** | High value, but the procedure still varies per module. The Reviewer checklist covers it today; extract when the steps stop changing |
| `review-api-data-sensitivity` | **Needs more pilots** | Only two instances observed (compensation, subscription pricing). One more and the pattern is stable enough |
| `create-prisma-entity` | **Defer** | Conventions are well documented in `services/api/prisma/AGENTS.md`, and mistakes are permanent — human review matters more than automation here |
| `create-module-screen` | **Defer** | The runtime registration path was found to contain unused scaffolding; encode it only once the real path is stable |
| `qa-regression-review` | **Defer** | The regression register has 7 entries. Automate reading it when it has enough entries that reading is a chore |

A Skill that encodes a convention which then changes is a stale instruction with
extra steps. Two proven Skills beat ten speculative ones.

## Skill contract

Every Skill file states:

- **Trigger** — when to invoke it
- **Inputs** — what must be known first
- **Steps** — numbered, mechanical
- **Expected output** — the artefact produced
- **Stop conditions** — when to halt and report instead of proceeding
- **Validation** — how to confirm the Skill was applied correctly
- **Evidence requirements** — what must be recorded
