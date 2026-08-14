# 06 - Implementation Plans

ExecPlans, as defined by `PLANS.md` in the repository.

Use `99 - Templates/Implementation Plan.md`.

Naming: `ExecPlan — <feature> (<YYYY-MM-DD>).md`

## When a plan is required

New modules · cross-module features · meaningful migrations ·
authentication/authorization changes · payroll logic ·
attendance/reconciliation logic · tenant provisioning · integrations ·
large refactors · architecture changes.

`PLANS.md` is authoritative on this list and on the plan's contents.

## Rules

- A plan is written by the **Architect** role, verified against the repository
  with file-path evidence, and approved by a human **before** implementation
  starts.
- Every task carries exactly one label: `PARALLEL_SAFE`,
  `DEPENDENCY_BLOCKED` or `INTEGRATION`. All three lists must appear
  explicitly, even when one is empty.
- If reality diverges during implementation, **update the plan and say so**.
  A silently abandoned plan is worse than no plan.
- Keep completed plans. They are the implementation history — the record of
  what was intended, what changed, and why.
- Durable *decisions* a plan produced become ADRs in the repository at
  `docs/decisions/`.
