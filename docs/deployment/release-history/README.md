# Release History

One record per deployment: `YYYY-MM-DD-<environment>-<short-sha>.md`

Template: [../release-report-template.md](../release-report-template.md)

These are **history** — never edited after the fact, except to update the final
verdict if a release is later rolled back.

They are the only durable record of which SHA reached which environment, because
the running system does not expose its commit
([ITEM-0010](../../backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md)).

**Empty until the first deployment.** That is a true statement about this
repository, not a placeholder — nothing has yet been deployed through this
process, and inventing a record to populate the folder would put fiction in the
one place that has to be trustworthy.

---

## Required fields

Every record carries all of these. Write `NOT_APPLICABLE — <reason>` rather than
dropping one.

```
Environment · Date · Release SHA · Source Branch · Components ·
Migration Status · Configuration Status · Deployment Sequence ·
Smoke Test Results · Monitoring/Health Results · Incidents ·
Rollback Classification · Rollback Result ·
QA Report · Backlog/Bug References · Engineering History · Final Verdict
```

---

## Release/DevOps documents deployed state; the Integrator documents Git history

They answer different questions and neither substitutes for the other:

| | Question | Owner |
|---|---|---|
| [`docs/engineering-history/tasks/`](../../engineering-history/tasks/) | How did this task run — branches, conflicts, merge, CI? | Integrator |
| **here** | **What is running, where, and did it work?** | Release/DevOps |

A merge commit is not evidence that code is serving traffic. A deployed SHA says
nothing about which conflicts were resolved to produce it. Each record links the
other; neither copies it.

---

## Only real evidence populates an outcome

`scripts/smoke-deployment.mjs` and the health checks produce the Smoke Test and
Monitoring sections. **Nothing may be pre-filled with an expected result.**

A record whose outcome fields were written before the deployment ran is not a
record of a deployment — it is a plan wearing a record's filename, and it will be
read later as evidence. Where a check could not be run, the honest entry is
`NOT_OBSERVED — <reason>`: exactly as useful, and not misleading.

The rule that governs QA runs governs these. Expected behaviour is written before
execution, results after, and the two are never merged.
