import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import { AuditRepository } from '../src/modules/audit/audit.repository';
import { AuditService } from '../src/modules/audit/audit.service';
import { AttendanceConnectorRegistry } from '../src/modules/attendance-integrations/connectors/connector.registry';
import { ConnectorConfigurationValidator } from '../src/modules/attendance-integrations/connectors/connector-configuration.validator';
import { EmployeeWorkSiteResolver } from '../src/modules/attendance-integrations/work-sites/employee-work-site-resolver.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { AttendanceDeviceService } from '../src/modules/attendance-integrations/devices/attendance-device.service';
import { GatewayCredentialService } from '../src/modules/attendance-integrations/gateways/gateway-credential.service';
import { AttendanceIntegrationService } from '../src/modules/attendance-integrations/integrations/attendance-integration.service';
import { AttendanceOperationsService } from '../src/modules/attendance-integrations/operations/attendance-operations.service';
import { RawAttendanceIngestionService } from '../src/modules/attendance-integrations/ingestion/raw-attendance-ingestion.service';
import { AttendanceReconciliationQueueService } from '../src/modules/attendance-engine/attendance-reconciliation-queue.service';
import { EmployeeMappingService } from '../src/modules/attendance-integrations/mapping/employee-mapping.service';

/**
 * DB-backed tenant isolation.
 *
 * These run against the real database through the real services, because the
 * property under test is that the *queries* are tenant-scoped. A mocked Prisma
 * would happily return whatever the stub was told to return and prove nothing.
 *
 * The central case is ID GUESSING: tenant A holds a genuine, currently-valid id
 * belonging to tenant B and calls each service with it. Every one must behave as
 * though the record does not exist.
 *
 * Fixtures are created under both tenants and removed afterwards; no seeded data
 * is modified.
 */
