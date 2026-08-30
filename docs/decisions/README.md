# Architecture Decision Records

One decision per file. An ADR records **why** something is the way it is, so
that a future engineer — or agent — does not undo it by accident.

## Naming

```
ADR-0001-short-kebab-title.md
```

Numbers are sequential and never reused.

## Status lifecycle

```
Proposed → Accepted → Deprecated | Superseded by ADR-XXXX
```

An accepted ADR is **not rewritten** when the decision changes. Write a new ADR
that supersedes it, and set the old one's status to
`Superseded by ADR-XXXX`. The record of what was believed and when is the
point.

## When to write one

- A choice between real alternatives was made and the reasoning is not obvious
  from the code
- A pattern was established that future work must follow
- A constraint was accepted deliberately (a known limitation, a deferred fix)
- Something was deliberately **not** done
- A rule was added that agents must obey

Do not write an ADR for a routine implementation detail with only one sensible
option.

## Template

Use [`../obsidian-bootstrap/99 - Templates/ADR.md`](../obsidian-bootstrap/99%20-%20Templates/ADR.md).
Sections: Status, Context, Decision, Reasons, Alternatives Considered,
Consequences, Migration / Compatibility Impact, Security / Tenant Impact,
Agent Rules, Related Modules, Related Features.

The **Agent Rules** section is what makes an ADR operational here — state
plainly what an agent must or must not do as a result of this decision.

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-0001](ADR-0001-ai-agent-workflow.md) | AI-assisted engineering workflow | Accepted |
| [ADR-0002](ADR-0002-tenant-base-domain-single-source.md) | Configuration is the single source of the tenant base domain | Accepted |
| [ADR-0003](ADR-0003-attendance-location-capture-is-mandatory.md) | Attendance location capture is a platform mandate | Accepted |

## Relationship to Obsidian

The narrative around a decision — the discussion, the options explored, the
client conversation — belongs in Obsidian (`05 - Decisions/`). The **settled
decision and the rules it creates** belong here, in the repository, next to the
code it governs.
