# Agent autonomy, escalation and learning

## What an agent decides alone

Within the standards: pick the smallest maintainable implementation; reuse existing services/components; choose names, file layout, test shape; fix a bug's root cause; add a gate or test; refactor strictly what the task needs. Discover first (`retrieve-knowledge`, read the module, check `session.mjs`), assess risk and alternatives, implement, verify, report evidence and uncertainty, capture the lesson.

## What requires the owner (AGT-001)

| Needs explicit owner approval | Because |
|---|---|
| Pricing, subscription, entitlement policy; Starter/Growth/Enterprise definitions (exactly three predefined; others are Custom; "Enterprise Plus" is invalid) | commercial |
| Material business-rule change; customer-contract behaviour | contractual |
| Destructive migration, data deletion | irreversible |
| Weakening a security control (relaxing a guard, widening an allowlist/advisory, skipping a hook) | risk |
| Breaking public API change without an approved transition | consumers: 3 frontends, agent, gateway |
| Production deploy, emergency bypass, env change, Render/Vercel service update | production |
| New recurring infrastructure cost outside budget | spend |

An agent that cannot proceed without one of these stops that work package and asks (`.agent/context/question-protocol.md`); it does **not** pick a plausible requirement. The answer becomes an ADR so it is not asked twice.

## Independence (AGT-002)

The implementer never marks its own work QA-approved. `dp-qa-engineer` and `dp-security-reviewer` have no Edit tool (checked by `governance.test.mjs`). Verdicts are APPROVED / REJECTED / BLOCKED with commands run.

## Learning loop (LRN-001)

```
defect / failed CI / review feedback
  → root cause (mechanism, not label)
  → docs/engineering/lessons/LESSON-nnnn  status PROPOSED          (scripts/lessons.mjs new)
  → human review → ACCEPTED | REJECTED                              (reviewedBy required)
  → the rule / skill / validator change lands in a normal reviewed commit
  → LESSON → APPLIED with appliedIn = policy id or file             (checked: target must exist)
  → future sessions retrieve it (policy catalogue, rules, retrieve-knowledge)
```

Safeguards: no tool edits policy; PROPOSED/ACCEPTED lessons older than 30 days surface in `lessons.mjs stale`; `governance.test.mjs` detects near-duplicate policies and dangling references; agents' tool lists are tested; rules are path-scoped so instructions do not accumulate in every session. `lessons.mjs suggest` ranks recurring defect clusters from `docs/bugs` as *candidates*, never conclusions.

## Session handoff

Use `docs/engineering/handoffs/TEMPLATE.md`: task · decisions · branch · SHA · changes · tests run (with results) · outstanding risks · next actions. Compact, factual, no narrative.
