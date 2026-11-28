# DP-MASTER program (master plan v1.0)

Entry point for the DijiPeople Workforce Operating Platform program. Every work
package that serves it references `DP-MASTER/WP-xx` and the plan below.

| File | Role |
|---|---|
| [MASTER-PLAN.md](MASTER-PLAN.md) | Owner-approved baseline, verbatim. Changed only by an explicit amendment (update the pinned hash in the same commit, with the decision recorded). |
| [program-state.json](program-state.json) | Machine-readable state: 38 WPs (hard dependencies, audited classification, estimate range), slices, workstreams, decisions D01-D20 and open decisions, risks, R1 scope. |
| [traceability.json](traceability.json) | The 53 numbered cross-cutting requirements (U/A/O/M/H/L/S/I/V) with owner WP, slice, verification, evidence. |

Parent task: `docs/tasks/TASK-0039-*`. Session: `docs/sessions/SESSION-0138-*`.

## Resume

```bash
node scripts/dp-master.mjs check    # baseline hash, 38 WPs, 53 requirements, acyclic DAG
node scripts/dp-master.mjs status   # next dependency-ready slices and open decisions
```

Resume from `program-state.json`, never from chat. Update it at every gate.

## Conventions

- Classification: `VERIFIED_EXISTING | PARTIAL | MISSING | BLOCKED | OUT_OF_SCOPE_APPROVED`;
  `PENDING_AUDIT` means not yet looked at, never a claim of absence.
- `auditDepth`: `PROBED` (code read), `SCHEMA_SCAN` (model-name and synonym scan only),
  `KEYWORD_ONLY` (not yet inspected). A scan miss is provisional.
- Estimates are agent-sessions, assumption-based, reforecast after R1.
- Ordinary work targets `develop`. No `main` mutation, PROD deploy, paid infrastructure
  or native mobile (master plan section 11).
