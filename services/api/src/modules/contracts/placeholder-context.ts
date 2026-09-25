import { ContractType } from '@prisma/client';
import type { ContractPlaceholderDefinition } from './contracts.service';

/**
 * ADR-0020 — agreement placeholders are offered and resolved by agreement
 * context, not by the whole registry regardless of contract type.
 *
 * `ContractPlaceholderDefinition.sourceEntity` already exists and is already
 * derived once, in `placeholder()` (`contracts.service.ts`), from the key's
 * namespace (`customer.legalName` -> `customer`). This module adds the two
 * things ADR-0020 asks for on top of that existing dimension:
 *
 *   1. which source entities a *contract type* can ever hold (template
 *      authoring / publishing), and
 *   2. which of those are actually *linked* on one contract instance
 *      (generation / sending).
 *
 * Both the editor's placeholder picker and the generate/send blocking gate
 * call the same functions here, so they cannot drift the way the registry's
 * unused `allowedContractTypes` field did before this ADR.
 */

/**
 * Populated from the create step itself (`contract.*`, derived from the DTO),
 * from the platform's own profile (`platform.*`), from the contract's
 * counterparty fields (`counterparty.*`), from signing (`signature.*`), or —
 * this is the one addition beyond ADR-0020's literal four — from a
 * tenant-independent platform service-level default (`sla.*`).
 *
 * This list is not invented for this module: it reproduces
 * `assertSourceCanFillTemplate`'s pre-existing `FILLED_AFTER_SOURCE` set,
 * which already encoded "not evidence of a wrong pairing" for exactly these
 * five namespaces (see its comment, and BUG-1541). `contracts.service.ts`
 * imports this constant instead of keeping its own copy — one rule, not two
 * that can drift apart the way BUG-0011's blocked-status lists did.
 */
export const ALWAYS_AVAILABLE_SOURCE_ENTITIES = [
  'contract',
  'platform',
  'counterparty',
  'sla',
  'signature',
] as const;

const PARTNER_FAMILY_ENTITIES = ['partner'];

/*
 * `lead` belongs here, not only under `customer`: `resolveSource('lead', id)`
 * (contracts.service.ts) resolves the canonical `customer.*` and
 * `commercial.*` namespaces directly from the Lead record — a lead is the
 * prospective customer before any CustomerAccount row exists. So a
 * lead-sourced CUSTOMER_AGREEMENT legitimately offers and resolves
 * `customer.*`, and that is by design (see the code comment at that call
 * site), not the pre-conversion leak the owner's rule warns about — the
 * relationship is real, it is simply not a converted customer yet.
 */
const CUSTOMER_FAMILY_ENTITIES = ['lead', 'customer', 'commercial'];

/*
 * A tenant provisioning service order (`assertTenantServiceOrderEligible`)
 * requires an already-converted customer — `source.customerAccountId` must
 * exist, a raw lead is explicitly refused ("Convert the lead first.") — so
 * `lead` is deliberately absent here even though it is present in the
 * customer family above.
 */
const TENANT_FAMILY_ENTITIES = [
  'customer',
  'commercial',
  'tenant',
  'serviceOrder',
  'implementation',
  'integration',
  'hosting',
];

/*
 * Generic types (an NDA can be signed with a prospective partner, a lead, or
 * a customer; an amendment/renewal/termination carries forward whatever the
 * source agreement carried) are not restricted at the type level beyond the
 * always-available set — the instance-level narrowing in
 * `contractInstanceContextEntities` does the real work for them, from
 * whichever relationship the specific agreement actually links.
 */
const GENERIC_ENTITIES = [
  ...new Set([
    ...PARTNER_FAMILY_ENTITIES,
    ...CUSTOMER_FAMILY_ENTITIES,
    ...TENANT_FAMILY_ENTITIES,
  ]),
];

/**
 * Contract type -> source entities its context can ever hold, beyond the
 * always-available set. Reasoning per family is documented above the family
 * constant it points at; re-derived from how each type is actually seeded
 * and used (`seed-config.ts`'s `seedPlatformContractTemplates`,
 * `validateCounterparty`, `assertTenantServiceOrderEligible`,
 * `governing-agreement.ts`), not merely enumerated. See
 * `docs/tasks/TASK-0032-streams/WP-05-report.md` for the type table.
 */
