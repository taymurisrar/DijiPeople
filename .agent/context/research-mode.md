# External research — bounded, sourced and attributed

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** .agent/context/failure-adaptation.md, .agent/context/question-protocol.md, docs/knowledge/, .agent/agents/integration.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

There is no Research agent. Every specialist may enter `EXTERNAL_RESEARCH_MODE`
when its own discipline hits something the repository cannot answer, because the
question is always domain-shaped: Integration needs a provider's actual
behaviour, Database needs a Postgres locking guarantee, Security needs current
guidance. Handing that to a generalist loses the context that makes the answer
useful.

---

## When it is warranted

- library or framework behaviour is genuinely uncertain;
- a provider's real capability is unknown;
- security guidance is unclear or has moved;
- the technology changed recently enough that memory is unreliable;
- an error message is unrecognised;
- two sources of documentation conflict;
- an architecture choice needs current evidence rather than recollection.

And one negative case worth stating: research is **not** the first response to a
failure. It is the response to a failure whose *correct method is unknown* —
which usually means the failure budget has already been spent.

---

## Order of evidence

```
1. repository evidence          what this codebase already does
2. local experiment             run it and observe
3. official vendor docs         the provider's own current documentation
4. standards and specifications RFCs, W3C, SQL standard
5. maintainer repository        issues, changelogs, source
6. high-quality technical write-ups
7. community evidence           last, and never alone
```

The first two outrank everything below them. A local experiment that settles the
question in ninety seconds beats an afternoon of reading, and it produces
evidence about *this* repository rather than a generic one.

---

## Bound it

**Initial budget: three to five authoritative sources.** Stop as soon as the
evidence is sufficient — sufficiency is when the next source would not change
the decision, not when the reading feels complete.

Research that exceeds its budget without converging is itself a finding: the
question is probably ambiguous, or it is a `USER_DECISION_REQUIRED` wearing a
technical costume. Raise it under the question protocol rather than reading
further.

---

## Record what was found

| Field | |
|---|---|
| `RESEARCH_QUERY` | What was actually asked |
| `SOURCE` | Where the answer came from |
| `SOURCE_DATE` | When that source was published or last updated |
| `AUTHORITY` | Which tier above |
| `FINDING` | What it says |
| `REPOSITORY_IMPACT` | What that means *here* |
| `DECISION` | What was done about it |

`SOURCE_DATE` is not optional. Most bad research findings in this domain are
correct answers to a version of the question that stopped being current.

---

## Attribution is not decoration

Every claim carries its provenance:

| | |
|---|---|
| `REPOSITORY_FACT` | Verified by reading this repository |
| `WEB_RESEARCH` | From an external source, with the source named |
| `INFERENCE` | Reasoned from the above, and therefore possibly wrong |
| `USER_DECISION` | Settled by the user, with the ADR named |

These get confused in exactly one direction: an inference gets reported as a
repository fact, and the next agent builds on it without re-checking. Keeping
them distinct is what makes a later reader able to tell which claims still need
verifying.

**Never invent a live provider capability from repository code.** That the code
calls an endpoint proves the code calls it, not that the provider supports it in
the account, plan and mode being used. Integration records
`LIVE_CAPABILITY_STATUS` — `VERIFIED`, `UNVERIFIED`, `UNSUPPORTED` or
`BLOCKED_EXTERNAL` — and `UNVERIFIED` is an honest answer.

---

## Where a finding lands

A finding that changes how DijiPeople should be built belongs in
`.agent/context/` or `docs/knowledge/`, not in a chat message and not only in the
task report. A finding that settles a recurring decision belongs in an ADR.

The test: would a future agent hitting the same uncertainty find it? If the
answer is no, it has not been recorded yet.
