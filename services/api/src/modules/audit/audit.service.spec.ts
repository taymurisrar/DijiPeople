import { AuditService } from './audit.service';
import type { AuditRepository } from './audit.repository';

describe('AuditService record Timeline', () => {
  it('maps real audit records to newest-first runtime Timeline entries', async () => {
    const repository = {
      findRecordTimeline: jest.fn().mockResolvedValue([
        {
          id: 'audit-2',
          action: 'TIMESHEET_APPROVED',
          entityType: 'Timesheet',
          entityId: 'timesheet-1',
          createdAt: new Date('2026-06-10T12:00:00.000Z'),
          actorUser: {
            id: 'user-1',
            firstName: 'Taimur',
            lastName: 'Israr',
            email: 'taimur@example.com',
          },
        },
        {
          id: 'audit-1',
          action: 'TIMESHEET_SUBMITTED',
          entityType: 'Timesheet',
          entityId: 'timesheet-1',
          createdAt: new Date('2026-06-10T10:00:00.000Z'),
          actorUser: null,
        },
      ]),
    } as unknown as AuditRepository;
    const service = new AuditService(repository);

    await expect(
      service.listRecordTimeline({
        tenantId: 'tenant-1',
        entityType: 'Timesheet',
        entityId: 'timesheet-1',
        recordHref: '/timesheets/timesheet-1',
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'audit-2',
          actionLabel: 'Timesheet Approved',
          actionType: 'TIMESHEET_APPROVED',
          actorDisplayName: 'Taimur Israr',
          occurredAt: '2026-06-10T12:00:00.000Z',
          recordReference: {
            id: 'timesheet-1',
            label: 'Timesheet',
            href: '/timesheets/timesheet-1',
          },
        },
        {
          id: 'audit-1',
          actionLabel: 'Timesheet Submitted',
          actionType: 'TIMESHEET_SUBMITTED',
          actorDisplayName: 'System',
          occurredAt: '2026-06-10T10:00:00.000Z',
          recordReference: {
            id: 'timesheet-1',
            label: 'Timesheet',
            href: '/timesheets/timesheet-1',
          },
        },
      ],
    });
  });

  it('returns a valid real empty state without fabricating activity', async () => {
    const repository = {
      findRecordTimeline: jest.fn().mockResolvedValue([]),
    } as unknown as AuditRepository;
    const service = new AuditService(repository);

    await expect(
      service.listRecordTimeline({
        tenantId: 'tenant-1',
        entityType: 'Project',
        entityId: 'project-1',
      }),
    ).resolves.toEqual({ items: [] });
  });
});

describe('AuditService tenant actors', () => {
  it('stores a platform actor in scope without using the tenant user foreign key', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const repository = {
      findTenantActor: jest.fn().mockResolvedValue(null),
      findPlatformActor: jest.fn().mockResolvedValue({
        id: 'platform-user-1',
        email: 'admin@dijipeople.com',
        firstName: 'Platform',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
      }),
      create,
    } as unknown as AuditRepository;
    const service = new AuditService(repository);

    await service.log({
      tenantId: 'tenant-1',
      actorUserId: 'platform-user-1',
      action: 'USER_INVITATION_CREATED',
      entityType: 'UserInvitation',
      entityId: 'invitation-1',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: null,
        scope: {
          platformActor: {
            id: 'platform-user-1',
            email: 'admin@dijipeople.com',
            fullName: 'Platform Admin',
            role: 'SUPER_ADMIN',
            source: 'platform-admin',
          },
        },
      }),
    );
  });
});
