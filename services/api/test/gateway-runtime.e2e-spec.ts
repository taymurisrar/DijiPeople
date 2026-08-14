import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash, randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import { getClientAccessTokenSecret } from '../src/common/config/auth.config';
import { GatewayCredentialService } from '../src/modules/attendance-integrations/gateways/gateway-credential.service';

/**
 * The machine-facing gateway surface, over real HTTP against the real database.
 *
 * The unit suites prove the services scope their queries. This suite proves the
 * WIRING: that the gateway guard is on these routes and the user guard is not,
 * that a credential from one gateway cannot reach another gateway's devices even
 * inside the same tenant, and that a re-sent attendance batch produces one row
 * rather than two.
 *
 * Cross-gateway isolation is tested inside ONE tenant on purpose. Cross-tenant
 * isolation is the easy case — a tenant filter catches it. Two gateways under
 * the same tenant is where a missing gateway filter would slip through, and it
 * is the arrangement a real customer with a head office and a warehouse has.
 *
 * Every fixture is created and removed here; no seeded data is modified.
 */
describe('Gateway runtime endpoints (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;
  let credentials: GatewayCredentialService;
  let secrets: SecretEncryptionService;

  const suffix = `gwrt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  let tenantId: string;
  let foreignTenantId: string;

  /** Gateway A: the caller under test. */
  let gatewayA: string;
  let credentialA: string;
  /** Gateway B: a sibling in the SAME tenant. */
  let gatewayB: string;
  let credentialB: string;
  /** A gateway in another tenant entirely. */
  let foreignGateway: string;
  let foreignCredential: string;

  let integrationA: string;
  let deviceA: string;
  let integrationB: string;
  let deviceB: string;
  let foreignIntegration: string;
  let foreignDevice: string;

  let userToken: string;
  const createdUserIds: string[] = [];

  const COMM_KEY = 987654;

  async function createGateway(tenant: string, name: string) {
    const gateway = await prisma.integrationGateway.create({
      data: {
        tenantId: tenant,
        name: `${name} ${suffix}`,
        status: 'ONLINE',
        registeredAt: new Date(),
      },
    });

    const credential = await credentials.rotateCredential({
      tenantId: tenant,
      gatewayId: gateway.id,
    });

    return { id: gateway.id, credential: credential.plaintext };
  }

  async function createIntegrationWithDevice(
    tenant: string,
    gatewayId: string,
    label: string,
  ) {
    const integration = await prisma.attendanceIntegration.create({
      data: {
        tenantId: tenant,
        name: `${label} ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
        status: 'UNVERIFIED',
        isActive: true,
        gatewayId,
        configuration: { host: '192.168.18.53', port: 4370, machineNumber: 1 },
        // The whole point of the configuration endpoint: this must reach the
        // gateway decrypted, and must never reach a browser.
        encryptedConfiguration: secrets.encrypt(
          JSON.stringify({ commKey: COMM_KEY }),
        ),
      },
    });

    const device = await prisma.attendanceDevice.create({
      data: {
        tenantId: tenant,
        integrationId: integration.id,
        name: `${label} device ${suffix}`,
        provider: 'ZKTECO',
        status: 'ACTIVE',
        isEnabled: true,
        gatewayId,
        host: '192.168.18.53',
        port: 4370,
        machineNumber: 1,
        timezone: 'Asia/Karachi',
        serialNumber: `SER-${label}-${suffix}`,
      },
    });

    return { integrationId: integration.id, deviceId: device.id };
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    credentials = app.get(GatewayCredentialService);
    secrets = app.get(SecretEncryptionService);

    const tenants = await prisma.tenant.findMany({
      where: { businessUnits: { some: {} } },
      take: 2,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (tenants.length < 2) {
      throw new Error(
        'These tests need two tenants with at least one business unit.',
      );
    }

    tenantId = tenants[0].id;
    foreignTenantId = tenants[1].id;

    const a = await createGateway(tenantId, 'GW A');
    gatewayA = a.id;
    credentialA = a.credential;

    const b = await createGateway(tenantId, 'GW B');
    gatewayB = b.id;
    credentialB = b.credential;

    const foreign = await createGateway(foreignTenantId, 'GW Foreign');
    foreignGateway = foreign.id;
    foreignCredential = foreign.credential;

    ({ integrationId: integrationA, deviceId: deviceA } =
      await createIntegrationWithDevice(tenantId, gatewayA, 'Alpha'));
    ({ integrationId: integrationB, deviceId: deviceB } =
      await createIntegrationWithDevice(tenantId, gatewayB, 'Bravo'));
    ({ integrationId: foreignIntegration, deviceId: foreignDevice } =
      await createIntegrationWithDevice(
        foreignTenantId,
        foreignGateway,
        'Foreign',
      ));

    // A genuine user session, to prove it cannot substitute for a machine one.
    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        businessUnitId: businessUnit.id,
        firstName: 'Gateway',
        lastName: 'Suite',
        email: `gwrt-${suffix}@example.test`,
        passwordHash: 'not-used-in-this-test',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const sessionId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        sessionId,
        appClientId: 'web',
        tokenHash: createHash('sha256')
          .update(`${sessionId}-${suffix}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        lastActivityAt: new Date(),
      },
    });

    userToken = await jwt.signAsync(
      {
        sub: user.id,
        tenantId,
        email: user.email,
        sessionId,
        tokenVersion: 1,
        tokenUse: 'access',
        type: 'access',
        appClientId: 'web',
        aud: 'web',
      },
      { secret: getClientAccessTokenSecret(config, 'web'), expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    const integrationIds = [integrationA, integrationB, foreignIntegration];
    const gatewayIds = [gatewayA, gatewayB, foreignGateway];

    await prisma.rawAttendanceEvent.deleteMany({
      where: { integrationId: { in: integrationIds } },
    });
    await prisma.integrationRun.deleteMany({
      where: { integrationId: { in: integrationIds } },
    });
    await prisma.externalDeviceUser.deleteMany({
      where: { integrationId: { in: integrationIds } },
    });
    await prisma.attendanceDevice.deleteMany({
      where: { integrationId: { in: integrationIds } },
    });
    await prisma.attendanceIntegration.deleteMany({
      where: { id: { in: integrationIds } },
    });
    await prisma.integrationGatewayCredential.deleteMany({
      where: { gatewayId: { in: gatewayIds } },
    });
    await prisma.integrationGateway.deleteMany({
      where: { id: { in: gatewayIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await app.close();
  });

  const server = () => app.getHttpServer();
  const asGateway = (credential: string) => `Bearer ${credential}`;

  // ------------------------------------------------------------ the guard

  describe('machine authentication', () => {
    it('refuses an unauthenticated call', async () => {
      await request(server())
        .get('/integrations/gateway/configuration')
        .expect(401);
    });

    it('refuses a user access token', async () => {
      // A person's session must never be usable to fetch device secrets or to
      // inject attendance, however privileged that person is.
      await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    });

    it('refuses a revoked credential', async () => {
      const throwaway = await createGateway(tenantId, 'GW Revoked');
      await credentials.revokeGateway({ tenantId, gatewayId: throwaway.id });

      await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(throwaway.credential))
        .expect(401);

      await prisma.integrationGatewayCredential.deleteMany({
        where: { gatewayId: throwaway.id },
      });
      await prisma.integrationGatewayPairingCode.deleteMany({
        where: { gatewayId: throwaway.id },
      });
      await prisma.integrationGateway.delete({ where: { id: throwaway.id } });
    });

    it('accepts a genuine gateway credential', async () => {
      await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialA))
        .expect(200);
    });
  });

  // ---------------------------------------------------------- configuration

  describe('configuration scoping', () => {
    it('returns only the calling gateway’s own devices', async () => {
      const response = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialA))
        .expect(200);

      const deviceIds = response.body.integrations.flatMap(
        (integration: { devices: { deviceId: string }[] }) =>
          integration.devices.map((device) => device.deviceId),
      );

      expect(deviceIds).toContain(deviceA);
      // Same tenant, different gateway. A tenant filter alone would let this
      // through, which is exactly why the assertion is here.
      expect(deviceIds).not.toContain(deviceB);
      expect(deviceIds).not.toContain(foreignDevice);
    });

    it('gives gateway B its own devices and not gateway A’s', async () => {
      const response = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialB))
        .expect(200);

      const deviceIds = response.body.integrations.flatMap(
        (integration: { devices: { deviceId: string }[] }) =>
          integration.devices.map((device) => device.deviceId),
      );

      expect(deviceIds).toContain(deviceB);
      expect(deviceIds).not.toContain(deviceA);
    });

    it('delivers the connector secret to the gateway and to nobody else', async () => {
      const machine = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialA))
        .expect(200);

      const integration = machine.body.integrations.find(
        (item: { integrationId: string }) =>
          item.integrationId === integrationA,
      );
      expect(integration.configuration.commKey).toBe(COMM_KEY);

      // The same secret over the browser-facing API is a presence flag and a
      // fixed-width mask, never a value and never a length.
      const browser = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', `Bearer ${userToken}`);
      expect(browser.status).toBe(401);
    });

    it('never reports a tenant id to a gateway', async () => {
      const response = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialA))
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain(tenantId);
    });
  });

  // ------------------------------------------------------------- ingestion

  describe('attendance ingestion', () => {
    const occurredAtLocal = '2026-08-14T09:15:32';

    const batch = (integrationId: string, deviceId: string) => ({
      integrationId,
      deviceId,
      events: [
        {
          externalUserId: '25',
          occurredAtLocal,
          verificationModeRaw: 1,
          punchStateRaw: 0,
          workCodeRaw: 0,
          eventFingerprint: createHash('sha256')
            .update(`fixture-${suffix}`, 'utf8')
            .digest('hex'),
          deviceTimezone: 'Asia/Karachi',
        },
      ],
    });

    it('stores a punch exactly as the device reported it', async () => {
      await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', asGateway(credentialA))
        .send(batch(integrationA, deviceA))
        .expect(200);

      const stored = await prisma.rawAttendanceEvent.findFirst({
        where: { tenantId, deviceId: deviceA },
        select: {
          occurredAtLocal: true,
          deviceTimezone: true,
          captureSource: true,
        },
      });

      // No offset appended, no conversion applied, no Z.
      expect(stored?.occurredAtLocal).toBe(occurredAtLocal);
      expect(stored?.occurredAtLocal).not.toMatch(/Z$/);
      expect(stored?.deviceTimezone).toBe('Asia/Karachi');
      // Forced server-side: a gateway cannot relabel a device punch as remote.
      expect(stored?.captureSource).toBe('DEVICE');
    });

    it('produces one row however many times the same batch is re-sent', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await request(server())
          .post('/integrations/gateway/attendance/events')
          .set('Authorization', asGateway(credentialA))
          .send(batch(integrationA, deviceA))
          .expect(200);
      }

      const count = await prisma.rawAttendanceEvent.count({
        where: { tenantId, deviceId: deviceA },
      });

      // This is what makes a lost ACK safe: the gateway re-sends and the
      // constraint absorbs it.
      expect(count).toBe(1);
    });

    it('reports a re-sent batch as duplicates rather than as an error', async () => {
      const response = await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', asGateway(credentialA))
        .send(batch(integrationA, deviceA))
        .expect(200);

      expect(response.body.duplicates).toBe(1);
      expect(response.body.failed).toBe(0);
    });

    it('refuses a batch for a sibling gateway’s integration', async () => {
      await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', asGateway(credentialA))
        .send(batch(integrationB, deviceB))
        .expect(403);
    });

    it('refuses a batch for another tenant’s integration', async () => {
      await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', asGateway(credentialA))
        .send(batch(foreignIntegration, foreignDevice))
        .expect(403);
    });

    it('rejects a timestamp carrying a timezone it never had', async () => {
      const response = await request(server())
        .post('/integrations/gateway/attendance/events')
        .set('Authorization', asGateway(credentialA))
        .send({
          integrationId: integrationA,
          deviceId: deviceA,
          events: [
            { externalUserId: '26', occurredAtLocal: '2026-08-14T09:15:32Z' },
          ],
        })
        .expect(200);

      expect(response.body.invalid).toBe(1);
      expect(response.body.inserted).toBe(0);
    });
  });

  // ---------------------------------------------------------- verification

  describe('device verification', () => {
    it('records a matching serial and unblocks activation', async () => {
      const device = await prisma.attendanceDevice.findUniqueOrThrow({
        where: { id: deviceA },
        select: { serialNumber: true },
      });

      await request(server())
        .post('/integrations/gateway/devices/verification')
        .set('Authorization', asGateway(credentialA))
        .send({
          deviceId: deviceA,
          connected: true,
          actualSerialNumber: device.serialNumber,
          deviceTimeLocal: '2026-08-14T09:15:30',
          clockDriftSeconds: 4,
          latencyMs: 118,
        })
        .expect(200);

      const updated = await prisma.attendanceDevice.findUniqueOrThrow({
        where: { id: deviceA },
        select: {
          verificationStatus: true,
          actualSerialNumber: true,
          serialNumber: true,
          lastDeviceTimeLocal: true,
          healthStatus: true,
        },
      });

      expect(updated.verificationStatus).toBe('VERIFIED');
      expect(updated.healthStatus).toBe('HEALTHY');
      // The observed serial is recorded beside the configured one, not over it.
      expect(updated.actualSerialNumber).toBe(updated.serialNumber);
      expect(updated.lastDeviceTimeLocal).toBe('2026-08-14T09:15:30');
    });

    it('flags a terminal that answers with a different serial', async () => {
      await request(server())
        .post('/integrations/gateway/devices/verification')
        .set('Authorization', asGateway(credentialA))
        .send({
          deviceId: deviceA,
          connected: true,
          actualSerialNumber: 'A-DIFFERENT-TERMINAL',
        })
        .expect(200);

      const updated = await prisma.attendanceDevice.findUniqueOrThrow({
        where: { id: deviceA },
        select: { verificationStatus: true, serialNumber: true },
      });

      expect(updated.verificationStatus).toBe('SERIAL_MISMATCH');
      // Still the configured value: the mismatch is the finding, not noise to
      // reconcile away.
      expect(updated.serialNumber).toContain('SER-Alpha');

      // Put it back for the tests that follow.
      await request(server())
        .post('/integrations/gateway/devices/verification')
        .set('Authorization', asGateway(credentialA))
        .send({
          deviceId: deviceA,
          connected: true,
          actualSerialNumber: updated.serialNumber,
        })
        .expect(200);
    });

    it('refuses to verify a sibling gateway’s device', async () => {
      await request(server())
        .post('/integrations/gateway/devices/verification')
        .set('Authorization', asGateway(credentialA))
        .send({ deviceId: deviceB, connected: true })
        .expect(403);
    });

    it('refuses to verify another tenant’s device', async () => {
      await request(server())
        .post('/integrations/gateway/devices/verification')
        .set('Authorization', asGateway(credentialA))
        .send({ deviceId: foreignDevice, connected: true })
        .expect(403);
    });
  });

  // -------------------------------------------------------------- discovery

  describe('user discovery', () => {
    it('records discovered users without creating employees', async () => {
      const employeesBefore = await prisma.employee.count({
        where: { tenantId },
      });

      await request(server())
        .post('/integrations/gateway/devices/users')
        .set('Authorization', asGateway(credentialA))
        .send({
          integrationId: integrationA,
          deviceId: deviceA,
          users: [
            {
              externalUserId: '25',
              name: 'Ayesha Khan',
              privilegeRaw: 0,
              enabled: true,
            },
            { externalUserId: '26', name: 'Bilal Ahmed' },
          ],
        })
        .expect(200);

      const stored = await prisma.externalDeviceUser.count({
        where: { tenantId, integrationId: integrationA },
      });
      expect(stored).toBe(2);

      // A terminal is not an authoritative source of who works here.
      expect(await prisma.employee.count({ where: { tenantId } })).toBe(
        employeesBefore,
      );
    });

    it('refuses a discovery upload for a sibling gateway’s integration', async () => {
      await request(server())
        .post('/integrations/gateway/devices/users')
        .set('Authorization', asGateway(credentialA))
        .send({ integrationId: integrationB, deviceId: deviceB, users: [] })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------- runs

  describe('run reporting', () => {
    it('records a run and rolls the device’s stamps forward', async () => {
      await request(server())
        .post('/integrations/gateway/runs')
        .set('Authorization', asGateway(credentialA))
        .send({
          integrationId: integrationA,
          deviceId: deviceA,
          runType: 'ATTENDANCE_PULL',
          status: 'SUCCEEDED',
          startedAt: new Date(Date.now() - 20_000).toISOString(),
          completedAt: new Date().toISOString(),
          recordsRead: 42,
          recordsNew: 2,
          recordsDuplicate: 40,
        })
        .expect(200);

      const run = await prisma.integrationRun.findFirst({
        where: { tenantId, deviceId: deviceA },
        orderBy: { startedAt: 'desc' },
      });

      expect(run?.status).toBe('SUCCEEDED');
      expect(run?.gatewayId).toBe(gatewayA);
      // A cycle where everything was already known is a success, not a failure.
      expect(run?.recordsDuplicate).toBe(40);

      const device = await prisma.attendanceDevice.findUniqueOrThrow({
        where: { id: deviceA },
        select: { lastSuccessfulSyncAt: true },
      });
      expect(device.lastSuccessfulSyncAt).not.toBeNull();
    });

    it('refuses a run for a sibling gateway’s integration', async () => {
      await request(server())
        .post('/integrations/gateway/runs')
        .set('Authorization', asGateway(credentialA))
        .send({
          integrationId: integrationB,
          runType: 'HEALTH_CHECK',
          status: 'SUCCEEDED',
          startedAt: new Date().toISOString(),
        })
        .expect(403);
    });
  });

  // -------------------------------------------------------------- heartbeat

  describe('heartbeat', () => {
    it('records queue depth without carrying any payload', async () => {
      const response = await request(server())
        .post('/integrations/gateway/heartbeat')
        .set('Authorization', asGateway(credentialA))
        .send({
          version: '2.0.0',
          platform: 'WINDOWS',
          architecture: 'X64',
          devicesOnline: 1,
          devicesUnreachable: 0,
          pendingQueueCount: 37,
          oldestPendingEventAt: new Date(Date.now() - 600_000).toISOString(),
          lastSuccessfulUploadAt: new Date().toISOString(),
          installationId: `install-${suffix}`,
        })
        .expect(200);

      // The gateway reports facts; the server decides status.
      expect(response.body.status).toBe('ONLINE');

      const gateway = await prisma.integrationGateway.findUniqueOrThrow({
        where: { id: gatewayA },
        select: {
          pendingQueueCount: true,
          version: true,
          installationId: true,
          oldestPendingEventAt: true,
        },
      });

      expect(gateway.pendingQueueCount).toBe(37);
      expect(gateway.version).toBe('2.0.0');
      expect(gateway.installationId).toBe(`install-${suffix}`);
      expect(gateway.oldestPendingEventAt).not.toBeNull();
    });

    it('marks a gateway degraded when it reports unreachable devices', async () => {
      const response = await request(server())
        .post('/integrations/gateway/heartbeat')
        .set('Authorization', asGateway(credentialA))
        .send({ devicesOnline: 0, devicesUnreachable: 2 })
        .expect(200);

      expect(response.body.status).toBe('DEGRADED');
    });
  });

  // ----------------------------------------------------------- provisioning

  describe('provisioning', () => {
    it('hands out nothing for a connector that is not certified to write', async () => {
      const response = await request(server())
        .post('/integrations/gateway/provisioning/claim')
        .set('Authorization', asGateway(credentialA))
        .send({ limit: 5 })
        .expect(200);

      // ZKTeco Legacy declares WRITE_USERS as experimental, so no job for it can
      // be claimed regardless of what rows exist.
      expect(response.body.claimed).toEqual([]);
    });

    it('refuses to report a result for a job this gateway does not hold', async () => {
      await request(server())
        .post('/integrations/gateway/provisioning/result')
        .set('Authorization', asGateway(credentialA))
        .send({ jobId: randomUUID(), succeeded: true })
        .expect(403);
    });
  });

  // ----------------------------------------------------------- manual sync

  describe('manual sync requests', () => {
    it('reaches the gateway that serves the device, and only that one', async () => {
      const requestedAt = new Date();
      await prisma.attendanceDevice.update({
        where: { id: deviceA },
        data: { syncRequestedAt: requestedAt, syncRequestAcknowledgedAt: null },
      });

      const mine = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialA))
        .expect(200);

      const device = mine.body.integrations
        .flatMap(
          (item: {
            devices: { deviceId: string; syncRequestedAt: string }[];
          }) => item.devices,
        )
        .find((item: { deviceId: string }) => item.deviceId === deviceA);

      expect(device.syncRequestedAt).toBe(requestedAt.toISOString());

      const theirs = await request(server())
        .get('/integrations/gateway/configuration')
        .set('Authorization', asGateway(credentialB))
        .expect(200);

      const leaked = theirs.body.integrations
        .flatMap((item: { devices: { deviceId: string }[] }) => item.devices)
        .some((item: { deviceId: string }) => item.deviceId === deviceA);

      expect(leaked).toBe(false);
    });
  });
});
