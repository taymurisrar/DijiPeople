import { ContractType } from '@prisma/client';
import {
  agreementSubjectOf,
  contractInstanceContextEntities,
  contractTypeDeclaredSubject,
  offeredPlaceholderEntities,
} from './placeholder-context';
import {
  CONTRACT_PLACEHOLDER_REGISTRY,
  ContractsService,
} from './contracts.service';

/*
 * The Fields panel offers placeholders by the subject an agreement is *with*
 * (partner, lead, customer, tenant), not by everything its contract type
 * could ever hold. These pin the owner's rules: a lead is never offered
 * customer fields, a tenant is offered customer fields only where that
 * customer exists, and nothing offered is outside what resolves.
 */
describe('placeholder subject context', () => {
  const offered = (
    type: ContractType,
    contract?: Parameters<typeof offeredPlaceholderEntities>[1],
  ) => offeredPlaceholderEntities(type, contract).entities;

  describe('templates (no bound record) use the declared subject', () => {
    it('partner agreement -> partner + context-free groups only', () => {
      const entities = offered(ContractType.PARTNER_AGREEMENT);
      expect(entities.has('partner')).toBe(true);
      for (const absent of ['customer', 'lead', 'tenant', 'commercial'])
        expect(entities.has(absent)).toBe(false);
      for (const present of ['platform', 'contract', 'counterparty'])
        expect(entities.has(present)).toBe(true);
    });

    it('customer agreement -> customer + commercial, not lead', () => {
      const entities = offered(ContractType.SUBSCRIPTION_AGREEMENT);
      expect(entities.has('customer')).toBe(true);
      expect(entities.has('commercial')).toBe(true);
      expect(entities.has('lead')).toBe(false);
      expect(entities.has('partner')).toBe(false);
    });

    it('service agreement -> tenant family plus the customer it is guaranteed', () => {
      const entities = offered(ContractType.SERVICE_AGREEMENT);
      for (const present of ['tenant', 'serviceOrder', 'hosting', 'customer'])
        expect(entities.has(present)).toBe(true);
      expect(entities.has('lead')).toBe(false);
    });

    it('a generic type declares no subject and offers only context-free groups', () => {
      expect(contractTypeDeclaredSubject(ContractType.NDA)).toBeNull();
      const entities = offered(ContractType.NDA);
      for (const absent of ['partner', 'customer', 'lead', 'tenant'])
        expect(entities.has(absent)).toBe(false);
      expect(entities.has('counterparty')).toBe(true);
    });
  });

  describe('agreements use the subject they are actually linked to', () => {
    it('a lead-sourced subscription agreement is with the LEAD and never offers customer.*', () => {
      const lead = {
        relatedLeadId: 'lead-1',
        // A lead carries its referring partner; that partner is not the subject.
        partnerId: 'partner-1',
        counterpartyType: 'LEAD',
      };
      expect(
        agreementSubjectOf(ContractType.SUBSCRIPTION_AGREEMENT, lead),
      ).toBe('LEAD');
      const entities = offered(ContractType.SUBSCRIPTION_AGREEMENT, lead);
      expect(entities.has('lead')).toBe(true);
      expect(entities.has('commercial')).toBe(true);
      expect(entities.has('customer')).toBe(false);
      expect(entities.has('partner')).toBe(false);
    });

    it('the same type with a converted customer is with the CUSTOMER', () => {
      const customer = { relatedLeadId: 'lead-1', customerAccountId: 'c-1' };
      expect(
        agreementSubjectOf(ContractType.SUBSCRIPTION_AGREEMENT, customer),
      ).toBe('CUSTOMER');
      const entities = offered(ContractType.SUBSCRIPTION_AGREEMENT, customer);
      expect(entities.has('customer')).toBe(true);
      expect(entities.has('lead')).toBe(false);
    });

    it('a tenant agreement offers customer.* only when a customer is linked', () => {
      const bare = offered(ContractType.NDA, {
        tenantId: 't-1',
        counterpartyType: 'TENANT',
      });
      expect(bare.has('tenant')).toBe(true);
      expect(bare.has('customer')).toBe(false);
      const withCustomer = offered(ContractType.NDA, {
        tenantId: 't-1',
        customerAccountId: 'c-1',
        counterpartyType: 'TENANT',
      });
      expect(withCustomer.has('customer')).toBe(true);
    });

    it('a generic agreement trusts a recorded counterparty type only when it is linked', () => {
      expect(
        agreementSubjectOf(ContractType.NDA, {
          partnerId: 'p-1',
          counterpartyType: 'CUSTOMER',
        }),
      ).toBe('PARTNER');
      expect(agreementSubjectOf(ContractType.NDA, {})).toBeNull();
    });

    it('everything offered for a linked agreement is resolvable for it', () => {
      const cases: Array<[ContractType, Record<string, string>]> = [
        [ContractType.PARTNER_AGREEMENT, { partnerId: 'p' }],
        [ContractType.CUSTOMER_AGREEMENT, { relatedLeadId: 'l' }],
        [ContractType.CUSTOMER_AGREEMENT, { customerAccountId: 'c' }],
        [
          ContractType.SERVICE_AGREEMENT,
          { tenantId: 't', customerAccountId: 'c' },
        ],
        [ContractType.NDA, { tenantId: 't' }],
      ];
      for (const [type, links] of cases) {
        const resolvable = contractInstanceContextEntities(type, links);
        for (const entity of offered(type, links))
          expect([type, entity, resolvable.has(entity)]).toEqual([
            type,
            entity,
            true,
          ]);
      }
    });
  });

  describe('the registry carries what each subject prints', () => {
    it('a lead has its own address, signer and billing contact fields', () => {
      const keys = new Set(CONTRACT_PLACEHOLDER_REGISTRY.map((d) => d.key));
      for (const key of [
        'lead.legalName',
        'lead.address',
        'lead.signer.name',
        'lead.signer.title',
        'lead.signer.email',
        'lead.billingContact.email',
      ])
        expect(keys.has(key)).toBe(true);
    });
  });

  describe('ContractsService.listPlaceholderDefinitions', () => {
    const platformAdmin = {
      userId: 'platform-user',
      tenantId: 'platform',
      authSubjectType: 'platform-user',
      platform: { id: 'platform-user', role: 'SUPER_ADMIN', status: 'ACTIVE' },
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
    } as never;

    function service(contract: Record<string, unknown> | null) {
      return new ContractsService(
        {
          contract: { findUnique: jest.fn().mockResolvedValue(contract) },
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    }

    it("serves a lead agreement's context: Lead group, no Customer group", async () => {
      const payload = await service({
        contractType: ContractType.SUBSCRIPTION_AGREEMENT,
        counterpartyType: 'LEAD',
        relatedLeadId: 'lead-1',
        partnerId: null,
        customerAccountId: null,
        customerOnboardingId: null,
        tenantId: null,
      }).listPlaceholderDefinitions(
        platformAdmin,
        undefined,
        '6f1c1f3e-8d0e-4c43-9d55-0f0a1f6f7a10',
      );
      const groups = new Set(payload.items.map((item) => item.group));
      expect(groups.has('Lead')).toBe(true);
      expect(groups.has('Customer')).toBe(false);
      expect(payload.context?.subjectType).toBe('LEAD');
    });

    it('a template of a generic type is offered no subject groups', async () => {
      const payload = await service(null).listPlaceholderDefinitions(
        platformAdmin,
        ContractType.NDA,
      );
      const groups = new Set(payload.items.map((item) => item.group));
      for (const absent of ['Partner', 'Lead', 'Customer', 'Tenant'])
        expect(groups.has(absent)).toBe(false);
      expect(groups.has('Platform')).toBe(true);
      expect(payload.context?.subjectType).toBeNull();
    });
  });
});
