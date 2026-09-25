import { ContractType } from '@prisma/client';
import {
  ALWAYS_AVAILABLE_SOURCE_ENTITIES,
  contractAllowedSourceEntities,
  contractInstanceContextEntities,
  contractLinkedSourceEntities,
  outOfContextPlaceholders,
  unresolvableRequiredPlaceholders,
} from './placeholder-context';
import type { ContractPlaceholderDefinition } from './contracts.service';

function definition(
  key: string,
  overrides: Partial<ContractPlaceholderDefinition> = {},
): ContractPlaceholderDefinition {
  return {
    key,
    label: key,
    description: '',
    dataType: 'TEXT',
    sourceEntity: key.split('.')[0],
    sourceField: key.split('.').slice(1).join('.'),
    required: true,
    defaultValue: null,
    formattingRule: null,
    fallbackBehavior: 'ERROR',
    securityClassification: 'INTERNAL',
    allowedContractTypes: [],
    exampleValue: 'example',
    ...overrides,
  };
}

describe('placeholder-context — ADR-0020', () => {
  describe('contractAllowedSourceEntities', () => {
    it('always includes the platform/contract/counterparty/sla/signature namespaces', () => {
      const allowed = contractAllowedSourceEntities(
        ContractType.PARTNER_AGREEMENT,
      );
      for (const entity of ALWAYS_AVAILABLE_SOURCE_ENTITIES)
        expect(allowed.has(entity)).toBe(true);
    });

    it('BUG-3552 — a partner agreement does not offer customer/lead/tenant groups', () => {
      const allowed = contractAllowedSourceEntities(
        ContractType.PARTNER_AGREEMENT,
      );
      expect(allowed.has('partner')).toBe(true);
      expect(allowed.has('customer')).toBe(false);
      expect(allowed.has('lead')).toBe(false);
      expect(allowed.has('tenant')).toBe(false);
      expect(allowed.has('implementation')).toBe(false);
    });

    it('a customer agreement offers lead — resolveSource(lead) fills customer.* directly', () => {
      const allowed = contractAllowedSourceEntities(
        ContractType.CUSTOMER_AGREEMENT,
      );
      expect(allowed.has('lead')).toBe(true);
      expect(allowed.has('customer')).toBe(true);
      expect(allowed.has('commercial')).toBe(true);
      expect(allowed.has('partner')).toBe(false);
    });

    it('a tenant provisioning service order offers tenant/implementation/hosting but never lead', () => {
      const allowed = contractAllowedSourceEntities(
        ContractType.SERVICE_AGREEMENT,
      );
      expect(allowed.has('tenant')).toBe(true);
      expect(allowed.has('implementation')).toBe(true);
      expect(allowed.has('hosting')).toBe(true);
      expect(allowed.has('serviceOrder')).toBe(true);
      // assertTenantServiceOrderEligible requires a converted customer — a
      // raw lead is explicitly refused ("Convert the lead first.").
      expect(allowed.has('lead')).toBe(false);
    });

    it('a generic type (NDA) is not restricted beyond the always-available set', () => {
      const allowed = contractAllowedSourceEntities(ContractType.NDA);
      expect(allowed.has('partner')).toBe(true);
      expect(allowed.has('lead')).toBe(true);
      expect(allowed.has('customer')).toBe(true);
      expect(allowed.has('tenant')).toBe(true);
    });
  });

  describe('contractLinkedSourceEntities', () => {
    it('links nothing beyond the always-available set when no relationship is linked', () => {
      const linked = contractLinkedSourceEntities({});
      expect(linked.has('partner')).toBe(false);
      expect(linked.has('customer')).toBe(false);
      expect(linked.has('tenant')).toBe(false);
    });

    it('links customer and commercial from a lead alone (pre-conversion)', () => {
      const linked = contractLinkedSourceEntities({ relatedLeadId: 'lead-1' });
      expect(linked.has('lead')).toBe(true);
      expect(linked.has('customer')).toBe(true);
      expect(linked.has('commercial')).toBe(true);
      expect(linked.has('tenant')).toBe(false);
    });

    it('links tenant, commercial, serviceOrder, implementation, integration and hosting from a tenant id', () => {
      const linked = contractLinkedSourceEntities({ tenantId: 'tenant-1' });
      for (const entity of [
        'tenant',
        'commercial',
        'serviceOrder',
        'implementation',
        'integration',
        'hosting',
      ])
        expect(linked.has(entity)).toBe(true);
    });
  });

  describe('contractInstanceContextEntities', () => {
    it('a partner agreement linked to a partner resolves partner.*', () => {
      const context = contractInstanceContextEntities(
        ContractType.PARTNER_AGREEMENT,
        { partnerId: 'p-1' },
      );
      expect(context.has('partner')).toBe(true);
    });

    it('BUG-3553 owner rule: customer.* is not offered before conversion unless a lead legitimately supports it', () => {
      // A CUSTOMER_AGREEMENT with nothing linked at all — no lead, no
      // customer — must not resolve customer.*, matching the owner's rule
      // that downstream Customer placeholders need a real relationship.
      const context = contractInstanceContextEntities(
        ContractType.CUSTOMER_AGREEMENT,
        {},
      );
      expect(context.has('customer')).toBe(false);
      // But once a lead is linked, the relationship is real (the lead IS the
      // prospective customer) and customer.* becomes resolvable.
      const withLead = contractInstanceContextEntities(
        ContractType.CUSTOMER_AGREEMENT,
        { relatedLeadId: 'lead-1' },
      );
      expect(withLead.has('customer')).toBe(true);
    });

    it('type is the ceiling: a linked tenant on a partner agreement still does not offer tenant.*', () => {
      const context = contractInstanceContextEntities(
        ContractType.PARTNER_AGREEMENT,
        { partnerId: 'p-1', tenantId: 't-1' },
      );
      expect(context.has('tenant')).toBe(false);
    });
  });

  describe('unresolvableRequiredPlaceholders', () => {
    it('blocks a required customer.* placeholder with an entity-specific message', () => {
      const issues = unresolvableRequiredPlaceholders(
        [definition('customer.legalName', { label: 'Customer Legal Name' })],
        ContractType.CUSTOMER_AGREEMENT,
        {},
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toBe(
        'Customer Legal Name cannot be resolved because this agreement is not associated with a customer.',
      );
    });

    it('does not block a required placeholder whose entity is linked', () => {
      const issues = unresolvableRequiredPlaceholders(
        [definition('partner.name', { label: 'Partner name' })],
        ContractType.PARTNER_AGREEMENT,
        { partnerId: 'p-1' },
      );
      expect(issues).toHaveLength(0);
    });

    it('never blocks an optional placeholder', () => {
      const issues = unresolvableRequiredPlaceholders(
        [
          definition('customer.industry', {
            label: 'Customer industry',
            required: false,
          }),
        ],
        ContractType.CUSTOMER_AGREEMENT,
        {},
      );
      expect(issues).toHaveLength(0);
    });
  });

  describe('outOfContextPlaceholders', () => {
    it('flags customer.* on a partner agreement template', () => {
      const flagged = outOfContextPlaceholders(
        [
          definition('platform.name'),
          definition('partner.name'),
          definition('customer.legalName'),
        ],
        ContractType.PARTNER_AGREEMENT,
      );
      expect(flagged.map((d) => d.key)).toEqual(['customer.legalName']);
    });

    it('flags nothing for a generic contract type', () => {
      const flagged = outOfContextPlaceholders(
        [definition('partner.name'), definition('tenant.name')],
        ContractType.NDA,
      );
      expect(flagged).toHaveLength(0);
    });
  });
});
