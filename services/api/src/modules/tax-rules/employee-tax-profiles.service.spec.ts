import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigurationStatus, Prisma } from '@prisma/client';
import { EmployeeTaxProfilesService } from './employee-tax-profiles.service';

describe('EmployeeTaxProfilesService', () => {
  const user = { tenantId: 'tenant-1', userId: 'user-1' } as never;

  function profile(overrides: Record<string, unknown> = {}) {
    return {
      id: 'profile-1',
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      taxIdentificationNumber: 'TIN-1234',
      taxResidencyCountryCode: 'SA',
      workTaxJurisdiction: 'RIYADH',
      taxStatus: 'RESIDENT',
      taxCategory: 'STANDARD',
      filingStatus: 'SINGLE',
      dependentAllowances: 0,
      taxRuleId: null,
      additionalTaxAmount: new Prisma.Decimal(0),
      taxExemptionAmount: new Prisma.Decimal(0),
      taxCreditAmount: new Prisma.Decimal(0),
      previousEmployerTaxableIncome: new Prisma.Decimal(0),
      previousEmployerTaxDeducted: new Prisma.Decimal(0),
      jurisdictionExtensions: null,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      overrideReason: null,
      status: ConfigurationStatus.ACTIVE,
      ownerUserId: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      createdById: 'user-1',
      updatedById: 'user-1',
      employee: {
        id: 'employee-1',
        employeeCode: 'EMP-001',
        firstName: 'Amina',
        lastName: 'Khan',
        organizationId: 'org-1',
        businessUnitId: 'bu-1',
      },
      taxRule: null,
      ...overrides,
    };
  }

  function setup() {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }),
      },
      country: {
        findFirst: jest.fn().mockResolvedValue({ id: 'country-sa' }),
      },
      user: { findFirst: jest.fn() },
      taxRule: { findFirst: jest.fn() },
      employeeTaxProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(profile()),
        update: jest.fn().mockResolvedValue(profile()),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue({}) };
    return {
      audit,
      prisma,
      service: new EmployeeTaxProfilesService(prisma as never, audit as never),
    };
  }

  it('creates an effective-dated tenant profile and masks the identifier in audit', async () => {
    const { audit, prisma, service } = setup();

    const result = await service.create(user, {
      employeeId: 'employee-1',
      taxIdentificationNumber: 'TIN-1234',
      taxResidencyCountryCode: 'sa',
      effectiveFrom: '2026-01-01',
    });

    expect(result).toEqual(
      expect.objectContaining({
        employeeName: 'Amina Khan',
        taxIdentificationNumber: 'TIN-1234',
      }),
    );
    expect(prisma.employeeTaxProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          employeeId: 'employee-1',
          taxResidencyCountryCode: 'SA',
          ownerUserId: 'user-1',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSnapshot: expect.objectContaining({
          taxIdentificationNumber: '***1234',
        }),
      }),
    );
  });

  it('rejects overlapping active profiles', async () => {
    const { prisma, service } = setup();
    prisma.employeeTaxProfile.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(user, {
        employeeId: 'employee-1',
        effectiveFrom: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.employeeTaxProfile.create).not.toHaveBeenCalled();
  });

  it('rejects a tax-residency code that is not an active country', async () => {
    const { prisma, service } = setup();
    prisma.country.findFirst.mockResolvedValue(null);

    await expect(
      service.create(user, {
        employeeId: 'employee-1',
        taxResidencyCountryCode: 'ZZ',
        effectiveFrom: '2026-01-01',
      }),
    ).rejects.toThrow('Select an active tax-residency country.');
    expect(prisma.employeeTaxProfile.create).not.toHaveBeenCalled();
  });

  it('never returns a profile from another tenant', async () => {
    const { prisma, service } = setup();

    await expect(service.get(user, 'profile-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.employeeTaxProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', id: 'profile-2' },
      }),
    );
  });
});
