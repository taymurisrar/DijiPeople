---
ID: ITEM-0131
aliases: [ITEM-0131]
Title: Production HR and payroll data has no backup: the database is on the Neon free plan
Type: INFRA
Status: PRODUCT_DECISION
Priority: P0
Severity: CRITICAL
AffectedModules: [services/api]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
RelatedBug: BUG-3110
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0131 — Production HR and payroll data has no backup: the database is on the Neon free plan

> **Architect triage, 2026-09-11 — `PRODUCT_DECISION`.** Recorded as a decision
> rather than as work because every route out of it costs money, and how much to
> spend on the durability of customer payroll data is the product owner's call,
> not an agent's. The engineering half is small once the plan question is
> answered.

## Summary

The 2026-09-10 technical audit made "raise Neon history retention to the plan
maximum and protect the production branch" one of its five P0 actions, and
described it as "two settings". Measured directly against the Neon control plane
on 2026-09-11, that is not what is available.

The project is on the Neon **free** plan (`free_v3`). Six-hour history retention
is not a setting somebody left low — it is the free plan's maximum. Branch
protection is not offered on that plan at all. Neither remedy the audit proposed
can be applied, and the underlying exposure is worse than the audit's framing
implies: production HR and payroll data for every tenant has no backup of any
kind beyond a six-hour restore window that has never been tested.

## Why It Matters

Three separate failures are currently unrecoverable, and one of them is routine:

- **A bad migration or a bad delete discovered the next morning.** Six hours of
  history does not reach yesterday evening. This is the ordinary case, not the
  exotic one.
- **Loss of the Neon project or branch.** The production branch is unprotected,
  so nothing at the provider level prevents its deletion, and there is no copy
  anywhere else.
- **A single tenant asking to be restored.** There is no per-tenant restore
  capability at any plan level; that has to be built, and it needs a backup to
  build on.

This is the platform's largest single operational exposure. It is larger than the
leaked credential in [[BUG-3110]], because the credential can be rotated in
minutes and this cannot be fixed after the fact at all.

## Evidence

Read from the Neon API on 2026-09-11, project `wispy-dream-20751252`:

```
plan                        free_v3
history_retention_seconds   21600      (6 hours)
branch production           br-snowy-mud-am2378xn
  default                   true
  protected                 false
```

Both remedies were then attempted against the live API rather than inferred from
the plan tier. Setting `protected: true` on the production branch returns:

```
BRANCHES_PROTECTED_LIMIT_EXCEEDED
You have reached the maximum number of protected branches for your current
plan. To protect this branch, either upgrade your plan or reduce the number of
existing protected branches.
```

There are no protected branches to reduce. The free plan's allowance is zero, so
this is not a quota that housekeeping can free — it is the capability being
absent. Raising `history_retention_seconds` from 21600 to 86400 was likewise
refused.

So the audit's "two settings" are two API calls that cannot succeed, and acting
on its advice without checking would have produced two errors and a P0 believed
to be handled.

The audit's own supporting files are `raw/INF.md` (INF-02, INF-09) and section 10
of `00-EXECUTIVE-AUDIT-REPORT.md`. Their conclusion stands. Their proposed remedy
does not.

## The decision

Three routes, in increasing order of cost and safety. They are not exclusive —
the third is worth doing regardless of the first two.

1. **Upgrade the Neon plan.** Buys longer history retention and branch
   protection. Smallest change, recurring cost, and it still leaves every copy of
   the data inside one provider account.
2. **Stand up an off-Neon backup.** A scheduled `pg_dump` to object storage that
   the platform already has, since durable object storage landed on 2026-09-10.
   Independent of the provider, which is the property that matters when the
   failure is the account rather than the database.
3. **Test a restore.** Whatever is chosen, an untested backup is a belief rather
   than a capability. Nobody has ever restored this database.

The recommendation is 2 and 3 together, with 1 if the retention window matters
independently. Route 2 costs engineering time rather than subscription spend and
removes the single-provider dependency, which is the part no plan upgrade fixes.

## Notes

Worth keeping separately from the audit's text: this record exists because a
stated remedy was checked against the live control plane before being scheduled,
and the check changed the answer. The audit was right that the platform cannot
recover from data loss. It was wrong about why, and acting on its two settings
would have produced two failed API calls and a false sense that the P0 was
handled.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3110]]
- Modules — [[api-architecture]]

<!-- GRAPH:END -->