const CONTRACT_TYPE_SOURCE_ENTITIES: Partial<Record<ContractType, string[]>> = {
  [ContractType.PARTNER_AGREEMENT]: PARTNER_FAMILY_ENTITIES,
  [ContractType.MASTER_PARTNER_AGREEMENT]: PARTNER_FAMILY_ENTITIES,
  [ContractType.COMMISSION_ADDENDUM]: PARTNER_FAMILY_ENTITIES,
  [ContractType.TERRITORY_ADDENDUM]: PARTNER_FAMILY_ENTITIES,
  [ContractType.REFERRAL_ADDENDUM]: PARTNER_FAMILY_ENTITIES,
  [ContractType.CUSTOMER_AGREEMENT]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.MASTER_SERVICES_AGREEMENT]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.SUBSCRIPTION_AGREEMENT]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.DATA_PROCESSING_AGREEMENT]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.SLA]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.STATEMENT_OF_WORK]: CUSTOMER_FAMILY_ENTITIES,
  [ContractType.SERVICE_AGREEMENT]: TENANT_FAMILY_ENTITIES,
  // Generic: NDA, ADDENDUM, AMENDMENT, RENEWAL, TERMINATION, OTHER fall
  // through to GENERIC_ENTITIES via the `?? GENERIC_ENTITIES` below.
};

export function contractAllowedSourceEntities(
  contractType: ContractType,
): Set<string> {
  const family =
    CONTRACT_TYPE_SOURCE_ENTITIES[contractType] ?? GENERIC_ENTITIES;
  return new Set([...ALWAYS_AVAILABLE_SOURCE_ENTITIES, ...family]);
}

export type LinkableContract = {
  partnerId?: string | null;
  relatedLeadId?: string | null;
  customerAccountId?: string | null;
  customerOnboardingId?: string | null;
  tenantId?: string | null;
};

/**
 * Which source entities are actually reachable on *this* agreement, given
 * what it is linked to. Narrower than `contractAllowedSourceEntities`, never
 * wider — the type table is the ceiling.
 */
export function contractLinkedSourceEntities(
  contract: LinkableContract,
): Set<string> {
  const linked = new Set<string>(ALWAYS_AVAILABLE_SOURCE_ENTITIES);
  if (contract.partnerId) linked.add('partner');
  if (contract.relatedLeadId) linked.add('lead');
  /*
   * `customer.*` resolves from a converted CustomerAccount, from a
   * pre-conversion Lead (see the family comment above), or from a
   * CustomerOnboarding row that carries its own `customer` relation —
   * `resolveSource` fills it from all three. `commercial.*` follows the same
   * three sources, plus a provisioned tenant's own commercial terms.
   */
  const hasCustomerRelationship = Boolean(
    contract.customerAccountId ||
    contract.relatedLeadId ||
    contract.customerOnboardingId,
  );
  if (hasCustomerRelationship) {
    linked.add('customer');
    linked.add('commercial');
  }
  if (contract.tenantId) {
    linked.add('tenant');
    linked.add('commercial');
    linked.add('serviceOrder');
    linked.add('implementation');
    linked.add('integration');
    linked.add('hosting');
  }
  return linked;
}

/**
 * The intersection ADR-0020 calls "an agreement instance's context": the
 * type's ceiling, narrowed to what this specific agreement actually links.
 */
export function contractInstanceContextEntities(
  contractType: ContractType,
  contract: LinkableContract,
): Set<string> {
  const allowed = contractAllowedSourceEntities(contractType);
  const linked = contractLinkedSourceEntities(contract);
  return new Set([...allowed].filter((entity) => linked.has(entity)));
}

/** How the blocking message names the missing relationship. */
const ASSOCIATION_PHRASE: Record<string, string> = {
  partner: 'a partner',
  lead: 'a lead',
  customer: 'a customer',
  tenant: 'a tenant',
  commercial: 'commercial terms',
  serviceOrder: 'a service order',
  implementation: 'an implementation plan',
  integration: 'an integration plan',
  hosting: 'hosting details',
  sla: 'service level terms',
};

export function unresolvableRequiredPlaceholders(
  definitions: ContractPlaceholderDefinition[],
  contractType: ContractType,
  contract: LinkableContract,
) {
  const context = contractInstanceContextEntities(contractType, contract);
  return definitions
    .filter(
      (definition) =>
        definition.required && !context.has(definition.sourceEntity),
    )
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      sourceEntity: definition.sourceEntity,
      message: `${definition.label} cannot be resolved because this agreement is not associated with ${
        ASSOCIATION_PHRASE[definition.sourceEntity] ?? definition.sourceEntity
      }.`,
    }));
}

/** Placeholders a template of this contract type has no business offering. */
export function outOfContextPlaceholders(
  definitions: ContractPlaceholderDefinition[],
  contractType: ContractType,
) {
  const allowed = contractAllowedSourceEntities(contractType);
  return definitions.filter(
    (definition) => !allowed.has(definition.sourceEntity),
  );
}
