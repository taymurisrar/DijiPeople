import { BadRequestException } from '@nestjs/common';
import { PartnerType } from '@prisma/client';
import { PartnersService } from './partners.service';

/*
 * WP-08 finding 3. `UpdatePartnerDto extends CreatePartnerDto {}` inherited
 * every required field (`type`, `displayName`, `email`,
 * `defaultCommissionRate`) unchanged, so `PATCH /partners/:id` was never
 * actually partial — a caller sending `{ notes: '...' }` alone failed DTO
 * validation before reaching the service. The admin console never noticed
 * because its edit form always resubmits the whole record.
 *
 * `UpdatePartnerDto` is now `PartialType(CreatePartnerDto)`; these specs prove
 * the two things that matter once it is: a real partial patch succeeds, and
 * the type-policy check still applies to the record as it would read *after*
 * the patch, not the patch body alone — so a patch cannot dodge the
 * requirement by simply not mentioning the field that would fail it.
 */

function existingCompanyPartner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    code: 'PTR-1',
    type: PartnerType.COMPANY,
    status: 'ACTIVE',
    accountStatus: 'ACTIVE',
    currencyCode: 'USD',
    defaultCommissionRate: 10,
    displayName: 'Contoso',
    companyName: 'Contoso Ltd',
    contactFirstName: null,
    contactLastName: null,
    email: 'ops@contoso.test',
    taxId: 'TAX-1',
    notes: null,
    leads: [],
    agreements: [],
    commissions: [],
    inquiries: [],
    onboardingApplications: [],
    portalUsers: [],
    referralLinks: [],
    attributedCustomers: [],
    attributedTenants: [],
    timeline: [],
    ...overrides,
  };
}

function prismaStub(existing: Record<string, unknown>) {
  return {
    partner: {
      findUnique: jest.fn(async () => existing),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    platformUser: { findFirst: jest.fn(async () => null) },
  } as never;
}

describe('PartnersService.update — genuinely partial patches', () => {
  it('accepts a single-field patch that never mentions type, displayName or email', async () => {
    const existing = existingCompanyPartner();
    const prisma = prismaStub(existing);
    const service = new PartnersService(prisma, { log: jest.fn() } as never);

    const result = await service.update('partner-1', {
      notes: 'Follow up next week',
    } as never);

    expect(result.notes).toBe('Follow up next week');
    const writtenData = (prisma as { partner: { update: jest.Mock } }).partner
      .update.mock.calls[0][0].data;
    // The fields the patch never mentioned must not appear in the write at
    // all — not even re-written back to their existing value — because a
    // partial patch that silently rewrites unrelated columns is not partial.
    expect(writtenData).not.toHaveProperty('type');
    expect(writtenData).not.toHaveProperty('displayName');
    expect(writtenData).not.toHaveProperty('email');
    expect(writtenData).toEqual({ notes: 'Follow up next week' });
  });

  it('does not reset status to DRAFT when a patch omits it', async () => {
    const existing = existingCompanyPartner({ status: 'ACTIVE' });
    const prisma = prismaStub(existing);
    const service = new PartnersService(prisma, { log: jest.fn() } as never);

    await service.update('partner-1', { notes: 'x' } as never);

    const writtenData = (prisma as { partner: { update: jest.Mock } }).partner
      .update.mock.calls[0][0].data;
    expect(writtenData).not.toHaveProperty('status');
  });

  it('refuses a patch that clears the company name a COMPANY partner needs', async () => {
    const existing = existingCompanyPartner();
    const prisma = prismaStub(existing);
    const service = new PartnersService(prisma, { log: jest.fn() } as never);

    await expect(
      service.update('partner-1', { companyName: '' } as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update('partner-1', { companyName: '' } as never),
    ).rejects.toThrow(/company partner requires/);
  });

  it('does not re-demand a company name a patch never touches', async () => {
    // The record is already compliant; an unrelated patch must not be told
    // it is missing a field it was never asked to change.
    const existing = existingCompanyPartner();
    const prisma = prismaStub(existing);
    const service = new PartnersService(prisma, { log: jest.fn() } as never);

    await expect(
      service.update('partner-1', { phone: '+974-5555-0100' } as never),
    ).resolves.toMatchObject({ phone: '+974-5555-0100' });
  });

  it('lets a patch switch type to INDIVIDUAL only when it also supplies a contact name', async () => {
    const existing = existingCompanyPartner();
    const prisma = prismaStub(existing);
    const service = new PartnersService(prisma, { log: jest.fn() } as never);

    await expect(
      service.update('partner-1', { type: PartnerType.INDIVIDUAL } as never),
    ).rejects.toThrow(/individual partner requires/);

    await expect(
      service.update('partner-1', {
        type: PartnerType.INDIVIDUAL,
        contactFirstName: 'Ada',
        contactLastName: 'Lovelace',
      } as never),
    ).resolves.toMatchObject({ type: PartnerType.INDIVIDUAL });
  });
});
