import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceIntegrationStatus } from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import type { ConnectorConfigurationValidator } from '../connectors/connector-configuration.validator';
import type { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import { AttendanceDeviceService } from './attendance-device.service';

/**
 * Verify device — the action that lets an on-premise integration make its first
 * move.
 *
 * Until BUG-2732 there was no route here at all, and the readiness panel told
 * administrators to run something that did not exist. What these assert is the
 * shape of the request, not the gateway's response to it: DijiPeople cannot
 * reach a terminal on a customer's LAN, so this records intent and the gateway
 * collects it. The far half is covered by REG-394 and QA-ATT-014.
 */
describe('AttendanceDeviceService.requestDeviceVerification', () => {
  const TENANT = 'tenant-a';
  const DEVICE = 'device-1';

  const user = { tenantId: TENANT, userId: 'user-1' } as AuthenticatedUser;

  let prisma: {
    attendanceDevice: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: AttendanceDeviceService;

  const device = (overrides: Record<string, unknown> = {}) => ({
    id: DEVICE,
    isEnabled: true,
    gatewayId: 'gateway-1',
    syncRequestedAt: null,
    syncRequestAcknowledgedAt: null,
    integration: {
      gatewayId: 'gateway-1',
      status: AttendanceIntegrationStatus.UNVERIFIED,
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      attendanceDevice: {
        findFirst: jest.fn().mockResolvedValue(device()),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    service = new AttendanceDeviceService(
      prisma as unknown as PrismaService,
      {} as AttendanceConnectorRegistry,
      {} as ConnectorConfigurationValidator,
      {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
    );
  });

  it('records a request for an integration that is still UNVERIFIED', async () => {
    // The whole point. Activation waits on a verified device, so refusing here
    // because the integration is not active would close the loop again.
    const result = await service.requestDeviceVerification(user, DEVICE);

    expect(result.requested).toBe(true);
    expect(result.alreadyOutstanding).toBe(false);
    expect(prisma.attendanceDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncRequestedById: 'user-1' }),
      }),
    );
  });

  it('records a request for an integration that is still DRAFT', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({
        integration: {
          gatewayId: 'gateway-1',
          status: AttendanceIntegrationStatus.DRAFT,
        },
      }),
    );

    await expect(
      service.requestDeviceVerification(user, DEVICE),
    ).resolves.toMatchObject({ requested: true });
  });

  it('refuses when the integration is disabled', async () => {
    // A request nothing will ever answer is worse than a refusal: the gateway
    // will not dial a terminal the tenant deliberately stood down, so the
    // operator would wait for a result that cannot arrive.
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({
        integration: {
          gatewayId: 'gateway-1',
          status: AttendanceIntegrationStatus.DISABLED,
        },
      }),
    );

    await expect(
      service.requestDeviceVerification(user, DEVICE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendanceDevice.update).not.toHaveBeenCalled();
  });

  it('refuses a disabled device', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({ isEnabled: false }),
    );

    await expect(
      service.requestDeviceVerification(user, DEVICE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendanceDevice.update).not.toHaveBeenCalled();
  });

  it('refuses when no gateway serves the device', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({
        gatewayId: null,
        integration: {
          gatewayId: null,
          status: AttendanceIntegrationStatus.UNVERIFIED,
        },
      }),
    );

    await expect(
      service.requestDeviceVerification(user, DEVICE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent while a request is still outstanding', async () => {
    // Repeated clicks must not queue a second verification behind the first.
    const requestedAt = new Date('2026-09-09T01:00:00.000Z');
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({ syncRequestedAt: requestedAt, syncRequestAcknowledgedAt: null }),
    );

    const result = await service.requestDeviceVerification(user, DEVICE);

    expect(result.alreadyOutstanding).toBe(true);
    expect(result.verificationRequestedAt).toBe(requestedAt);
    expect(prisma.attendanceDevice.update).not.toHaveBeenCalled();
  });

  it('records a new request once the previous one was acknowledged', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue(
      device({
        syncRequestedAt: new Date('2026-09-09T01:00:00.000Z'),
        syncRequestAcknowledgedAt: new Date('2026-09-09T01:05:00.000Z'),
      }),
    );

    const result = await service.requestDeviceVerification(user, DEVICE);

    expect(result.alreadyOutstanding).toBe(false);
    expect(prisma.attendanceDevice.update).toHaveBeenCalled();
  });

  it('does not reach a device in another tenant', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue(null);

    await expect(
      service.requestDeviceVerification(user, DEVICE),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.attendanceDevice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});
