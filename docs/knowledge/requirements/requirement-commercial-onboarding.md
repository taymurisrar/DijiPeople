# Requirement — Commercial Onboarding

> **Source type: `INFERRED_FROM_IMPLEMENTATION`.**
>
> No written requirement document exists in this repository. What follows is the
> behaviour the code enforces and the 2026-08-15 QA run verified, reconstructed
> as requirements. **It is not product intent** — intent lives in the
> hand-written folders of this vault, which no agent writes to. Where the two
> disagree, the hand-written note records what was wanted and this one records
> what was built.

## Scope

A prospect must be able to arrive from the public website, be qualified, sign an
agreement, become a customer, be onboarded, and have a tenant provisioned for
them — without any step being skippable.

## Enforced requirements

Each is verified by a QA scenario on 2026-08-15.

| # | Requirement | Evidence |
|---|---|---|
| R1 | A public lead submission sets `source`, `status` and `attributionStatus` **server-side**; a client cannot supply them | A1.01, A1.07 |
| R2 | Honeypot submissions are silently dropped — no row, no id leaked | A1.08 |
| R3 | Conversion is refused without an **executed governing agreement**, and the refusal is recorded | A4.04 |
| R4 | An executed agreement is immutable, because the conversion gate matches on its columns | A5.21, BUG02.06 |
| R5 | Signature evidence is hash-chained and attributable — document hash, signer, IP — and re-signing is idempotent | A5.18, A5.19 |
| R6 | Conversion creates exactly one customer and seeds an onboarding that is immediately editable | A6.01, A6.06, A8.x |
| R7 | A converted lead is terminal and read-only | C5.01, C5.02 |
| R8 | Provisioning is refused while readiness fails, and leaves no partial tenant | A10.01, A10.02 |
| R9 | A tenant cannot be activated without an **active** owner — `INVITED` does not count | A15.01, A16.01, A16.05 |
| R10 | A plan-excluded module cannot be enabled by override | A14.02 |
| R11 | Every lifecycle change requires a reason; illegal transitions are refused | A16.03, A16.04 |

## Requirements that are enforced but undecided

- **Duplicate website leads produce two rows**; duplicate partner enquiries
  produce one. Which is intended is genuinely open — [[ITEM-0007]].
- **A customer carries no origin channel**, though it does carry partner
  attribution. The asymmetry is undecided rather than designed —
  [[ITEM-0008]].

## Not yet satisfiable

R9 has never been *satisfied* in a test, only refused — activation to `ACTIVE`
has never been reached, blocked by [[BUG-0015]]. See [[ITEM-0004]].

## Related

[[commercial-onboarding-journey]] · [[requirement-lead-conversion]] ·
[[leads]] · [[customers]] · [[customer-onboarding]] · [[tenant-provisioning]]
