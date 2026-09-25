import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContractStatus, ContractType } from '@prisma/client';
import {
  assertCustomerUsable,
  assertLeadAttributedToPartner,
  assertLeadUsable,
  assertPartnerUsable,
  duplicateAgreementError,
  findDuplicateAgreement,
  TERMINAL_DUPLICATE_STATUSES,
  UNUSABLE_CUSTOMER_STATUSES,
  UNUSABLE_LEAD_STATUSES,
  UNUSABLE_PARTNER_STATUSES,
} from './agreement-source-guards';

describe('agreement-source-guards — BUG-3553', () => {
  describe('assertPartnerUsable', () => {
    it.each(UNUSABLE_PARTNER_STATUSES)('refuses a %s partner', (status) => {
      expect(() =>
        assertPartnerUsable({ id: 'p-1', status, displayName: 'Acme' }),
      ).toThrow(BadRequestException);
    });

    it('allows an in-progress partner (the agreement pipeline itself)', () => {
      expect(() =>
        assertPartnerUsable({
          id: 'p-1',
          status: 'AGREEMENT_DRAFTING',
          displayName: 'Acme',
        }),
      ).not.toThrow();
      expect(() =>
        assertPartnerUsable({
          id: 'p-1',
          status: 'ACTIVE',
          displayName: 'Acme',
        }),
      ).not.toThrow();
    });
  });

  describe('assertLeadUsable', () => {
    it.each(UNUSABLE_LEAD_STATUSES)('refuses a %s lead', (status) => {
      expect(() =>
        assertLeadUsable({ id: 'l-1', status, companyName: 'Gulf Horizon' }),
      ).toThrow(BadRequestException);
    });

    it('allows a qualified, in-pipeline lead', () => {
      expect(() =>
        assertLeadUsable({
          id: 'l-1',
          status: 'QUALIFIED',
          companyName: 'Gulf Horizon',
        }),
      ).not.toThrow();
    });
  });

  describe('assertCustomerUsable', () => {
    it.each(UNUSABLE_CUSTOMER_STATUSES)('refuses a %s customer', (status) => {
      expect(() =>
        assertCustomerUsable({
          id: 'c-1',
          status,
          companyName: 'Gulf Horizon',
        }),
      ).toThrow(BadRequestException);
    });

    it('allows a suspended customer (reversible, unlike archived/churned)', () => {
      expect(() =>
        assertCustomerUsable({
          id: 'c-1',
          status: 'SUSPENDED',
          companyName: 'Gulf Horizon',
        }),
      ).not.toThrow();
    });
  });

  describe('assertLeadAttributedToPartner', () => {
    it('refuses a lead attributed to a different partner', () => {
      expect(() =>
        assertLeadAttributedToPartner(
          { id: 'l-1', partnerId: 'p-2', companyName: 'Gulf Horizon' },
          'p-1',
        ),
      ).toThrow(BadRequestException);
    });

    it('allows a lead attributed to the same partner', () => {
      expect(() =>
        assertLeadAttributedToPartner(
          { id: 'l-1', partnerId: 'p-1', companyName: 'Gulf Horizon' },
          'p-1',
        ),
      ).not.toThrow();
    });

    it('allows a direct (unattributed) lead alongside any partner', () => {
      expect(() =>
        assertLeadAttributedToPartner(
          { id: 'l-1', partnerId: null, companyName: 'Gulf Horizon' },
          'p-1',
        ),
      ).not.toThrow();
    });
  });

  describe('findDuplicateAgreement', () => {
    function prismaStub(result: unknown) {
      return { contract: { findFirst: jest.fn().mockResolvedValue(result) } };
    }

    it('discovery D3 scenario 27 — refuses a second non-terminal agreement of the same type/counterparty', async () => {
      const existing = { id: 'con-1', contractNumber: 'CON-1' };
      const prisma = prismaStub(existing);
      const result = await findDuplicateAgreement(prisma, {
        contractType: ContractType.PARTNER_AGREEMENT,
        partnerId: 'p-1',
      });
      expect(result).toEqual(existing);
      expect(prisma.contract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contractType: ContractType.PARTNER_AGREEMENT,
            status: { notIn: TERMINAL_DUPLICATE_STATUSES },
          }),
        }),
      );
    });

    it('skips the check entirely when nothing is linked', async () => {
      const prisma = prismaStub(null);
      const result = await findDuplicateAgreement(prisma, {
        contractType: ContractType.NDA,
      });
      expect(result).toBeNull();
      expect(prisma.contract.findFirst).not.toHaveBeenCalled();
    });

    it('is exempt for AMENDMENT and RENEWAL — they exist to follow an executed agreement', async () => {
      const prisma = prismaStub({ id: 'x', contractNumber: 'CON-2' });
      const result = await findDuplicateAgreement(prisma, {
        contractType: ContractType.AMENDMENT,
        partnerId: 'p-1',
      });
      expect(result).toBeNull();
      expect(prisma.contract.findFirst).not.toHaveBeenCalled();
    });
  });

  it('duplicateAgreementError names the existing agreement number', () => {
    const error = duplicateAgreementError({
      id: 'con-1',
      contractNumber: 'CON-20260925-AB12',
    });
    expect(error).toBeInstanceOf(ConflictException);
    const response = error.getResponse() as { message: string };
    expect(response.message).toContain('CON-20260925-AB12');
  });

  it('TERMINAL_DUPLICATE_STATUSES matches ContractStatus values that leave the pipeline', () => {
    for (const status of TERMINAL_DUPLICATE_STATUSES)
      expect(Object.values(ContractStatus)).toContain(status);
  });
});
