---
ID: ADR-0027
aliases: [ADR-0027]
Title: Human-readable platform numbers come from one configurable, transactional sequence service
Status: ACCEPTED
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
---
# ADR-0027 — Human-readable platform numbers come from one configurable, transactional sequence service

## Status

Accepted — 2026-10-07, for [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]]. Plan:
EXECPLAN-0055.

## Context

The API builds a dozen kinds of human-readable numbers in a dozen different
ways:

- `max+1` without a lock, for tenant codes;
- `count+1`, for attendance corrections and payslips;
- the current date plus a random suffix, for invoices, contracts, support cases
  and partner codes. Partner codes come in two formats.

No generic sequence service, counter table or database sequence exists. The
Admin "Invoice defaults → Numbering" page saves nothing.

## Decision

1. **The table.** `PlatformNumberSequence` is a platform-scope table with one
   row per numbered concept. Its columns are:
   - `key`, which is unique;
   - `prefix`, `separator`, `suffix` and `padding`;
   - `nextValue`;
   - `resetPolicy`, which is fixed at `NEVER` until a real business need for
     resets exists.
2. **Allocation.** `PlatformNumberingService.next(key, tx)` increments
   `nextValue` atomically, with `UPDATE … RETURNING`, inside the caller's
   transaction:
   - concurrent callers serialise on the row lock;
   - a rollback releases the number;
   - duplicates are impossible.
3. **Who can change what.**
   - The number is generated only on the server, and the record stores it as
     immutable.
   - In Admin Settings → Numbering, an operator can edit the prefix,
     separator, suffix and padding, with a live preview.
   - The next number may only be raised, never lowered, so it can never reuse
     a number already issued.
   - Every change is audited.
4. **Rollout.**
   - Partners are the first consumer: `partnerNumber`, as `PART-000001`.
   - Other numbered entities can adopt the service one by one.
   - Their existing formats remain valid as historical values.

## Reasons

- A row lock inside the caller's transaction is the simplest scheme that is
  both gap-tolerant and duplicate-free in PostgreSQL.
- The sequence lives at platform scope because partners, customers and invoices
  are platform concepts. Tenant numbering, such as employee codes, keeps its
  tenant-settings mechanism.

## Alternatives Considered

- **PostgreSQL `SEQUENCE` objects.** Rejected: they cannot be configured per
  row, and they need DDL to create.
- **`max+1` with retries.** Rejected: it is race-prone and its cost grows with
  table size.
