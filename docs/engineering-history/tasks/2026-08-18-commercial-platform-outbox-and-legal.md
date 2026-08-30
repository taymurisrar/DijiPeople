# Engineering History — Commercial platform: transactional outbox and legal documents

| | |
|---|---|
| **Task Title** | Commercial platform completion — WP-01 and WP-02 |
| **Task Type** | FEATURE |
| **Date** | 2026-08-18 |
| **Parent** | [TASK-0007](../../tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md) |
| **Architect Plan** | The parent record and [FINAL-PARENT-SCOPE-RECONCILIATION](../FINAL-PARENT-SCOPE-RECONCILIATION.md), both written before any code |
| **Agents Used** | Architect, Database (schema, both migrations), Backend/API (outbox, legal, consent wiring), QA (plans and scenarios), Integrator (develop integration). **Not used:** Frontend and UI/UX — no user-facing surface was added; the landing legal routes are WP-10 and were blocked behind the `workspace` lease for most of this session. Integration — no external boundary changed; the Stripe webhook was read but not modified. Release/DevOps — no deployment was authorized or attempted |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/commercial-platform-completion` |
| **Base SHA** | `c332992d8ff08d389838e53f65997839b1c69590` |
| **Reconciled onto** | `304bfda` then `4af2cf0` — two sibling sessions landed while this ran |
| **Target Branch** | `develop` — `main` untouched at `b90f33e` |
| **Session** | SESSION-0006, leases `schema`, `permissions`, `workspace` |

### Commits

```
6ebde36 feat(outbox): a transactional outbox so business state and its events commit together
7c97ff2 feat(legal): versioned legal documents, and consent that points at the text it accepted
d02ae6c chore: satisfy the framework inventory, indexes and formatting for the two new modules
78dcdb5 docs(tasks): record WP-01/WP-02 state and the resumption contract for TASK-0007
bd0fb36 chore: reconcile with develop 4af2cf0 and regenerate the control center
8008fdf test(qa): durable plans and scenarios for the outbox and legal invariants
```

## What was built

**WP-01 — transactional outbox.** `OutboxEvent` and `OutboxEventConsumption`,
migration `20260818090000`. A business change and the event announcing it commit
in one transaction; `OutboxService.emit` takes the caller's transaction client
so the unsafe version is the one you have to go out of your way to write.
Emission is idempotent on a business `idempotencyKey`; consumption is idempotent
on a unique `(event, consumer)` pair. The dispatcher claims with
`FOR UPDATE SKIP LOCKED`, leases claims so a crashed process does not strand
events, and keeps `MANUAL_ACTION_REQUIRED` distinct from retriable failure. The
worker is a PostgreSQL poll loop, off by default.

**WP-02 — legal documents.** `LegalDocument`, `LegalDocumentVersion`,
`LegalDocumentAcknowledgement` and `Subprocessor`, migration `20260818100000`.
Published versions are immutable; publishing archives its predecessor in one
transaction so two versions are never simultaneously in force. Lead and partner
inquiry now resolve the notice in force and write the acknowledgement in the
same transaction as the record it justifies.

## Decisions

1. **A poll loop over PostgreSQL rather than a broker.** This is a modular
   monolith with one database and no queue infrastructure — the notification
   "queue" is a synchronous fallback with no Redis behind it. A broker would add
   a deployable and a failure mode to solve what `SKIP LOCKED` already solves.
2. **`emit` requires the caller's transaction.** Making the atomic pairing the
   default is the entire guarantee; a convenience overload that opened its own
   transaction would quietly destroy it at the one call site that used it.
3. **Published legal text is immutable, corrections are new versions.** Editing
   published text retroactively alters what every acknowledgement is recorded
   against.
4. **`CURRENT_PRIVACY_NOTICE_VERSION` demoted rather than deleted.** It remains
   the fallback for the window before anything is published, so a pre-launch
   submission still records which wording was shown.
5. **Only tenant-scoped legal acknowledgements are erased with a tenant.**
   Company-level consent hangs off `customerAccountId`/`leadId`, is not
   tenant-owned, and survives.
6. **Fast-forward rather than `--no-ff`.** Deviates from the parent's declared
   `MERGE_STRATEGY`. Taken deliberately so the `develop` tip is bit-for-bit the
   SHA the required gate verified, rather than a merge commit no gate ever saw.

## What the framework caught

Three checks rejected work that looked finished, and all three were right:

- **The tenant-erasure invariant** re-derives the delete order from
  `schema.prisma` and failed because `OutboxEvent` and
  `LegalDocumentAcknowledgement` are tenant-owned and unlisted. Without it, the
  omission would have surfaced during a live erasure.
- **Framework validation** failed on the counted module inventory in `AGENTS.md`
  (65 vs 67), both missing module rows, stale task indexes and a stale
  Engineering Control Center.
- **QA validation** rejected an invalid `LAST_RESULT`, two scenarios outside any
  test plan, and `COVERAGE_UNIT` claimed with no unit scenario backing it.

## Validation

| Check | Result |
|---|---|
| `prisma validate` | PASS |
| api typecheck | PASS |
| api unit suite | PASS — 183 suites, 1375 tests |
| api lint | PASS on changed paths |
| framework validation | PASS — 2534 checks |
| backlog / tasks / sessions / QA checks | PASS |
| Prisma client freshness (BUG-0068) | PASS — 273 enums, 298 models, 6994 fields |
| **Database migration gate (real PostgreSQL, CI)** | **PASS** — both migrations applied to a fresh database |
| Exact-SHA required gate | recorded in TASK-0007 |

## Limitations, stated rather than glossed

- **No local PostgreSQL credential.** The server is running and accepts
  connections, but no usable credential exists in this environment or in the
  repository. Migrations were authored offline with
  `prisma migrate diff --from-schema/--to-schema` and proven by CI's migration
  gate. The concurrency and constraint behaviour in QA-BILLING-002/003 is
  designed-for, not demonstrated — both scenarios are `PASS_WITH_RISKS`.
- **No consumer is registered yet.** The outbox delivers correctly and delivers
  nothing, because the first real consumer is WP-07. This is why `OUTBOX_HANDLERS`
  defaults to an empty array rather than being wired to anything.
- **No emitter is wired yet either.** `DomainEventType` names 24 transitions; the
  services that will emit them are WP-05 through WP-08.
- **The parent is not complete.** 38 engineering requirements remain — 12
  `PARTIAL`, 26 `NOT_STARTED`. See the final reconciliation.

## Follow-up

WP-04 (active-employee seat engine) is the next ready package and is named in the
parent's resumption contract. WP-03 is deliberately sequenced after it: roots
before leaves.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0068]] · [[QA-BILLING-002]] · [[SESSION-0006]] · [[TASK-0007]]

<!-- GRAPH:END -->
