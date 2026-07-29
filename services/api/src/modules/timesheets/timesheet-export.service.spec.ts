import { BadRequestException } from '@nestjs/common';
import { TimesheetExportFormat, TimesheetExportStatus } from '@prisma/client';
import { TimesheetExportService } from './timesheet-export.service';

describe('TimesheetExportService request validation', () => {
  const request = {
    id: '6fce653a-49e3-43cc-83f3-3ba9f51c7c87',
    tenantId: 'tenant-1',
    requestedById: 'user-1',
    exportType: 'CURRENT',
    filters: {},
    format: TimesheetExportFormat.XLSX,
    status: TimesheetExportStatus.QUEUED,
    rowCount: 5,
    fileReference: null,
    fileName: null,
    contentType: null,
    failureReason: null,
    requestedAt: new Date('2026-07-26T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    expiresAt: new Date('2026-08-02T00:00:00.000Z'),
    createdAt: new Date('2026-07-26T00:00:00.000Z'),
    updatedAt: new Date('2026-07-26T00:00:00.000Z'),
  };
  const prisma = {
    timesheet: { count: jest.fn().mockResolvedValue(1) },
    timesheetEntry: { count: jest.fn().mockResolvedValue(5) },
    timesheetExportRequest: {
      create: jest.fn().mockResolvedValue(request),
      findFirst: jest.fn().mockResolvedValue(request),
    },
  };
  const service = new TimesheetExportService(
    prisma as never,
    {} as never,
    {
      getTimesheetSettingsForBusinessUnit: jest.fn().mockResolvedValue({
        exportRetentionDays: 7,
        largeExportRowThreshold: 1,
      }),
    } as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
  );
  const user = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    permissionKeys: ['timesheets.read.all', 'timesheets.export'],
  } as never;

  it('allows a current-view export to use filters without selected IDs', async () => {
    await expect(
      service.requestExport(user, {
        exportType: 'CURRENT',
        format: TimesheetExportFormat.XLSX,
        year: 2026,
        month: 7,
      }),
    ).resolves.toMatchObject({ item: { id: request.id, downloadable: false } });
  });

  it('requires selected IDs only for a selected export', async () => {
    await expect(
      service.requestExport(user, {
        exportType: 'SELECTED',
        format: TimesheetExportFormat.CSV,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
