import {
  AttendanceDeviceHealth,
  AttendanceDeviceVerificationStatus,
  DeviceProvisioningStatus,
  IntegrationRunStatus,
  IntegrationRunType,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import type { RawAttendanceIngestionService } from '../ingestion/raw-attendance-ingestion.service';
import type { EmployeeMappingService } from '../mapping/employee-mapping.service';
import type { ResolvedGatewayIdentity } from './gateway-credential.service';
import { GatewayRuntimeService } from './gateway-runtime.service';

/**
 * What a gateway is allowed to report, and what the server concludes from it.
 *
 * The gateway reports facts; the server decides state. These tests are mostly
 * about that boundary — a gateway must not be able to declare a device healthy,
 * verified, or belonging to it.
 */
describe('GatewayRuntimeService', () => {
  const identity: ResolvedGatewayIdentity = {
    tenantId: 'tenant-a',
    gatewayId: 'gateway-a',
    credentialId: 'credential-1',
    gatewayName: 'Head office',
    status: 'ONLINE' as never,
  };

  let prisma: {
    attendanceDevice: { findFirst: jest.Mock; update: jest.Mock };
    attendanceIntegration: { findFirst: jest.Mock; update: jest.Mock };
    integrationRun: { create: jest.Mock };
    integrationGateway: { update: jest.Mock };
    externalDeviceUser: { update: jest.Mock };
    deviceProvisioningJob: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let ingestion: { upsertDiscoveredUser: jest.Mock };
  let mapping: { match: jest.Mock; confirmMapping: jest.Mock };
  let tenantSettings: { getAttendanceSettings: jest.Mock };
  let service: GatewayRuntimeService;

  const settings = {
    deviceClockDriftWarningSeconds: 60,
    deviceClockDriftCriticalSeconds: 300,
    deviceProvisioningEnabled: true,
    provisioningRetryIntervalMinutes: 15,
  };

  const device = {
    id: 'device-1',
    gatewayId: 'gateway-a',
    integrationId: 'integration-1',
    serialNumber: 'A2QO221160250',
    actualSerialNumber: null,
    lastDeviceTimeLocal: null,
    lastVerifiedAt: null,
    lastSeenAt: null,
    model: null,
    firmwareVersion: null,
    macAddress: null,
    integration: { gatewayId: 'gateway-a' },
  };

  beforeEach(() => {
    prisma = {
      attendanceDevice: {
        findFirst: jest.fn().mockResolvedValue(device),
        update: jest.fn().mockResolvedValue({}),
      },
      attendanceIntegration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'integration-1',
          provider: 'ZKTECO',
          gatewayId: 'gateway-a',
          connectorType: 'zkteco-legacy-tcp',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      integrationRun: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'run-1', status: 'SUCCEEDED' }),
      },
      integrationGateway: { update: jest.fn().mockResolvedValue({}) },
      externalDeviceUser: { update: jest.fn().mockResolvedValue({}) },
      deviceProvisioningJob: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    ingestion = {
      upsertDiscoveredUser: jest
        .fn()
        .mockResolvedValue({ id: 'external-1', mappingStatus: 'UNMATCHED' }),
    };
    mapping = {
      match: jest.fn().mockResolvedValue({
        autoMatch: null,
        suggestions: [],
        conflict: false,
      }),
      confirmMapping: jest.fn().mockResolvedValue({ backfilledEvents: 0 }),
    };
    tenantSettings = {
      getAttendanceSettings: jest.fn().mockResolvedValue(settings),
    };

    service = new GatewayRuntimeService(
      prisma as unknown as PrismaService,
      ingestion as unknown as RawAttendanceIngestionService,
      mapping as unknown as EmployeeMappingService,
      new AttendanceConnectorRegistry(),
      tenantSettings as unknown as TenantSettingsResolverService,
    );
  });

  // ---------------------------------------------------------- verification

  it('records a matching serial as verified and healthy', async () => {
    const result = await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'A2QO221160250',
      deviceTimeLocal: '2026-08-14T09:00:00',
      clockDriftSeconds: 3,
    });

    expect(result.verificationStatus).toBe(
      AttendanceDeviceVerificationStatus.VERIFIED,
    );
    expect(result.healthStatus).toBe(AttendanceDeviceHealth.HEALTHY);
    expect(result.serialMatches).toBe(true);
  });

  it('flags a terminal that answers with a different serial', async () => {
    const result = await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'SOMETHING-ELSE',
    });

    // Reachable and wrong. Treating this as verified would attribute one site's
    // attendance to another.
    expect(result.verificationStatus).toBe(
      AttendanceDeviceVerificationStatus.SERIAL_MISMATCH,
    );
    expect(result.serialMatches).toBe(false);
  });

  it('never overwrites the configured serial with the observed one', async () => {
    await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'SOMETHING-ELSE',
    });

    const written = prisma.attendanceDevice.update.mock.calls[0][0].data;

    expect(written.actualSerialNumber).toBe('SOMETHING-ELSE');
    // Overwriting `serialNumber` would erase the evidence of the mismatch and
    // the next check would agree with itself.
    expect(written).not.toHaveProperty('serialNumber');
  });

  it('reports an unreachable device as unreachable, not merely unverified', async () => {
    const result = await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: false,
      errorCode: 'DEVICE_UNREACHABLE',
    });

    expect(result.verificationStatus).toBe(
      AttendanceDeviceVerificationStatus.FAILED,
    );
    expect(result.healthStatus).toBe(AttendanceDeviceHealth.UNREACHABLE);
  });

  it('grades clock drift against the tenant’s own thresholds', async () => {
    const warning = await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'A2QO221160250',
      clockDriftSeconds: 120,
    });
    expect(warning.clockDriftSeverity).toBe('WARNING');

    const critical = await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'A2QO221160250',
      clockDriftSeconds: 900,
    });
    expect(critical.clockDriftSeverity).toBe('CRITICAL');
    // A terminal whose clock is far out is answering, but its punch timestamps
    // cannot be trusted, so it is not HEALTHY.
    expect(critical.healthStatus).toBe(AttendanceDeviceHealth.DEGRADED);
  });

  it('refuses a device timestamp that is not a bare wall clock', async () => {
    await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
      actualSerialNumber: 'A2QO221160250',
      // A UTC instant is not what a ZKTeco terminal reports, and storing one
      // would imply an offset the device never stated.
      deviceTimeLocal: '2026-08-14T09:00:00Z',
    });

    const written = prisma.attendanceDevice.update.mock.calls[0][0].data;
    expect(written.lastDeviceTimeLocal).toBeNull();
  });

  // --------------------------------------------------------------- scoping

  it('refuses a device served by a different gateway', async () => {
    prisma.attendanceDevice.findFirst.mockResolvedValue({
      ...device,
      gatewayId: 'gateway-b',
      integration: { gatewayId: 'gateway-b' },
    });

    await expect(
      service.recordVerification(identity, {
        deviceId: 'device-1',
        connected: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an integration served by a different gateway', async () => {
    prisma.attendanceIntegration.findFirst.mockResolvedValue({
      id: 'integration-1',
      provider: 'ZKTECO',
      gatewayId: 'gateway-b',
      connectorType: 'zkteco-legacy-tcp',
    });

    await expect(
      service.recordDiscoveredUsers(identity, {
        integrationId: 'integration-1',
        users: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves everything from the credential, never from the payload', async () => {
    await service.recordVerification(identity, {
      deviceId: 'device-1',
      connected: true,
    });

    const where = prisma.attendanceDevice.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(identity.tenantId);
  });

  // ------------------------------------------------------------- discovery

  it('records discovered users without creating employees', async () => {
    const result = await service.recordDiscoveredUsers(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      users: [
        {
          externalUserId: '1',
          name: 'Ayesha Khan',
          privilegeRaw: 0,
          enabled: true,
        },
        { externalUserId: '2', name: 'Bilal Ahmed' },
      ],
    });

    expect(result.recorded).toBe(2);
    expect(ingestion.upsertDiscoveredUser).toHaveBeenCalledTimes(2);

    // A terminal is not an authoritative source of who works here.
    const written = ingestion.upsertDiscoveredUser.mock.calls[0][0];
    expect(written).not.toHaveProperty('employeeId');
  });

  it('applies only an exact-identifier match automatically', async () => {
    mapping.match.mockResolvedValue({
      autoMatch: {
        employeeId: 'employee-1',
        strategy: 'EMPLOYEE_CODE',
        confidence: 'CONFIRMED',
        reason: 'code matches',
      },
      suggestions: [],
      conflict: false,
    });

    const result = await service.recordDiscoveredUsers(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      users: [{ externalUserId: '1' }],
    });

    expect(result.autoMapped).toBe(1);
    expect(mapping.confirmMapping).toHaveBeenCalled();
  });

  it('leaves a name-similarity match for a human to confirm', async () => {
    mapping.match.mockResolvedValue({
      autoMatch: null,
      suggestions: [{ employeeId: 'employee-1', reason: 'name looks similar' }],
      conflict: false,
    });

    const result = await service.recordDiscoveredUsers(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      users: [{ externalUserId: '1' }],
    });

    expect(result.autoMapped).toBe(0);
    expect(result.suggested).toBe(1);
    expect(mapping.confirmMapping).not.toHaveBeenCalled();
  });

  it('does not reopen a mapping an administrator has already ignored', async () => {
    ingestion.upsertDiscoveredUser.mockResolvedValue({
      id: 'external-1',
      mappingStatus: 'IGNORED',
    });

    await service.recordDiscoveredUsers(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      users: [{ externalUserId: '1' }],
    });

    expect(mapping.match).not.toHaveBeenCalled();
  });

  it('drops a discovered user with no identifier rather than storing a blank', async () => {
    const result = await service.recordDiscoveredUsers(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      users: [{ externalUserId: '   ' }],
    });

    expect(result.recorded).toBe(0);
    expect(result.failed).toBe(1);
  });

  // ------------------------------------------------------------------ runs

  it('records a run and rolls the device’s last-sync stamps forward', async () => {
    await service.recordRun(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      runType: IntegrationRunType.ATTENDANCE_PULL,
      status: IntegrationRunStatus.SUCCEEDED,
      startedAt: '2026-08-14T09:00:00.000Z',
      completedAt: '2026-08-14T09:00:20.000Z',
      recordsRead: 40,
      recordsNew: 4,
      recordsDuplicate: 36,
    });

    const run = prisma.integrationRun.create.mock.calls[0][0].data;
    expect(run.recordsDuplicate).toBe(36);
    expect(run.gatewayId).toBe('gateway-a');

    const deviceUpdate = prisma.attendanceDevice.update.mock.calls[0][0].data;
    expect(deviceUpdate.lastSuccessfulSyncAt).toBeInstanceOf(Date);
  });

  it('clears the integration error only when a run actually succeeded', async () => {
    await service.recordRun(identity, {
      integrationId: 'integration-1',
      runType: IntegrationRunType.ATTENDANCE_PULL,
      status: IntegrationRunStatus.FAILED,
      startedAt: '2026-08-14T09:00:00.000Z',
      errorCode: 'DEVICE_UNREACHABLE',
    });

    const update = prisma.attendanceIntegration.update.mock.calls[0][0].data;
    expect(update.lastErrorCode).toBe('DEVICE_UNREACHABLE');
    expect(update.lastSuccessfulSyncAt).toBeUndefined();
  });

  it('acknowledges only the manual request the gateway actually answered', async () => {
    const requestedAt = '2026-08-14T09:00:00.000Z';

    await service.recordRun(identity, {
      integrationId: 'integration-1',
      deviceId: 'device-1',
      runType: IntegrationRunType.ATTENDANCE_PULL,
      status: IntegrationRunStatus.SUCCEEDED,
      startedAt: requestedAt,
      acknowledgesSyncRequestedAt: requestedAt,
    });

    const update = prisma.attendanceDevice.update.mock.calls[0][0].data;
    // A newer request made while this run was in flight stays outstanding.
    expect(update.syncRequestAcknowledgedAt).toEqual(new Date(requestedAt));
  });

  it('clamps negative record counts a gateway might send', async () => {
    await service.recordRun(identity, {
      integrationId: 'integration-1',
      runType: IntegrationRunType.HEALTH_CHECK,
      status: IntegrationRunStatus.SUCCEEDED,
      startedAt: '2026-08-14T09:00:00.000Z',
      recordsRead: -5,
    });

    expect(prisma.integrationRun.create.mock.calls[0][0].data.recordsRead).toBe(
      0,
    );
  });

  // ------------------------------------------------------------ provisioning

  it('hands out nothing while the tenant has provisioning switched off', async () => {
    tenantSettings.getAttendanceSettings.mockResolvedValue({
      ...settings,
      deviceProvisioningEnabled: false,
    });

    const result = await service.claimProvisioningJobs(identity);

    expect(result.disabled).toBe(true);
    expect(result.claimed).toHaveLength(0);
  });

  it('refuses to hand out a job for an uncertified connector', async () => {
    prisma.deviceProvisioningJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        operation: 'CREATE_USER',
        attemptCount: 0,
        maxAttempts: 3,
        startedAt: null,
        resultExternalUserId: null,
        device: {
          id: 'device-1',
          name: 'Front door',
          serialNumber: 'A2QO221160250',
          host: '192.168.18.53',
          port: 4370,
          machineNumber: 1,
          // ZKTeco Legacy declares WRITE_USERS as experimental, so it is not
          // certified for automation.
          integration: {
            id: 'integration-1',
            connectorType: 'zkteco-legacy-tcp',
          },
        },
        employee: {
          id: 'employee-1',
          employeeCode: 'EMP-0001',
          firstName: 'Ayesha',
          lastName: 'Khan',
        },
      },
    ]);

    const result = await service.claimProvisioningJobs(identity);

    expect(result.claimed).toHaveLength(0);
    expect(result.skippedUncertified).toBe(1);
    // The claim is not even attempted, so the job stays available for a build
    // whose adapter has been certified.
    expect(prisma.deviceProvisioningJob.updateMany).not.toHaveBeenCalled();
  });

  it('only queries jobs for devices this gateway serves', async () => {
    await service.claimProvisioningJobs(identity);

    const where = prisma.deviceProvisioningJob.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-a');
    expect(where.device.gatewayId).toBe('gateway-a');
  });

  it('refuses a result for a job this gateway does not hold', async () => {
    prisma.deviceProvisioningJob.findFirst.mockResolvedValue(null);

    await expect(
      service.reportProvisioningResult(identity, {
        jobId: 'job-1',
        succeeded: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The lookup itself is scoped to the claiming gateway, so a job id alone is
    // not enough to report an outcome for someone else's work.
    const where = prisma.deviceProvisioningJob.findFirst.mock.calls[0][0].where;
    expect(where.claimedByGatewayId).toBe('gateway-a');
  });

  it('schedules a retry rather than failing a job with attempts left', async () => {
    prisma.deviceProvisioningJob.findFirst.mockResolvedValue({
      id: 'job-1',
      attemptCount: 1,
      maxAttempts: 3,
      status: DeviceProvisioningStatus.PROCESSING,
    });

    const result = await service.reportProvisioningResult(identity, {
      jobId: 'job-1',
      succeeded: false,
      errorCode: 'DEVICE_BUSY',
    });

    expect(result.status).toBe(DeviceProvisioningStatus.RETRYING);

    const update = prisma.deviceProvisioningJob.update.mock.calls[0][0].data;
    expect(update.nextRetryAt).toBeInstanceOf(Date);
    // The lease is released so a retry is claimable at once rather than waiting
    // for it to lapse.
    expect(update.claimedByGatewayId).toBeNull();
  });

  it('fails a job once its attempts are exhausted', async () => {
    prisma.deviceProvisioningJob.findFirst.mockResolvedValue({
      id: 'job-1',
      attemptCount: 3,
      maxAttempts: 3,
      status: DeviceProvisioningStatus.PROCESSING,
    });

    const result = await service.reportProvisioningResult(identity, {
      jobId: 'job-1',
      succeeded: false,
      errorCode: 'WRITE_NOT_CERTIFIED',
    });

    expect(result.status).toBe(DeviceProvisioningStatus.FAILED);
  });
});
