---
aliases: [Pending Verification]
type: framework-knowledge
last_verified: 2026-08-30
---

# Pending Verification

Things discovery **could not settle**, why they matter, and where the next
attempt should start. Nothing here is a finding; a finding goes to
[[known-gaps]] or [[contradictions]] once it is established.

The distinction is the point of this note. An unverified suspicion recorded as a
fact is worse than no note at all, because the next reader spends their time
disproving it instead of investigating something real.

---

## Does any UI offer SLA configuration a tenant cannot save?

**Why it matters.** `SlaRule` is read but never written, and `SlaPolicy`,
`SlaMilestone` and `SlaEscalationLevel` have no call sites at all
([[known-gaps]]). If a settings screen presents SLA configuration, a tenant can
be shown controls whose values cannot persist — which is a bug record, not a
gap. If nothing exposes it, the models are simply unbuilt.

**Attempted.** Prisma call-site analysis across `services/api/src` and
`services/api/prisma`. Not attempted in the frontends.

**Where to start.** Search `apps/web/app/(authenticated)/settings/` and the
runtime module registry in `apps/web/lib/runtime/modules/` for an SLA adapter,
then drive the screen. Note that making a hidden screen reachable exposes code
that has never run — test the actions, not that it renders.

## Is `Timesheet.processingCycleId` read anywhere as if it were populated?

**Why it matters.** `ProcessingCycle` has no writer, so the column is always
null. Code that branches on it takes one path forever, and a null-safe branch
that silently skips a locking check would not announce itself.

**Attempted.** Established that nothing creates a `ProcessingCycle`. Did not
trace every read of the foreign key on `Timesheet` and `PayrollCycle`.

**Where to start.** `grep processingCycle` across `modules/timesheets` and
`modules/payroll`, and read what happens on the null branch.

## Which of the 64 non-tenant-scoped models legitimately lack `tenantId`?

**Why it matters.** 254 of 318 models carry `tenantId`. Of the 64 that do not,
some are obviously correct — `Country`, `City`, `Market`,
[[entity-identity|Identity]], the platform-side models. Others sit under
tenant-owned parents and are worth a second look: `ContractDocument`,
`ContractTemplate`, `ContractVersion`, `ContractParty`, `LegalDocument`.

**This is not a finding.** A child reached only through a tenant-scoped parent
can be correct without its own column — but "correct" then depends entirely on
every query going through the parent, and [[tenant-isolation]] records two bugs
where a partially tenant-aware file looked safe.

**Attempted.** Counted and listed them. Did not read the query layer for any of
them.

**Where to start.** `modules/contracts` and `modules/legal`. For each model, find
every query that reaches it and check whether the join is anchored on a
tenant-scoped ancestor. A single `findUnique` by bare id is the failure shape.

## Is `Plan` correctly tenant-scoped?

**Why it matters.** `Plan` carries `tenantId`, which is surprising for a
commercial catalogue concept — plans are the platform's product, not a tenant's
data. If the column is a per-tenant override mechanism that is one design; if it
is vestigial, queries filtering on it may be excluding rows they should return.

**Attempted.** Observed the column. Did not read `modules/billing` or
`modules/super-admin` plan resolution.

**Where to start.** How `PlanPrice` (which is **not** tenant-scoped) joins to
`Plan` (which is). The asymmetry between a tenant-scoped parent and a
non-tenant-scoped child is the thing to explain.

## Which of `PartnerStatus`'s 24 values are actually reachable?

**Why it matters.** [[entity-partner|Partner]]`.status` reads as two overlapping
funnels merged rather than reconciled — `INQUIRY` beside `NEW_INQUIRY`,
`APPROVED_AWAITING_AGREEMENT` beside `AGREEMENT_IN_PROGRESS`,
`AGREEMENT_DRAFTING` and `AWAITING_SIGNATURE`, `SUBMITTED` beside
`UNDER_REVIEW`. If half are unreachable, every filter and status pill built on
the enum offers states that cannot occur; if both funnels are live, there are two
partner journeys and only one is documented.

**Attempted.** Read the enum and the model. Did not trace the transitions.

**Where to start.** `modules/partners` and `modules/partner-experience` — find
every write of `status` and build the reachable set, then compare it against the
enum and against the filter options the admin partner screens offer.

## Related

[[known-gaps]] · [[contradictions]] · [[discovery-status]] ·
[[data-model-overview]] · [[tenant-isolation]] · [[domain-map]] ·
[[entity-partner|Partner]]
