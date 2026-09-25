---
ID: ADR-0020
aliases: [ADR-0020]
Title: Agreement placeholders are offered and resolved by agreement context
Status: ACCEPTED
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
---
# ADR-0020 — Agreement placeholders are offered and resolved by agreement context

## Status

Accepted — 2026-09-25, by the Architect under the owner's TASK-0032 instruction
that placeholder availability must depend on agreement type, lifecycle stage,
available relationships and template scope, through a central registry rather
than scattered UI checks.

## Context

`CONTRACT_PLACEHOLDER_REGISTRY` (`services/api/src/modules/contracts/contracts.service.ts`)
already defines each placeholder's key, label, data type, `required`,
`fallbackBehavior` and an `allowedContractTypes` field that no entry populates and
nothing reads. `GET /contracts/placeholder-definitions` returns the whole
registry, so a partner onboarding agreement template is offered `customer.*` and
`lead.*` placeholders. Unresolved required placeholders already block sending
(`assertValidContractPlaceholderValues`), and `assertSourceCanFillTemplate`
already refuses some template/source pairings (BUG-1541).

## Decision

1. **Each placeholder declares its source entity** (platform, contract,
   counterparty, signature, partner, lead, customer, tenant, commercial, …) in
   the registry. The source entity is derived from the key's namespace by one
   function, not repeated per entry.
2. **Each contract type declares which source entities its context can hold**,
   in one table keyed by `ContractType` (partner family, customer family, tenant
   provisioning family, generic). Platform, contract, counterparty and signature
   are always available.
3. **Template authoring** lists only the placeholder groups the template's
   contract type allows. A saved template that references a placeholder outside
   its type's context is refused with a message naming the placeholder and why.
4. **An agreement instance's context** is its type's allowed entities *narrowed
   to the entities actually linked* (`partnerId`, `relatedLeadId`,
   `customerAccountId`, `tenantId`, …). A required placeholder whose source entity
   is not linked blocks generation and sending with a message such as
   "Customer Legal Name cannot be resolved because this agreement is not
   associated with a customer." Optional placeholders follow their declared
   fallback (blank). Nothing ever renders `undefined`, `null` or
   `[object Object]`.
5. **Linked entities must be usable and consistent:** an inactive/terminated
   partner, an archived or lost lead, or an archived customer cannot be the
   source of a new agreement; a lead linked alongside a partner must be
   attributed to that partner.
6. **Signed content stays frozen** as today: `sendForSignature` resolves every
   non-signature placeholder into the immutable `ContractVersion`; only
   `signature.*` tokens are filled at render time from `SignatureEvidence`.

## Reasons

- The registry already exists; populating and enforcing its context dimension
  is an extension, not a second system.
- One availability function serves the editor, validation and generation, so
  they cannot drift.

## Alternatives Considered

- **Filter in the template editor only.** Rejected: templates created through the
  API, and agreements created from existing templates, would bypass it.
- **Per-placeholder `allowedContractTypes` lists.** Rejected: 18 types × ~200
  placeholders is a maintenance burden; namespace → entity → type table is three
  small declarations.

## Consequences

- Existing templates that reference out-of-context placeholders are reported by
  a validation pass rather than silently broken; publishing them again requires
  removing those tokens.
- The editor shows fewer groups for partner and tenant agreements.

## Migration / Compatibility Impact

No schema change required. Existing signed agreements are unaffected (their
content is frozen). Existing draft agreements are validated on the next generate
or send.
