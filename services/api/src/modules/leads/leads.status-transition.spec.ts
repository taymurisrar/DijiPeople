import { BadRequestException } from '@nestjs/common';
import { LeadStatus, PlatformUserRole } from '@prisma/client';
import { LeadsService } from './leads.service';

function setup() {
  const existing = {
    id: 'lead-1',
    status: LeadStatus.NEW,
    subStatus: 'Demo requested',
    companyName: 'Maseer Group',
    contactFirstName: 'Mirza',
    contactLastName: 'Baig',
    workEmail: 'mirza@example.test',
    industry: 'IT / Software',
    companySize: '51-200',
    partnerId: null,
    assignedToUserId: 'owner-1',
  };
  const update = jest.fn(async (_id, data) => ({ ...existing, ...data }));
  const service = new LeadsService(
    { findById: jest.fn(async () => existing), update } as never,
    { log: jest.fn() } as never,
    {} as never,
    {} as never,
    { record: jest.fn() } as never,
  );
  const user = {
    userId: 'user-1',
    tenantId: 'platform',
    platform: {
      id: 'owner-1',
      role: PlatformUserRole.PLATFORM_OWNER,
    },
  } as never;

  return { service, update, user };
}

describe('lead status transitions', () => {
  it('replaces the previous status sub-status when moving to a new status', async () => {
    const { service, update, user } = setup();

    await service.updateLead(user, 'lead-1', {
      status: LeadStatus.QUALIFIED,
      isQualified: true,
    });

    expect(update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({
        status: LeadStatus.QUALIFIED,
        subStatus: 'Commercial review',
      }),
    );
  });

  it('returns field diagnostics and allowed values for an explicit mismatch', async () => {
    const { service, user } = setup();

    await expect(
      service.updateLead(user, 'lead-1', {
        status: LeadStatus.QUALIFIED,
        subStatus: 'Demo requested',
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: expect.objectContaining({
          selectedStatus: LeadStatus.QUALIFIED,
          submittedSubStatus: 'Demo requested',
          allowedSubStatuses: expect.arrayContaining(['Commercial review']),
        }),
      }),
    });
  });
});
