import {
  AttendanceConnectionMode,
  AttendanceDeviceStatus,
  AttendanceIntegrationStatus,
  AttendanceSyncIntervalUnit,
  AttendanceSyncMode,
} from '@prisma/client';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import type { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import { GatewayConfigurationService } from './gateway-configuration.service';

/**
 * What a gateway is allowed to be told, and what it is told to do with it.
 *
 * The scoping assertions here are the important ones: this is the only endpoint
 * that decrypts a connector secret for a caller outside the server, so the query
 * that decides which rows it covers is load-bearing.
 */
describe('GatewayConfigurationService', () => {
  const TENANT = 'tenant-a';
  const GATEWAY = 'gateway-a';

  let prisma: { attendanceIntegration: { findMany: jest.Mock } };
  let secrets: { decrypt: jest.Mock; encrypt: jest.Mock };
  let tenantSettings: { getAttendanceSettings: jest.Mock };
  let service: GatewayConfigurationService;

  const settings = {
    integrationEnabled: true,
    minimumLegacyPollIntervalMinutes: 15,
    defaultDevicePollIntervalMinutes: 30,
    deviceClockDriftWarningSeconds: 60,
    deviceClockDriftCriticalSeconds: 300,
    gatewayHeartbeatIntervalSeconds: 60,
    gatewayConfigRefreshSeconds: 300,
    gatewayUploadBatchSize: 500,
  };

  const policy = {
    mode: AttendanceSyncMode.POLL,
    intervalValue: 30,
    intervalUnit: AttendanceSyncIntervalUnit.MINUTES,
    activeWindowStart: null,
    activeWindowEnd: null,
    timezone: null,
    maxConcurrency: 1,
    retryIntervalValue: 5,
    retryIntervalUnit: AttendanceSyncIntervalUnit.MINUTES,
    maxRetries: 3,
    jitterSeconds: 30,
  };

  function device(overrides: Record<string, unknown> = {}) {
    return {
      id: 'device-1',
      name: 'Front door',
      serialNumber: 'A2QO221160250',
      host: '192.168.18.53',
      port: 4370,
      machineNumber: 1,
      timezone: 'Asia/Karachi',
      directionMode: 'BOTH',
      status: AttendanceDeviceStatus.ACTIVE,
      isEnabled: true,
      configuration: {},
      verificationStatus: 'UNVERIFIED',
      lastVerifiedAt: null,
      syncRequestedAt: null,
      gatewayId: GATEWAY,
      syncPolicy: null,
      ...overrides,
    };
  }

  function integration(overrides: Record<string, unknown> = {}) {
    return {
      id: 'integration-1',
      name: 'Head office terminals',
      provider: 'ZKTECO',
      connectorType: 'zkteco-legacy-tcp',
      connectionMode: AttendanceConnectionMode.LOCAL_GATEWAY,
      status: AttendanceIntegrationStatus.ACTIVE,
      isActive: true,
      gatewayId: GATEWAY,
      configuration: { host: '192.168.18.53', port: 4370 },
      encryptedConfiguration: 'encrypted-blob',
      syncPolicy: policy,
      devices: [device()],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = { attendanceIntegration: { findMany: jest.fn() } };
    secrets = {
      decrypt: jest.fn().mockReturnValue(JSON.stringify({ commKey: 123456 })),
      encrypt: jest.fn(),
    };
    tenantSettings = {
      getAttendanceSettings: jest.fn().mockResolvedValue(settings),
    };

    service = new GatewayConfigurationService(
      prisma as unknown as PrismaService,
      secrets as unknown as SecretEncryptionService,
      new AttendanceConnectorRegistry(),
      tenantSettings as unknown as TenantSettingsResolverService,
    );
  });

  it('scopes every query to the calling tenant AND gateway', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);

    await service.buildFor(TENANT, GATEWAY, 'Head office');

    const query = prisma.attendanceIntegration.findMany.mock.calls[0][0];

    // Both filters must be present. Tenant alone would let one tenant's gateway
    // enumerate a sibling gateway's terminals and their comm keys.
    expect(query.where.tenantId).toBe(TENANT);
    expect(query.where.OR).toEqual([
      { gatewayId: GATEWAY },
      { devices: { some: { tenantId: TENANT, gatewayId: GATEWAY } } },
    ]);
    expect(query.include.devices.where.tenantId).toBe(TENANT);
  });

  it('never reads a tenant or gateway from anywhere but its arguments', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.gatewayId).toBe(GATEWAY);
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it('delivers decrypted connector secrets to the gateway', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    // The gateway cannot open a session with the terminal without this, and it
    // is the only caller that ever receives it — the admin API reports presence
    // and a fixed-width mask.
    expect(result.integrations[0].configuration.commKey).toBe(123456);
  });

  it('treats an undecryptable secret as absent rather than failing the fetch', async () => {
    secrets.decrypt.mockImplementation(() => {
      throw new Error('key rotated');
    });
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    // The gateway still gets its device list and reports the connection failure
    // honestly, rather than the whole site going dark on one bad secret.
    expect(result.integrations[0].configuration.commKey).toBeUndefined();
    expect(result.integrations[0].devices).toHaveLength(1);
  });

  it('excludes a device that belongs to a different gateway', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({
        gatewayId: null,
        devices: [device(), device({ id: 'device-2', gatewayId: 'gateway-b' })],
      }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.integrations[0].devices.map((item) => item.deviceId)).toEqual(
      ['device-1'],
    );
  });

  it('gives a device with no gateway of its own to the integration’s gateway', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({ devices: [device({ gatewayId: null })] }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.integrations[0].devices).toHaveLength(1);
  });

  it('raises an interval below the connector floor before sending it', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({
        syncPolicy: { ...policy, intervalValue: 1 },
      }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');
    const resolved = result.integrations[0].devices[0].syncPolicy!;

    // ZKTeco Legacy re-reads the whole history on every poll, so a one-minute
    // schedule is not a preference to honour.
    expect(resolved.intervalMinutes).toBe(15);
    expect(resolved.intervalClamped).toBe(true);
  });

  it('prefers a device’s own schedule over the integration’s', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({
        devices: [
          device({
            syncPolicy: { ...policy, intervalValue: 2, intervalUnit: 'HOURS' },
          }),
        ],
      }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');
    const resolved = result.integrations[0].devices[0].syncPolicy!;

    expect(resolved.intervalMinutes).toBe(120);
    expect(resolved.source).toBe('DEVICE');
  });

  it('reports a missing timezone instead of substituting one', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({
        configuration: {},
        devices: [device({ timezone: null })],
      }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.integrations[0].devices[0].timezone).toBeNull();
    // The gateway is told explicitly, so it does not silently use the machine's
    // own timezone for a terminal that may be somewhere else entirely.
    expect(result.integrations[0].devices[0].timezoneMissing).toBe(true);
  });

  it('falls back to the connector timezone when the device has none', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({
        configuration: { timezone: 'Asia/Dubai' },
        devices: [device({ timezone: null })],
      }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.integrations[0].devices[0].timezone).toBe('Asia/Dubai');
    expect(result.integrations[0].devices[0].timezoneMissing).toBe(false);
  });

  it('skips an integration whose connector this build cannot serve', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({ connectorType: 'hikvision-isapi' }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    // Half-describing it would produce failures the operator cannot act on.
    expect(result.integrations).toHaveLength(0);
  });

  it('produces the same version when nothing has changed', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);
    const first = await service.buildFor(TENANT, GATEWAY, 'Head office');

    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);
    const second = await service.buildFor(TENANT, GATEWAY, 'Head office');

    // Lets a gateway skip reconfiguring on a refresh that changed nothing.
    expect(second.configVersion).toBe(first.configVersion);
  });

  it('changes the version when a device address changes', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);
    const first = await service.buildFor(TENANT, GATEWAY, 'Head office');

    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({ devices: [device({ host: '192.168.18.54' })] }),
    ]);
    const second = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(second.configVersion).not.toBe(first.configVersion);
  });

  it('changes the version when a secret is rotated', async () => {
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);
    const first = await service.buildFor(TENANT, GATEWAY, 'Head office');

    secrets.decrypt.mockReturnValue(JSON.stringify({ commKey: 999999 }));
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);
    const second = await service.buildFor(TENANT, GATEWAY, 'Head office');

    // A rotated comm key must reach the gateway, so it has to register as a
    // change even though nothing visible in the admin UI moved.
    expect(second.configVersion).not.toBe(first.configVersion);
  });

  it('never lets the batch size exceed the ingestion endpoint’s own limit', async () => {
    tenantSettings.getAttendanceSettings.mockResolvedValue({
      ...settings,
      gatewayUploadBatchSize: 100000,
    });
    prisma.attendanceIntegration.findMany.mockResolvedValue([integration()]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.policy.uploadBatchSize).toBeLessThanOrEqual(
      result.policy.maxEventsPerRequest,
    );
  });

  it('passes an outstanding manual sync request through to the gateway', async () => {
    const requestedAt = new Date('2026-08-14T09:00:00.000Z');
    prisma.attendanceIntegration.findMany.mockResolvedValue([
      integration({ devices: [device({ syncRequestedAt: requestedAt })] }),
    ]);

    const result = await service.buildFor(TENANT, GATEWAY, 'Head office');

    expect(result.integrations[0].devices[0].syncRequestedAt).toBe(
      requestedAt.toISOString(),
    );
  });
});