describe('Attendance integration tenant isolation (e2e, DB-backed)', () => {
  jest.setTimeout(120_000);

  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let integrations: AttendanceIntegrationService;
  let devices: AttendanceDeviceService;
  let operations: AttendanceOperationsService;
  let gateways: GatewayCredentialService;
  let ingestion: RawAttendanceIngestionService;
  let mapping: EmployeeMappingService;

  const suffix = `iso-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  interface TenantFixture {
    tenantId: string;
    user: AuthenticatedUser;
    integrationId: string;
    deviceId: string;
    gatewayId: string;
    syncPolicyId: string;
    locationId: string;
    employeeId: string;
    externalUserRecordId: string;
    provisioningJobId: string;
    runId: string;
    rawEventId: string;
  }

  let alpha: TenantFixture;
  let beta: TenantFixture;

  function actingUser(tenantId: string): AuthenticatedUser {
    return {
      userId: `${tenantId}-actor`,
      tenantId,
      email: 'isolation@example.test',
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
    };
  }

  async function buildFixture(
    tenantId: string,
    label: string,
  ): Promise<TenantFixture> {
    const gateway = await prisma.integrationGateway.create({
      data: { tenantId, name: `GW ${label} ${suffix}`, status: 'PENDING' },
    });

    const syncPolicy = await prisma.attendanceSyncPolicy.create({
      data: {
        tenantId,
        name: `Policy ${label} ${suffix}`,
        mode: 'POLL',
        intervalValue: 30,
      },
    });

    const integration = await prisma.attendanceIntegration.create({
      data: {
        tenantId,
        name: `Integration ${label} ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
        gatewayId: gateway.id,
        syncPolicyId: syncPolicy.id,
        configuration: { host: '10.0.0.1', port: 4370, machineNumber: 1 },
      },
    });

    // Reuse an existing work site and employee from this tenant where possible;
    // the isolation property does not depend on them being newly created.
    const location = await prisma.location.findFirst({ where: { tenantId } });
    const employee = await prisma.employee.findFirst({ where: { tenantId } });

    const device = await prisma.attendanceDevice.create({
      data: {
        tenantId,
        integrationId: integration.id,
        name: `Device ${label} ${suffix}`,
        provider: 'ZKTECO',
        serialNumber: `SER-${label}-${suffix}`,
        locationId: location?.id ?? null,
        gatewayId: gateway.id,
        status: 'ACTIVE',
        isEnabled: true,
      },
    });

    const externalUser = await prisma.externalDeviceUser.create({
      data: {
        tenantId,
        integrationId: integration.id,
        deviceId: device.id,
        provider: 'ZKTECO',
        externalUserId: `EU-${label}`,
        externalName: `External ${label}`,
        mappingStatus: 'UNMATCHED',
      },
    });

    const provisioningJob = await prisma.deviceProvisioningJob.create({
      data: {
        tenantId,
        employeeId: employee!.id,
        deviceId: device.id,
        operation: 'CREATE_USER',
        status: 'FAILED',
        errorCode: 'TEST',
      },
    });

    const run = await prisma.integrationRun.create({
      data: {
        tenantId,
        integrationId: integration.id,
        deviceId: device.id,
        gatewayId: gateway.id,
        runType: 'ATTENDANCE_PULL',
        status: 'SUCCEEDED',
      },
    });

    const rawEvent = await prisma.rawAttendanceEvent.create({
      data: {
        tenantId,
        integrationId: integration.id,
        deviceId: device.id,
        provider: 'ZKTECO',
        externalUserId: `EU-${label}`,
        occurredAtLocal: '2026-08-13T09:00:00',
        captureSource: 'DEVICE',
        workMode: 'OFFICE',
        eventFingerprint: `fp-${label}-${suffix}`,
        dedupeScopeKey: `device:${device.id}`,
      },
    });

    return {
      tenantId,
      user: actingUser(tenantId),
      integrationId: integration.id,
      deviceId: device.id,
      gatewayId: gateway.id,
      syncPolicyId: syncPolicy.id,
      locationId: location!.id,
      employeeId: employee!.id,
      externalUserRecordId: externalUser.id,
      provisioningJobId: provisioningJob.id,
      runId: run.id,
      rawEventId: rawEvent.id,
    };
  }

  beforeAll(async () => {
    // Only the module under test, not the whole AppModule. These are still
    // real services against the real database — the point is tenant-scoped SQL —
    // but booting every unrelated module would make the run slow and fragile.
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        // Global in the real app; imported explicitly because AppModule is not booted.
        RequestContextModule,
        PrismaModule,
      ],
      // Services are provided directly rather than importing the feature module,
      // because that module declares controllers whose JwtAuthGuard drags in the
      // whole auth stack. The services under test are the real ones, wired to the
      // real PrismaService against the real database.
      providers: [
        AuditRepository,
        AuditService,
        SecretEncryptionService,
        AttendanceConnectorRegistry,
        ConnectorConfigurationValidator,
        EmployeeWorkSiteResolver,
        RawAttendanceIngestionService,
        // Ingestion now enqueues reconciliation instead of calculating inline.
        // Provided as a stub: this suite is about tenant isolation in the
        // queries, and a real queue would drag the whole engine in with it.
        {
          provide: AttendanceReconciliationQueueService,
          useValue: {
            enqueue: async () => undefined,
            enqueueMany: async () => 0,
          },
        },
        EmployeeMappingService,
        AttendanceIntegrationService,
        AttendanceDeviceService,
        AttendanceOperationsService,
        GatewayCredentialService,
      ],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    integrations = moduleRef.get(AttendanceIntegrationService);
    devices = moduleRef.get(AttendanceDeviceService);
    operations = moduleRef.get(AttendanceOperationsService);
    gateways = moduleRef.get(GatewayCredentialService);
    ingestion = moduleRef.get(RawAttendanceIngestionService);
    mapping = moduleRef.get(EmployeeMappingService);

    const tenants = await prisma.tenant.findMany({
      where: { employees: { some: {} }, locations: { some: {} } },
      take: 2,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (tenants.length < 2) {
      throw new Error(
        'Isolation tests need two tenants that each have at least one employee and one work site.',
      );
    }

    alpha = await buildFixture(tenants[0].id, 'A');
    beta = await buildFixture(tenants[1].id, 'B');
  });

  afterAll(async () => {
    for (const fixture of [alpha, beta]) {
      if (!fixture) continue;
      // Order matters: children before parents.
      await prisma.rawAttendanceEvent.deleteMany({
        where: { integrationId: fixture.integrationId },
      });
      await prisma.integrationRun.deleteMany({
        where: { integrationId: fixture.integrationId },
      });
      await prisma.deviceProvisioningJob.deleteMany({
        where: { deviceId: fixture.deviceId },
      });
      await prisma.employeeExternalIdentity.deleteMany({
        where: { integrationId: fixture.integrationId },
      });
      await prisma.externalDeviceUser.deleteMany({
        where: { integrationId: fixture.integrationId },
      });
      await prisma.attendanceDeviceScope.deleteMany({
        where: { deviceId: fixture.deviceId },
      });
      await prisma.attendanceDevice.deleteMany({
        where: { integrationId: fixture.integrationId },
      });
      await prisma.attendanceIntegration.deleteMany({
        where: { id: fixture.integrationId },
      });
      await prisma.attendanceSyncPolicy.deleteMany({
        where: { id: fixture.syncPolicyId },
      });
      await prisma.integrationGatewayCredential.deleteMany({
        where: { gatewayId: fixture.gatewayId },
      });
      await prisma.integrationGatewayPairingCode.deleteMany({
        where: { gatewayId: fixture.gatewayId },
      });
      await prisma.integrationGateway.deleteMany({
        where: { id: fixture.gatewayId },
      });
    }
    await moduleRef.close();
  });

  it('creates fixtures in two distinct tenants', () => {
    expect(alpha.tenantId).not.toBe(beta.tenantId);
  });

  // -------------------------------------------------------- list isolation

  describe('list/query isolation', () => {
    it('integration lists exclude the other tenant', async () => {
      const list = await integrations.list(alpha.tenantId, { pageSize: 200 });
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.integrationId);
      expect(ids).not.toContain(beta.integrationId);
    });

    it('device lists exclude the other tenant', async () => {
      const list = await devices.listDevices(alpha.tenantId, { pageSize: 200 });
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.deviceId);
      expect(ids).not.toContain(beta.deviceId);
    });

    it('sync policy lists exclude the other tenant', async () => {
      const list = await devices.listSyncPolicies(alpha.tenantId);
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.syncPolicyId);
      expect(ids).not.toContain(beta.syncPolicyId);
    });

    it('external user lists exclude the other tenant', async () => {
      const list = await operations.listExternalUsers(alpha.tenantId, {
        pageSize: 200,
      });
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.externalUserRecordId);
      expect(ids).not.toContain(beta.externalUserRecordId);
    });

    it('integration run lists exclude the other tenant', async () => {
      const list = await operations.listRuns(alpha.tenantId, { pageSize: 200 });
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.runId);
      expect(ids).not.toContain(beta.runId);
    });

    it('provisioning job lists exclude the other tenant', async () => {
      const list = await operations.listProvisioningJobs(alpha.tenantId, {
        pageSize: 200,
      });
      const ids = list.items.map((item) => item.id);
      expect(ids).toContain(alpha.provisioningJobId);
      expect(ids).not.toContain(beta.provisioningJobId);
    });
  });

  // ------------------------------------------------------- ID guessing

  describe('ID guessing with genuine foreign IDs', () => {
    it('rejects reading another tenant’s integration', async () => {
      await expect(
        integrations.findOne(alpha.tenantId, beta.integrationId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects activating another tenant’s integration', async () => {
      await expect(
        integrations.activate(alpha.user, beta.integrationId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects updating another tenant’s integration', async () => {
      await expect(
        integrations.update(alpha.user, beta.integrationId, { name: 'hijack' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const untouched = await prisma.attendanceIntegration.findUnique({
        where: { id: beta.integrationId },
        select: { name: true },
      });
      expect(untouched?.name).not.toBe('hijack');
    });

    it('rejects reading another tenant’s device', async () => {
      await expect(
        devices.findDevice(alpha.tenantId, beta.deviceId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects disabling another tenant’s device', async () => {
      await expect(
        devices.setDeviceEnabled(alpha.user, beta.deviceId, false),
      ).rejects.toBeInstanceOf(NotFoundException);

      const untouched = await prisma.attendanceDevice.findUnique({
        where: { id: beta.deviceId },
        select: { isEnabled: true },
      });
      expect(untouched?.isEnabled).toBe(true);
    });

    it('rejects attaching a device to another tenant’s integration', async () => {
      await expect(
        devices.createDevice(alpha.user, {
          integrationId: beta.integrationId,
          name: `Hijack ${suffix}`,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects attaching a device to another tenant’s work site', async () => {
      await expect(
        devices.createDevice(alpha.user, {
          integrationId: alpha.integrationId,
          name: `Hijack site ${suffix}`,
          locationId: beta.locationId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects attaching a device to another tenant’s gateway', async () => {
      await expect(
        devices.createDevice(alpha.user, {
          integrationId: alpha.integrationId,
          name: `Hijack gw ${suffix}`,
          gatewayId: beta.gatewayId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reading another tenant’s sync policy', async () => {
      await expect(
        devices.findSyncPolicy(alpha.tenantId, beta.syncPolicyId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects scoping another tenant’s device', async () => {
      await expect(
        devices.listDeviceScopes(alpha.tenantId, beta.deviceId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a scope target from another tenant', async () => {
      await expect(
        devices.addDeviceScope(alpha.user, alpha.deviceId, {
          scopeType: 'EMPLOYEE',
          employeeId: beta.employeeId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reading another tenant’s employee work sites', async () => {
      await expect(
        operations.listEmployeeWorkSites(alpha.tenantId, beta.employeeId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects assigning another tenant’s work site to an employee', async () => {
      await expect(
        operations.assignWorkSite(alpha.user, alpha.employeeId, {
          locationId: beta.locationId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reading another tenant’s external device user', async () => {
      await expect(
        operations.findExternalUser(alpha.tenantId, beta.externalUserRecordId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects mapping another tenant’s external user', async () => {
      await expect(
        operations.confirmMapping(
          alpha.user,
          beta.externalUserRecordId,
          alpha.employeeId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects mapping to an employee from another tenant', async () => {
      await expect(
        operations.confirmMapping(
          alpha.user,
          alpha.externalUserRecordId,
          beta.employeeId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a cross-tenant mapping at the service layer too', async () => {
      await expect(
        mapping.confirmMapping({
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
          externalUserId: 'EU-A',
          employeeId: beta.employeeId,
          mappingSource: 'MANUAL',
        }),
      ).rejects.toThrow(/EMPLOYEE_NOT_IN_TENANT/);
    });

    it('rejects reading another tenant’s integration run', async () => {
      await expect(
        operations.findRun(alpha.tenantId, beta.runId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reading another tenant’s provisioning job', async () => {
      await expect(
        operations.findProvisioningJob(alpha.tenantId, beta.provisioningJobId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects retrying another tenant’s provisioning job', async () => {
      await expect(
        operations.retryProvisioningJob(alpha.user, beta.provisioningJobId),
      ).rejects.toBeInstanceOf(NotFoundException);

      const untouched = await prisma.deviceProvisioningJob.findUnique({
        where: { id: beta.provisioningJobId },
        select: { status: true },
      });
      expect(untouched?.status).toBe('FAILED');
    });

    it('rejects cancelling another tenant’s provisioning job', async () => {
      await expect(
        operations.cancelProvisioningJob(alpha.user, beta.provisioningJobId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects issuing a pairing code for another tenant’s gateway', async () => {
      await expect(
        gateways.issuePairingCode({
          tenantId: alpha.tenantId,
          gatewayId: beta.gatewayId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects revoking another tenant’s gateway', async () => {
      await expect(
        gateways.revokeGateway({
          tenantId: alpha.tenantId,
          gatewayId: beta.gatewayId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const untouched = await prisma.integrationGateway.findUnique({
        where: { id: beta.gatewayId },
        select: { revokedAt: true },
      });
      expect(untouched?.revokedAt).toBeNull();
    });

    it('rejects rotating a credential on another tenant’s gateway', async () => {
      await expect(
        gateways.rotateCredential({
          tenantId: alpha.tenantId,
          gatewayId: beta.gatewayId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects ingesting into another tenant’s integration', async () => {
      await expect(
        ingestion.ingestBatch(
          { tenantId: alpha.tenantId, integrationId: beta.integrationId },
          [{ externalUserId: '1', occurredAtLocal: '2026-08-13T10:00:00' }],
        ),
      ).rejects.toThrow(/Unknown attendance integration/);
    });

    it('rejects spoofing a device from another integration', async () => {
      await expect(
        ingestion.ingestBatch(
          {
            tenantId: alpha.tenantId,
            integrationId: alpha.integrationId,
            deviceId: beta.deviceId,
          },
          [{ externalUserId: '1', occurredAtLocal: '2026-08-13T10:00:00' }],
        ),
      ).rejects.toThrow(/Unknown attendance device/);
    });
  });

  // ------------------------------------------------------ raw event storage

  describe('raw attendance storage invariants (DB-backed)', () => {
    let secondDeviceId: string;

    beforeAll(async () => {
      const second = await prisma.attendanceDevice.create({
        data: {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          name: `Device A2 ${suffix}`,
          provider: 'ZKTECO',
          serialNumber: `SER-A2-${suffix}`,
          status: 'ACTIVE',
          isEnabled: true,
        },
      });
      secondDeviceId = second.id;
    });

    it('persists the same fingerprint for two different devices', async () => {
      const fingerprint = `shared-fp-${suffix}`;

      const first = await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
        },
        [
          {
            externalUserId: '77',
            occurredAtLocal: '2026-08-13T11:00:00',
            eventFingerprint: fingerprint,
          },
        ],
      );

      const second = await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: secondDeviceId,
        },
        [
          {
            externalUserId: '77',
            occurredAtLocal: '2026-08-13T11:00:00',
            eventFingerprint: fingerprint,
          },
        ],
      );

      // This is the Slice 2 regression: under the old constraint the second
      // device's punch would have been silently discarded as a duplicate.
      expect(first.inserted).toBe(1);
      expect(second.inserted).toBe(1);

      const stored = await prisma.rawAttendanceEvent.count({
        where: { tenantId: alpha.tenantId, eventFingerprint: fingerprint },
      });
      expect(stored).toBe(2);
    });

    it('deduplicates the same fingerprint within one device scope', async () => {
      const fingerprint = `dup-fp-${suffix}`;
      const payload = {
        externalUserId: '78',
        occurredAtLocal: '2026-08-13T12:00:00',
        eventFingerprint: fingerprint,
      };

      const first = await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
        },
        [payload],
      );
      const second = await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
        },
        [payload],
      );

      expect(first.inserted).toBe(1);
      expect(second.inserted).toBe(0);
      expect(second.duplicates).toBe(1);
    });

    it('stores an event for an unmapped user and enforces DEVICE to OFFICE', async () => {
      const fingerprint = `unmapped-fp-${suffix}`;

      await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
        },
        [
          {
            externalUserId: 'NOBODY-999',
            occurredAtLocal: '2026-08-13T13:00:00',
            eventFingerprint: fingerprint,
          },
        ],
      );

      const stored = await prisma.rawAttendanceEvent.findFirst({
        where: { tenantId: alpha.tenantId, eventFingerprint: fingerprint },
      });

      expect(stored).not.toBeNull();
      expect(stored?.employeeId).toBeNull();
      expect(stored?.mappingStatus).toBe('UNMAPPED');
      expect(stored?.captureSource).toBe('DEVICE');
      expect(stored?.workMode).toBe('OFFICE');
    });

    it('attributes historical unmapped events once a mapping is confirmed', async () => {
      const externalUserId = `LATE-${suffix}`;
      const fingerprint = `late-fp-${suffix}`;

      await ingestion.ingestBatch(
        {
          tenantId: alpha.tenantId,
          integrationId: alpha.integrationId,
          deviceId: alpha.deviceId,
        },
        [
          {
            externalUserId,
            occurredAtLocal: '2026-08-13T14:00:00',
            eventFingerprint: fingerprint,
          },
        ],
      );

      const before = await prisma.rawAttendanceEvent.findFirst({
        where: { tenantId: alpha.tenantId, eventFingerprint: fingerprint },
        select: { employeeId: true },
      });
      expect(before?.employeeId).toBeNull();

      const result = await mapping.confirmMapping({
        tenantId: alpha.tenantId,
        integrationId: alpha.integrationId,
        deviceId: alpha.deviceId,
        externalUserId,
        employeeId: alpha.employeeId,
        mappingSource: 'MANUAL',
      });

      expect(result.backfilledEvents).toBeGreaterThanOrEqual(1);

      const after = await prisma.rawAttendanceEvent.findFirst({
        where: { tenantId: alpha.tenantId, eventFingerprint: fingerprint },
        select: { employeeId: true, mappingStatus: true },
      });
      expect(after?.employeeId).toBe(alpha.employeeId);
      expect(after?.mappingStatus).toBe('MAPPED');
    });

    afterAll(async () => {
      await prisma.rawAttendanceEvent.deleteMany({
        where: { deviceId: secondDeviceId },
      });
      await prisma.attendanceDevice.deleteMany({
        where: { id: secondDeviceId },
      });
    });
  });

  // ----------------------------------------------- credential rotation (DB)

  describe('gateway credential rotation and retirement (DB-backed)', () => {
    it('keeps the old credential working during overlap, then rejects it after retirement', async () => {
      const gateway = await prisma.integrationGateway.create({
        data: {
          tenantId: alpha.tenantId,
          name: `GW rotate ${suffix}`,
          status: 'ONLINE',
          registeredAt: new Date(),
        },
      });

      try {
        const first = await gateways.rotateCredential({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
          label: 'original',
        });

        // Original works.
        expect(await gateways.resolveCredential(first.plaintext)).toMatchObject(
          { gatewayId: gateway.id, tenantId: alpha.tenantId },
        );

        const second = await gateways.rotateCredential({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
          label: 'replacement',
        });

        // Controlled overlap: both are valid.
        expect(
          await gateways.resolveCredential(first.plaintext),
        ).not.toBeNull();
        expect(
          await gateways.resolveCredential(second.plaintext),
        ).not.toBeNull();

        await gateways.retireCredential({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
          credentialId: first.credentialId,
        });

        // Old is dead, new still works — and the gateway was never revoked.
        expect(await gateways.resolveCredential(first.plaintext)).toBeNull();
        expect(
          await gateways.resolveCredential(second.plaintext),
        ).not.toBeNull();

        const stillLive = await prisma.integrationGateway.findUnique({
          where: { id: gateway.id },
          select: { revokedAt: true },
        });
        expect(stillLive?.revokedAt).toBeNull();
      } finally {
        await prisma.integrationGatewayCredential.deleteMany({
          where: { gatewayId: gateway.id },
        });
        await prisma.integrationGateway.deleteMany({
          where: { id: gateway.id },
        });
      }
    });

    it('refuses to retire the only usable credential', async () => {
      const gateway = await prisma.integrationGateway.create({
        data: {
          tenantId: alpha.tenantId,
          name: `GW single ${suffix}`,
          status: 'ONLINE',
          registeredAt: new Date(),
        },
      });

      try {
        const only = await gateways.rotateCredential({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
        });

        await expect(
          gateways.retireCredential({
            tenantId: alpha.tenantId,
            gatewayId: gateway.id,
            credentialId: only.credentialId,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(await gateways.resolveCredential(only.plaintext)).not.toBeNull();
      } finally {
        await prisma.integrationGatewayCredential.deleteMany({
          where: { gatewayId: gateway.id },
        });
        await prisma.integrationGateway.deleteMany({
          where: { id: gateway.id },
        });
      }
    });

    it('rejects retiring a credential belonging to another tenant’s gateway', async () => {
      const credential = await gateways.rotateCredential({
        tenantId: beta.tenantId,
        gatewayId: beta.gatewayId,
      });

      await expect(
        gateways.retireCredential({
          tenantId: alpha.tenantId,
          gatewayId: beta.gatewayId,
          credentialId: credential.credentialId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Still usable — the cross-tenant call changed nothing.
      expect(
        await gateways.resolveCredential(credential.plaintext),
      ).not.toBeNull();
    });

    it('rejects every credential once the gateway is revoked', async () => {
      const gateway = await prisma.integrationGateway.create({
        data: {
          tenantId: alpha.tenantId,
          name: `GW revoke ${suffix}`,
          status: 'ONLINE',
          registeredAt: new Date(),
        },
      });

      try {
        const credential = await gateways.rotateCredential({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
        });
        expect(
          await gateways.resolveCredential(credential.plaintext),
        ).not.toBeNull();

        await gateways.revokeGateway({
          tenantId: alpha.tenantId,
          gatewayId: gateway.id,
          reason: 'test',
        });

        expect(
          await gateways.resolveCredential(credential.plaintext),
        ).toBeNull();
      } finally {
        await prisma.integrationGatewayCredential.deleteMany({
          where: { gatewayId: gateway.id },
        });
        await prisma.integrationGateway.deleteMany({
          where: { id: gateway.id },
        });
      }
    });

    it('does not accept an employee JWT shape as a gateway credential', async () => {
      expect(
        await gateways.resolveCredential(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y',
        ),
      ).toBeNull();
    });
  });
});
