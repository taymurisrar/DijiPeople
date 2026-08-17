---
SCENARIO_ID: QA-DEPLOY-012
aliases: [QA-DEPLOY-012]
TITLE: Record status, disposition and evidence agree
AREA: deployment-release
MODULE: scripts
TYPE: DEPLOYMENT_SMOKE
RISK: MEDIUM
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: scripts/lib/backlog-records.mjs scripts/lib/qa-records.mjs
RELATED_BUGS: [BUG-0051]
RELATED_REGRESSIONS: [REG-050]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-DEPLOY-012 — Record status, disposition and evidence agree

## Preconditions

A populated `docs/bugs/`, `docs/backlog/items/` and `docs/qa/`.

## Why this scenario exists

Every view the project reads — `open.md`, the dashboards, the Engineering
Control Center, a future `BACKLOG_PRECHECK` — is generated from record
frontmatter. So a record whose status and disposition disagree does not stay a
tidiness problem: it becomes a wrong number on a dashboard someone plans from.

The original failure was that the checks validated *vocabularies* and not
*semantics*. Every individual field was a legal value, so 43 terminal records
carrying nonterminal dispositions passed cleanly, five `READY` items were
dispositioned `DEFER`, and the product-decisions view rendered empty while an
item sat in that state.

## Steps

1. `npm run backlog:check`
2. `npm run qa:check`
3. `npm run validate:framework`

## Expected Result

All three pass, and a record cannot reach a terminal status while carrying a
nonterminal disposition, omitting its regression, or missing a mandatory body
section.

## Negative Case

All four rules fired on real edits during TASK-0005 remediation, each blocking
the index rebuild until the record was corrected:

```text
terminal Status VERIFIED requires ArchitectDisposition DONE, got FIX_NOW
Status VERIFIED requires RegressionId so the fix has durable regression coverage
missing required section "## Proposed Resolution"
required section "## Resolution" is out of order
REG-049: active regression has no reusable QA scenario
```

## Notes

`FIXED` is deliberately **not** in the terminal set. The documented lifecycle
defines it as "code changed — not yet proven by QA", and `docs/bugs/README.md`
calls `FIXED → VERIFIED` "the step most often skipped". Counting a `FIXED` bug
as still open is therefore correct behaviour, not a miscount — it is what keeps
an unverified fix visible. Three records were sitting in exactly that state and
were retested and promoted rather than quietly reclassified.

## Related Items

[[BUG-0051]] · [REG-050](../regressions/index.md) · [[TASK-0005]]
