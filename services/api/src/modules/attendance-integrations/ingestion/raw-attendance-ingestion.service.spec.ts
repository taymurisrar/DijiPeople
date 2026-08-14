import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import { RawAttendanceIngestionService } from './raw-attendance-ingestion.service';

/**
 * These cover the invariants the ingestion path must never lose:
 * server-forced capture source and work mode, deduplication scoped by source
 * identity, cross-tenant rejection, and unmapped events still being stored.
 */
describe('RawAttendanceIngestionService', () => {
  const TENANT = 'tenant-a';
  const INTEGRATION = 'integration-1';
  const DEVICE = 'device-1';

  let prisma: {
    attendanceIntegration: { findFirst: jest.Mock };
    attendanceDevice: { findFirst: jest.Mock };
    employeeExternalIdentity: { findMany: jest.Mock };
    rawAttendanceEvent: { createMany: jest.Mock };
  };
  let service: RawAttendanceIngestionService;

  beforeEach(() => {
    prisma = {
      attendanceIntegration: {
        findFirst: jest.fn().mockResolvedValue({
          id: INTEGRATION,
          tenantId: TENANT,
          provider: 'ZKTECO',
          isActive: true,
        }),
      },
      attendanceDevice: {
        findFirst: jest.fn().mockResolvedValue({
          id: DEVICE,
          serialNumber: 'A2QO221160250',
          timezone: 'Asia/Qatar',
          locationId: 'location-1',
        }),
      },
      employeeExternalIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      rawAttendanceEvent: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ count: data.length }),
          ),
      },
    };

    // Ingestion enqueues reconciliation for the days it touched; these tests are
    // about what gets stored, so the queue is a spy rather than a real worker.
    // Both methods are stubbed: a partial stub makes the service log a caught
    // failure and pass anyway, which is a test that proves nothing.
    service = new RawAttendanceIngestionService(
      prisma as unknown as PrismaService,
      {
        enqueue: jest.fn().mockResolvedValue(undefined),
        enqueueMany: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  const event = (overrides: Record<string, unknown> = {}) => ({
    externalUserId: '15',
    occurredAtLocal: '2026-08-13T09:01:04',
    verificationModeRaw: 1,
    punchStateRaw: 0,
    workCodeRaw: 0,
    ...overrides,
  });

  describe('server-enforced invariants', () => {
    it('forces captureSource DEVICE and workMode OFFICE regardless of the payload', async () => {
      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [
          event({
            // A compromised or buggy gateway trying to relabel a device punch.
            captureSource: 'WEB',
            workMode: 'REMOTE',
          }),
        ],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].captureSource).toBe('DEVICE');
      expect(data[0].workMode).toBe('OFFICE');
    });

    it('never writes HYBRID to a raw event', async () => {
      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event({ workMode: 'HYBRID' })],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].workMode).not.toBe('HYBRID');
    });

    it('stamps the device work site on the event', async () => {
      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event()],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].locationId).toBe('location-1');
    });
  });

  describe('deduplication scope', () => {
    it('scopes by device identity, not by capture source alone', () => {
      expect(
        RawAttendanceIngestionService.dedupeScopeKey({
          deviceId: DEVICE,
          integrationId: INTEGRATION,
        }),
      ).toBe(`device:${DEVICE}`);
    });

    it('falls back to integration scope when there is no device', () => {
      expect(
        RawAttendanceIngestionService.dedupeScopeKey({
          deviceId: null,
          integrationId: INTEGRATION,
        }),
      ).toBe(`integration:${INTEGRATION}`);
    });

    it('gives two devices different scopes, so identical punches cannot collide', async () => {
      // This is the regression the Slice 2 migration fixed: with the old
      // (tenantId, captureSource, eventFingerprint) key, a connector whose
      // fingerprint omitted device identity would have silently dropped the
      // second device's punch.
      const scopeA = RawAttendanceIngestionService.dedupeScopeKey({
        deviceId: 'device-a',
        integrationId: INTEGRATION,
      });
      const scopeB = RawAttendanceIngestionService.dedupeScopeKey({
        deviceId: 'device-b',
        integrationId: INTEGRATION,
      });

      expect(scopeA).not.toBe(scopeB);
    });

    it('collapses a duplicate repeated inside one batch', async () => {
      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event(), event()],
      );

      expect(result.received).toBe(2);
      expect(result.duplicates).toBe(1);
      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data).toHaveLength(1);
    });

    it('relies on the database constraint for re-sent batches', async () => {
      prisma.rawAttendanceEvent.createMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event()],
      );

      expect(prisma.rawAttendanceEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
      expect(result.inserted).toBe(0);
      expect(result.duplicates).toBe(1);
    });

    it('computes a fingerprint that includes device serial and punch fields', () => {
      const base = {
        deviceSerialNumber: 'SERIAL-1',
        externalUserId: '15',
        occurredAtLocal: '2026-08-13T09:01:04',
        verificationModeRaw: 1,
        punchStateRaw: 0,
        workCodeRaw: 0,
      };

      const original = RawAttendanceIngestionService.computeFingerprint(base);

      expect(
        RawAttendanceIngestionService.computeFingerprint({
          ...base,
          deviceSerialNumber: 'SERIAL-2',
        }),
      ).not.toBe(original);
      expect(
        RawAttendanceIngestionService.computeFingerprint({
          ...base,
          punchStateRaw: 1,
        }),
      ).not.toBe(original);
      // Same input must be stable across runs.
      expect(RawAttendanceIngestionService.computeFingerprint(base)).toBe(
        original,
      );
    });
  });

  describe('tenant isolation', () => {
    it('refuses an integration that belongs to another tenant', async () => {
      prisma.attendanceIntegration.findFirst.mockResolvedValue(null);

      await expect(
        service.ingestBatch(
          { tenantId: 'tenant-b', integrationId: INTEGRATION },
          [event()],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.rawAttendanceEvent.createMany).not.toHaveBeenCalled();
    });

    it('refuses a device that belongs to a different integration', async () => {
      prisma.attendanceDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.ingestBatch(
          {
            tenantId: TENANT,
            integrationId: INTEGRATION,
            deviceId: 'device-from-elsewhere',
          },
          [event()],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('always scopes the integration lookup by tenant', async () => {
      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event()],
      );

      expect(prisma.attendanceIntegration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT }),
        }),
      );
    });
  });

  describe('employee resolution', () => {
    it('resolves a mapped external user to the employee', async () => {
      prisma.employeeExternalIdentity.findMany.mockResolvedValue([
        { externalUserId: '15', employeeId: 'employee-1', deviceId: null },
      ]);

      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event()],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].employeeId).toBe('employee-1');
      expect(data[0].mappingStatus).toBe('MAPPED');
      expect(result.mapped).toBe(1);
    });

    it('prefers a device-specific identity over an integration-wide one', async () => {
      prisma.employeeExternalIdentity.findMany.mockResolvedValue([
        { externalUserId: '15', employeeId: 'employee-wide', deviceId: null },
        {
          externalUserId: '15',
          employeeId: 'employee-device',
          deviceId: DEVICE,
        },
      ]);

      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event()],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].employeeId).toBe('employee-device');
    });

    it('still stores an event for an unmatched user', async () => {
      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event({ externalUserId: '999' })],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data).toHaveLength(1);
      expect(data[0].employeeId).toBeNull();
      expect(data[0].mappingStatus).toBe('UNMAPPED');
      expect(result.inserted).toBe(1);
      expect(result.unmapped).toBe(1);
    });
  });

  describe('validation and payload safety', () => {
    it('counts an invalid timestamp as invalid without failing the batch', async () => {
      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event({ occurredAtLocal: '2026-08-13 09:01:04Z' }), event()],
      );

      expect(result.invalid).toBe(1);
      expect(result.inserted).toBe(1);
      expect(result.issues[0].reason).toMatch(/YYYY-MM-DDTHH:mm:ss/);
    });

    it('rejects an event with no external user id', async () => {
      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [event({ externalUserId: '  ' })],
      );

      expect(result.invalid).toBe(1);
      expect(prisma.rawAttendanceEvent.createMany).not.toHaveBeenCalled();
    });

    it('strips credential-like and biometric-like keys from the raw payload', async () => {
      await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        [
          event({
            rawPayload: {
              readerId: 'R1',
              commKey: 'super-secret',
              password: 'nope',
              fingerprintTemplate: 'AAAA',
              faceTemplate: 'BBBB',
              apiToken: 'zzz',
            },
          }),
        ],
      );

      const [{ data }] = prisma.rawAttendanceEvent.createMany.mock.calls[0];
      expect(data[0].rawPayload).toEqual({ readerId: 'R1' });
      const serialized = JSON.stringify(data[0].rawPayload);
      expect(serialized).not.toContain('super-secret');
      expect(serialized).not.toContain('AAAA');
    });

    it('caps reported issues so a bad batch cannot return a huge payload', async () => {
      const bad = Array.from({ length: 200 }, (_, index) =>
        event({ externalUserId: `u${index}`, occurredAtLocal: 'bad' }),
      );

      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        bad,
      );

      expect(result.invalid).toBe(200);
      expect(result.issues.length).toBeLessThanOrEqual(50);
    });
  });

  describe('batching', () => {
    it('splits large batches into chunks', async () => {
      const many = Array.from({ length: 1200 }, (_, index) =>
        event({ externalUserId: `user-${index}` }),
      );

      const result = await service.ingestBatch(
        { tenantId: TENANT, integrationId: INTEGRATION, deviceId: DEVICE },
        many,
      );

      expect(prisma.rawAttendanceEvent.createMany).toHaveBeenCalledTimes(3);
      expect(result.received).toBe(1200);
      expect(result.inserted).toBe(1200);
    });
  });
});
