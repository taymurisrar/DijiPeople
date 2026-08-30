---
aliases: [Known Gaps]
type: framework-knowledge
last_verified: 2026-08-30
---

# Known Gaps

What discovery established is **missing or unreachable**, with the evidence for
each. A gap here is a fact about the system, not a task — the Architect decides
what the project does about it.

Measured at `2007fad`. Re-derive with `npm run knowledge:data-model`.

> Distinct from [[contradictions]], which records places where two parts of the
> implementation disagree, and from [[pending-verification]], which records
> things discovery could not settle either way.

---

## Schema without code: 13 models no code path touches

Thirteen models exist in `schema.prisma`, have migrations, and therefore exist as
tables in every deployed database — and **no code anywhere in the repository
reads or writes them**. Verified across `services/api/src`,
`services/api/prisma` (seeds included) and `scripts/`, and against the dynamic
delegate path in `modules/data/data.service.ts`, whose entity registry maps only
`employee`.

| Model | Wired into | Why it matters |
|---|---|---|
| `ProcessingCycle` | `Timesheet.processingCycle`, `PayrollCycle.processingCycle`, `BusinessUnit`, `User.lockedProcessingCycles` | Two live models carry a foreign key to it. Nothing can create one, so that key is always null — a payroll/timesheet locking concept that is modelled and absent |
| `SalaryComponent` | `Tenant.salaryComponents` | Superseded by `PayComponent`; see [[contradictions]] |
| `EmergencyContact` | `Employee.emergencyContacts` | Superseded by five denormalised fields on [[entity-employee|Employee]] |
| `EmployeeDocumentReference` | `Employee.documentReferences` | Same shape — a relation the denormalised path replaced |
| `SlaPolicy` | `SlaRule.slaPolicy`, `SlaTracking.slaPolicy` | The SLA feature is partially built; see below |
| `SlaMilestone` | `SlaRule.milestones` | As above |
| `SlaEscalationLevel` | `SlaRule.escalationLevels` | As above |
| `RefundRequest` | `CustomerAccount.refundRequests` | Billing refunds are modelled, not implemented |
| `PolicySnapshot` | `Policy.snapshots` | Policy versioning modelled, not implemented |
| `DataJobBatch` | `DataJob.batches` | Import/export batching modelled, not implemented |
| `DataMappingProfile` | `Tenant.dataMappingProfiles` | As above |
| `TimesheetMigrationResult` | `Tenant.timesheetMigrationResults` | Migration tooling residue |
| `TenantEnvironmentGroup` | `Tenant.environmentGroup`, `CustomerAccount.environmentGroups` | Grouping a customer's PROD/UAT/SANDBOX tenants is modelled, not implemented |

**What this is not.** These are not orphan tables — every one is wired into a
live model by a declared relation, so they were designed in and then not built,
rather than left behind by a deletion. And they are not free: each adds a table,
its indexes and its cascade behaviour to every migration and every backup.

**The one to look at first is `ProcessingCycle`**, because two live models hold a
foreign key to it. Any code that assumes `Timesheet.processingCycleId` is
populated is reasoning about a column that is always null.

## The SLA module is half-built

`SlaRule` is **read but never written** — `attendance` reads it; nothing in any
module or seed creates one. `SlaPolicy`, `SlaMilestone` and `SlaEscalationLevel`
are not touched at all. `SlaTracking` and `SlaEventLog` are live.

So the tracking half of SLA runs against configuration that has no way to exist.
Worth a bug record if any screen offers SLA configuration to a tenant — see
[[pending-verification]], which records that this has not been checked in the UI.

## The tenant erasure record is modelled, not implemented

`TenantErasureReceipt` has no relations and no call sites — the only model in
the schema that is isolated in both senses. [[entity-tenant|Tenant]] has a
`DECOMMISSIONING` → `DECOMMISSIONED` lifecycle and a `TenantDeletionRequest`
model that *is* used, so the receipt is the missing evidence half of a data
deletion. That is a compliance-shaped gap rather than a functional one.

## Documentation coverage

Coverage is tracked in [[discovery-status]]. The largest outstanding pieces at
the time of writing:

- **Entity notes** — a small number of the 318 models have one. [[domain-map]]
  lists every model and marks which are documented, so the gap is always
  measurable rather than estimated.
- **Screens** — no route → screen → API → entity mapping exists for any of the
  three authenticated applications.
- **APIs** — no endpoint catalogue.
- **Business processes** — the commercial journeys are covered in
  `docs/knowledge/product/`; the HR processes (hire to terminate, attendance to
  payroll, leave request to balance) are not written down end to end.
- **Modules** — 30 of the 67 API modules have a knowledge note.

## Related

[[contradictions]] · [[pending-verification]] · [[discovery-status]] ·
[[data-model-overview]] · [[domain-map]] · [[entity-tenant|Tenant]] ·
[[entity-employee|Employee]]
