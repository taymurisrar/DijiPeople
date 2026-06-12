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
          actionLabel: 'TIMESHEET APPROVED',
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
          actionLabel: 'TIMESHEET SUBMITTED',
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
