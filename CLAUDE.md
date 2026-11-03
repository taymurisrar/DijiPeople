# DijiPeople Claude Code Instructions

@AGENTS.md

AGENTS.md is the authoritative repository-wide engineering instruction set.
Follow it completely before planning, modifying, testing, committing, merging,
deploying, or reporting completion of any task.

For work inside a directory containing a nested AGENTS.md, read and apply that
file before modifying files in that scope.

Engineering standards, the policy catalogue (ids + how each is enforced), path-scoped rules,
agents and skills: [`docs/engineering/README.md`](docs/engineering/README.md). Run `npm run preflight`
before pushing. Agents: `.claude/agents/dp-*`; skills: `/dp-new-module`, `/dp-new-api`, `/dp-hotfix`, `/dp-ci-doctor`, …
