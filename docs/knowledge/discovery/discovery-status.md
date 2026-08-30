---
aliases: [Discovery Status]
type: framework-knowledge
last_verified: 2026-08-30
---

# Discovery Status

What the knowledge base actually covers, so nobody assumes the platform is
documented because a folder is full. **Coverage is understanding, not file
count** — a note per model would not make this table green.

Measured at `2007fad`. The data-model column is generated: [[domain-map]] marks
every one of the 318 models as documented or not, so that figure is never an
estimate.

---

## By domain

| Domain | Models | Schema | Backend | UI | Processes | Security |
|---|---|---|---|---|---|---|
| Identity | 13 | **Partial** — [[entity-user]], [[entity-identity]] | Good — [[auth]], [[rbac]] | None | None | **Good** |
| People | 15 | **Partial** — [[entity-employee]] | Good — [[employees]], [[organization]] | None | None | **Good** |
| Time | 42 | None | Partial — [[attendance]], [[leave-attendance-approvals]] | None | None | Partial |
| Pay | 53 | None | Partial — [[payroll]] | None | None | Partial |
| Talent | 26 | None | None | None | None | None |
| Governance | 12 | None | Partial — [[approvals]], [[audit-and-events]] | None | None | Partial |
| Commercial | 68 | None | Good — [[leads]], [[partners]], [[contracts-and-agreements]], [[billing]], [[legal]], [[customers]] | None | **Good** — [[commercial-onboarding-journey]] | Partial |
| Configuration | 33 | None | Partial — [[settings]] | None | None | Partial |
| Messaging | 7 | None | Good — [[notifications]] | None | None | Partial |
| Platform ops | 29 | **Partial** — [[entity-tenant]] | Good — [[platform-admin]], [[tenant-provisioning]], [[tenant-control-plane]], [[outbox]] | None | **Good** — [[tenant-lifecycle]] | **Good** |
| Unattributed | 20 | Recorded in [[known-gaps]] | — | — | — | — |

**"Good"** means somebody could act on it without reading the source first.
**"Partial"** means the note exists and is incomplete or narrow. **"None"** means
nothing is written down.

## By discovery phase

| Phase | State |
|---|---|
| 1 — Repository mapping | **Good.** 21 notes in `docs/knowledge/architecture/`, [[monorepo-application-map]] |
| 2 — Schema discovery | **Started.** [[data-model-overview]], [[domain-map]] (all 318 classified), entity notes for the identity/tenant spine |
| 3 — Domain classification | **Good.** Generated, and checked against the module directory |
| 4 — Backend discovery | **Partial.** 30 of 67 modules have a knowledge note |
| 5 — UI discovery | **Started.** [[screen-map]] inventories all 356 screens and links the 11 runtime-declared modules to an API path and entity; the rest are bespoke and unmapped. Spot-verified against production 2026-08-30 |
| 6 — Process discovery | **Partial.** Commercial journeys covered; HR processes not written end to end |
| 7 — Security | **Good.** [[rbac]], [[tenant-isolation]], [[authentication]], [[multi-tenancy]] |
| 8 — Infrastructure | **Good.** [[deployment-architecture]], `docs/environment-variables.md` |
| 9 — Cross-linking | **Mechanised.** `npm run knowledge:verify` fails on an unresolved wikilink or an orphan |
| 10 — Validation | **Partial.** `validate-framework` checks structure; the data-model half is now checked by `npm run knowledge:data-model:check` |

## What is deliberately not here

- **The API and entity behind 318 of the 356 screens.** [[screen-map]] names
  every screen, but only 38 routes — those served by the 11 runtime-declared
  modules — carry a machine-readable link to what they read. The rest are bespoke
  pages whose data source can only be found by reading them, and guessing from a
  route name would be wrong often enough to be worse than silence.
- **An endpoint catalogue.** Nothing enumerates the API surface.
- **The 305 models without an entity note.** [[domain-map]] lists them all. The
  spine was documented first because the graph is unusable without its hub.

## How to keep this honest

Re-run `npm run knowledge:data-model` after any schema change; it regenerates
[[domain-map]] and fails when a note documents a model that no longer exists.
Update the phase table when a phase genuinely moves — not when files are added.

The failure this note exists to prevent has a name: **claiming coverage because
every file was scanned.** A count of notes is not a measure of understanding.

## Related

[[known-gaps]] · [[contradictions]] · [[pending-verification]] ·
[[data-model-overview]] · [[domain-map]] · [[glossary]]
