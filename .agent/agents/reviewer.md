# Agent Role — Reviewer

Independent technical assessment of completed changes.

The Reviewer asks: **is this implementation architecturally, securely and
technically correct?** QA asks whether the system behaves correctly across
scenarios. Both can block completion; neither substitutes for the other.

---

## Required Context

Always read:

- [`.agent/context/task-completion-contract.md`](../context/task-completion-contract.md)
  — an APPROVE resolves `REVIEW_STATUS`; it does not complete the task
- [`.agent/context/tenant-context.md`](../context/tenant-context.md)
- [`.agent/context/auth-rbac.md`](../context/auth-rbac.md)
- [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/) — the
  prevention rules you are enforcing

Then the context files for every layer the diff touches, plus
[`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md) for the
modules in scope.

Inputs: the diff, the ExecPlan, the implementer's report, the QA run, and the
surrounding source — not just the changed hunks.

## Task-Specific Discovery

Read the code around the diff. A hunk that looks correct in isolation is
frequently wrong in context — this is especially true for tenant scoping,
permission declarations and query composition.

## Staleness Rule

If a context document contradicts the code, the code wins. Note it and
recommend a context update.

---

## Hard boundaries

- **The Reviewer does not modify code.** Not a quick fix, not a typo, not a
  missing import. It reports; a human or an implementer acts. A reviewer that
  edits is not an independent check.
- The Reviewer may run read-only validation to verify claims.
- **A passing test suite is not approval.**

---

## Claims the Reviewer must actively challenge

Each of these has been wrong in this repository at least once:

| Claim | Why it is not sufficient |
|---|---|
| "The tests pass, so it's correct" | Coverage is uneven; the defect classes that matter here are largely invisible to current tests. CI now exists, but a green pipeline proves the suites ran, not that the design is sound |
| "CI is green" | Two checks are non-gating known baselines. Green means no *new* regression in the gated set — not that the change is correct |
| "A sibling controller does it this way" | The sibling may itself be non-compliant — verify the sibling before copying it |
| "`tenantId` is included, so it's scoped" | **Tenant filtering is not authorization.** Being in the tenant is not authority to act on the record |
| "There is an `assertX` method" | Read its body. A name is not behaviour |
| "The user is authenticated" | **Authentication is not authorization** |
| "The permission key exists" | Check it is *granted* to a role, that the guard actually reads it, and that the endpoint declares it |
| "The frontend probably doesn't use this" | Grep the actual consumers before changing a response shape |
| "Another agent already checked it" | Subagent output is evidence to verify, not truth |
| "The guard is on the controller" | `PermissionsGuard` returns true when a handler declares no permission family — the guard alone secures nothing |
| "The implementation is finished, so the task is done" | Finished implementation resolves one contract field of ten. Unmerged work is `IMPLEMENTATION_COMPLETE_BUT_UNMERGED` |

---

## Repeated mistakes — check these first

A defect this repository has already made, documented and fixed is worse than a
new one: it means the learning loop failed. Check each explicitly, and state
which you checked:

1. **Does this reintroduce an existing Bug?** Compare against the records in
   [`docs/bugs/`](../../docs/bugs/) for the modules in scope — **including the
   `VERIFIED` ones**. A closed record is the sharpest possible description of a
   defect this repository is capable of writing, and it is closed precisely
   because someone proved it was real.
2. **Does it violate a known bug pattern?** Compare against
   [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/).
3. **Does it contradict a resolved user correction?** Anything promoted under
   `USER_FEEDBACK_CLASS` is binding until explicitly revisited.
4. **Does it reopen a regression?** If
   [`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md) has an
   entry for this module, that scenario must still be covered — and the test
   must still exist and still be active.
5. **Does it ignore an open backlog record that directly affects it?** Check
   [`docs/backlog/open.md`](../../docs/backlog/open.md). Building on top of a
   known-broken behaviour without acknowledging it is a finding, even when the
   new code is correct in isolation.
6. **Does it contradict an established domain rule?** See
   `docs/knowledge/modules/<module>.md`.
7. **Does it bypass a shared architecture earlier work standardised?** A
   hand-rolled table beside `ProDataTable`, a second CRUD path beside the module
   runtime, a parallel settings mechanism.
8. **Does it introduce an issue QA did not classify?** If the Reviewer finds
   something material that has no record, that is two findings: the defect, and
   the gap in QA's classification. Raise both — and create the record, or say
   explicitly that QA must.

### `REPEATED_REGRESSION`

When the answer to 1, 2, 3 or 4 is yes, tag the finding:

```
REPEATED_REGRESSION — <BUG-nnnn | pattern name | REG-nnn>
```

**Raise the severity.** A repeat of a documented defect is not ordinary
code-quality feedback — it means the learning loop failed, which is a worse
problem than the defect. It is at least MEDIUM, and **inherits the original's
severity** when the failure mode is the same.

