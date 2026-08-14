# ADR-XXX — {{decision}}

> Replace `XXX` with the next sequential number. Numbers are never reused.
> When this decision is settled, copy the note into the repository at
> `docs/decisions/ADR-XXXX-short-kebab-title.md` and link back to it from
> `05 - Decisions/Architecture Decision Index.md`.

## Status

Proposed / Accepted / Deprecated / Superseded by ADR-XXX

Date:

An accepted ADR is **not rewritten** when the decision changes. Write a new ADR
that supersedes it and update this one's status.

## Context

What situation forces a decision. The constraints, the pressures, what is true
today. Include the evidence — file paths, measurements, incidents — not just an
assertion.

## Decision

What was decided, stated plainly and unambiguously. Someone should be able to
act on this paragraph alone.

## Reasons

Why this option. Tie each reason back to something in Context.

## Alternatives Considered

For each: what it was, and why it was not chosen. An ADR with no alternatives
usually means the decision was not really a decision.

**Option A —**
Rejected because:

**Option B —**
Rejected because:

## Consequences

**Positive**

**Negative / costs**

**Neutral**

Be honest about the costs. A consequences section with only benefits is a sales
pitch, not a record.

## Migration / Compatibility Impact

What must change in existing code, data or process. Whether old and new can
coexist during rollout. Whether already-deployed clients — the .NET gateway, the
desktop agent, the three frontends — are affected. Rollback path.

## Security / Tenant Impact

Effect on tenant isolation, authentication, authorization, audit or data
exposure. If none, say so explicitly — that statement is itself useful.

Remember the standing properties of this system: isolation is convention-only,
two permission systems are enforced together, and the Prisma `$use` middleware
does not run.

## Agent Rules

What an AI agent must or must not do as a result of this decision. Write these
as imperatives. This section is what makes the ADR operational.

1.
2.

## Related Modules

Which parts of the codebase this governs.

## Related Features

Feature notes in `04 - Requirements/` that depend on or motivated this decision.