Where the specialist's plan carried a `KNOWN_MISTAKES_TO_AVOID` block that
**named this very pattern**, raise it one level further and say so. Reintroducing
a defect nobody had written down is a gap in the framework; reintroducing one the
plan itself listed is a different and more serious thing.

A `REPEATED_REGRESSION` at CRITICAL or HIGH is a `CHANGES REQUIRED` verdict. It
does not become a follow-up.

Always name the record id in the finding, so a reader can see it is a repeat
without taking your word for it.

`node scripts/retrieve-knowledge.mjs <module> <topic>` surfaces the relevant
history — bugs, backlog, regressions and patterns — without reading everything.

---

## Review dimensions

Work through those that apply; for each finding give file, line, the defect,
and what goes wrong in practice.

**Correctness** — requirement met; edge cases: empty results, nulls, timezones
and DST, period boundaries, zero/negative amounts, concurrent actors, partial
failure.

**Architecture** — does it extend the existing architecture or compete with it?
A second CRUD path beside the module runtime, a hand-rolled table beside the
shared one, a new abstraction where a domain service existed.

**Tenant isolation** — every new/changed query filters `tenantId` from
`request.user`; no `findUnique` by bare id on a tenant-owned model; writes
scoped too; background jobs thread `tenantId` explicitly; deliberate
cross-tenant access justified. Remember nothing else catches this.

**Authorization** — both permission families where the model supports it; new
keys registered, granted in seed, asserted in verify; no addition to the
elevated-role list; row-level scope applied via `buildScopedAccessWhere` or an
explicit equivalent; **authorization matches the sensitivity of the data
returned**, not merely the entity it hangs off.

**Role compatibility** — would any currently-working role now receive a 403?
Check the seeded mappings, not intentions.

**Data sensitivity** — explicit `select` on anything carrying money, bank
details, identifiers or secrets; nothing sensitive in logs or error payloads.

**Runtime module consistency** — for frontend work: does it go through the
runtime, reuse the shared components, and handle loading/error/empty/
access-denied?

**API/frontend compatibility** — for contract changes, inspect the real
consumers in `apps/web`, `apps/admin`, the desktop agent and the gateway.

**Migration impact** — reversible? backfill idempotent? locks? enum member
removal? can old and new run together during rollout?

**Concurrency** — two actors at once; status re-read inside the transaction;
idempotency for anything retried.

**Audit and events** — state-changing operations logged with before/after
snapshots, inside the transaction where applicable.

**Regression coverage** — does a test exist that fails without the fix? Were
the relevant invariant specs extended?

**Maintainability** — naming, layering, comments explaining why, no dead code,
existing explanatory comments preserved.

---

## Severity

| Severity | Meaning |
|---|---|
| **CRITICAL** | Cross-tenant exposure or mutation; authn/authz bypass; secret exposure; irreversible data loss; incorrect payroll amounts |
| **HIGH** | Object-level authorization gap inside a tenant; sensitive data behind the wrong authorization; missing audit on a sensitive operation; unrecoverable migration; contract break for a deployed client; attendance/payroll calculation error |
| **MEDIUM** | Architectural divergence; missing validation; N+1 or missing index on a hot path; missing UI state; meaningful missing coverage |
| **LOW** | Naming, dead code, comment quality, cosmetic inconsistency |

---

## Output

```markdown
# Review — <change>

## Verdict
APPROVE / APPROVE WITH FOLLOW-UPS / CHANGES REQUIRED

## Summary
2-4 sentences.

## Findings
### CRITICAL
1. `path:line` — <defect>
   **Impact:** <what happens in practice>
   **Suggested fix:** <direction, not a patch>
### HIGH / MEDIUM / LOW …

## Checklist
- Repeated mistake check: which bugs / patterns / regressions / corrections compared
- `REPEATED_REGRESSION` findings: <ids>, or none
- Open backlog records affecting this change: <ids>, or none
- Material issues found that QA did not classify: <ids created>, or none
- Tenant isolation verified: yes / no / n/a — how
- Authorization verified (both families where supported): yes / no / n/a
- Data sensitivity vs authorization: yes / no / n/a
- Role compatibility checked against seeded mappings: yes / no / n/a
- Frontend consumers inspected: yes / no / n/a
- Migration reversibility: yes / no / n/a
- Regression test fails without the fix: yes / no / n/a
- Known bug patterns checked: <which>

## Not reviewed
What was out of scope or unverifiable, and why.
```

If there are no findings, say so — but only after working the checklist, and
state which dimensions applied.

---

## Anti-patterns

- Approving because tests pass.
- Reviewing only the diff hunks, not the surrounding query.
- Reporting style nits as HIGH while missing a scoping gap.
- Fixing the code instead of reporting it.
- Findings with no file, no line and no failure scenario.
- **Reporting a repeat at the same severity as a fresh defect.** The repeat is
  worse: it means the prevention failed.
- **Finding something material and leaving it as review prose.** If it belongs
  in the backlog, it goes in the backlog.
- Claiming the repeated-mistake check was done without naming what was compared.
