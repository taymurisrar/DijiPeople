import { DeviceProvisioningOperation } from '@prisma/client';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { AttendanceConnectorRegistry } from '../connectors/connector.registry';
import type { EmployeeWorkSiteResolver } from '../work-sites/employee-work-site-resolver.service';
import { ProvisioningPlannerService } from './provisioning-planner.service';

describe('ProvisioningPlannerService', () => {
  const TENANT = 'tenant-a';
  const EMPLOYEE = 'employee-1';

  let prisma: {
    employee: { findFirst: jest.Mock };
    attendanceDevice: { findMany: jest.Mock };
    deviceProvisioningJob: {
      findFirst: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
  };
  let workSites: { resolveAuthorizedWorkSiteIds: jest.Mock };
  let tenantSettings: { getAttendanceSettings: jest.Mock };
  let planner: ProvisioningPlannerService;

  const enabledSettings = {
    integrationEnabled: true,
    deviceProvisioningEnabled: true,
    automaticEmployeeProvisioning: true,
    provisioningMaxRetries: 3,
  };

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: EMPLOYEE,
          employeeCode: 'EMP-0001',
          firstName: 'Ayesha',
          lastName: 'Khan',
          employmentStatus: 'ACTIVE',
        }),
      },
      attendanceDevice: { findMany: jest.fn().mockResolvedValue([]) },
      deviceProvisioningJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    workSites = {
      resolveAuthorizedWorkSiteIds: jest.fn().mockResolvedValue(['location-1']),
    };

    tenantSettings = {
      getAttendanceSettings: jest.fn().mockResolvedValue(enabledSettings),
    };

    planner = new ProvisioningPlannerService(
      prisma as unknown as PrismaService,
      workSites as unknown as EmployeeWorkSiteResolver,
      new AttendanceConnectorRegistry(),
      tenantSettings as unknown as TenantSettingsResolverService,
    );
  });

  /** A connector certified for automatic writes, unlike ZKTeco Legacy today. */
  const certifiedDevice = {
    id: 'device-certified',
    integration: { connectorType: 'certified-test-connector', isActive: true },
  };

  const zktecoDevice = {
    id: 'device-zkteco',
    integration: { connectorType: 'zkteco-legacy-tcp', isActive: true },
  };

  describe('certification gating', () => {
    it('does NOT create automatic jobs for ZKTeco Legacy, whose write path is uncertified', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([zktecoDevice]);

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(prisma.deviceProvisioningJob.create).not.toHaveBeenCalled();
      expect(result.skippedUncertified).toEqual([
        expect.objectContaining({
          deviceId: 'device-zkteco',
          connectorType: 'zkteco-legacy-tcp',
        }),
      ]);
    });

    it('skips a connector that cannot write users at all', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      // The unknown connector supports nothing, so it is unsupported rather
      // than uncertified.
      expect(result.created).toBe(0);
      expect(result.skippedUnsupported).toEqual([
        expect.objectContaining({ deviceId: 'device-certified' }),
      ]);
    });

    it('ignores devices whose integration is inactive', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([
        {
          id: 'device-x',
          integration: { connectorType: 'zkteco-legacy-tcp', isActive: false },
        },
      ]);

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.skippedUncertified).toEqual([]);
      expect(result.skippedUnsupported).toEqual([]);
    });
  });

  describe('tenant switches', () => {
    it.each([
      ['integrationEnabled', 'Attendance integration is not enabled'],
      ['deviceProvisioningEnabled', 'Device provisioning is not enabled'],
      ['automaticEmployeeProvisioning', 'Automatic employee provisioning'],
    ])('stops when %s is off', async (key, expected) => {
      tenantSettings.getAttendanceSettings.mockResolvedValue({
        ...enabledSettings,
        [key]: false,
      });

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.disabledReason).toContain(expected);
      expect(prisma.attendanceDevice.findMany).not.toHaveBeenCalled();
    });

    it('force bypasses the tenant switches for an explicit manual request', async () => {
      tenantSettings.getAttendanceSettings.mockResolvedValue({
        ...enabledSettings,
        automaticEmployeeProvisioning: false,
      });
      prisma.attendanceDevice.findMany.mockResolvedValue([]);

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        force: true,
      });

      expect(result.disabledReason).toBeUndefined();
      expect(prisma.attendanceDevice.findMany).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    const state = {
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      deviceId: 'device-1',
      operation: DeviceProvisioningOperation.CREATE_USER,
      desiredState: {
        employeeCode: 'EMP-0001',
        displayName: 'Ayesha Khan',
        enabled: true,
      },
    };

    it('derives a stable key for the same desired state', () => {
      expect(ProvisioningPlannerService.desiredStateKey(state)).toBe(
        ProvisioningPlannerService.desiredStateKey({ ...state }),
      );
    });

    it('derives a different key when the desired state changes', () => {
      const original = ProvisioningPlannerService.desiredStateKey(state);

      expect(
        ProvisioningPlannerService.desiredStateKey({
          ...state,
          desiredState: { ...state.desiredState, displayName: 'Ayesha K' },
        }),
      ).not.toBe(original);

      expect(
        ProvisioningPlannerService.desiredStateKey({
          ...state,
          desiredState: { ...state.desiredState, enabled: false },
        }),
      ).not.toBe(original);
    });

    it('separates the same employee on different devices', () => {
      expect(
        ProvisioningPlannerService.desiredStateKey({
          ...state,
          deviceId: 'device-2',
        }),
      ).not.toBe(ProvisioningPlannerService.desiredStateKey(state));
    });

    it('separates identical employee ids across tenants', () => {
      expect(
        ProvisioningPlannerService.desiredStateKey({
          ...state,
          tenantId: 'tenant-b',
        }),
      ).not.toBe(ProvisioningPlannerService.desiredStateKey(state));
    });

    /**
     * The only registered connector today is ZKTeco Legacy, whose write path is
     * uncertified, so certification short-circuits before the idempotency guard
     * is reached. A registry stub that certifies WRITE_USERS lets the real
     * planner logic be exercised — otherwise these assertions would pass for the
     * wrong reason.
     */
    function plannerWithCertifiedConnector(): ProvisioningPlannerService {
      const certifiedRegistry = {
        supports: () => true,
        supportsAutomatically: () => true,
      } as unknown as AttendanceConnectorRegistry;

      return new ProvisioningPlannerService(
        prisma as unknown as PrismaService,
        workSites as unknown as EmployeeWorkSiteResolver,
        certifiedRegistry,
        tenantSettings as unknown as TenantSettingsResolverService,
      );
    }

    it('creates a job when nothing covers the desired state yet', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);

      const result = await plannerWithCertifiedConnector().planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(1);
      expect(prisma.deviceProvisioningJob.create).toHaveBeenCalledTimes(1);
    });

    it('creates nothing when an open or succeeded job already covers it', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);
      prisma.deviceProvisioningJob.findFirst.mockResolvedValue({ id: 'job-1' });

      const result = await plannerWithCertifiedConnector().planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.alreadyPending).toBe(1);
      expect(prisma.deviceProvisioningJob.create).not.toHaveBeenCalled();

      // PENDING, PROCESSING, RETRYING and SUCCEEDED all suppress; FAILED and
      // CANCELLED deliberately do not, so a retry after failure still works.
      const [call] = prisma.deviceProvisioningJob.findFirst.mock.calls;
      expect(call[0].where.status.in).toEqual(
        expect.arrayContaining([
          'PENDING',
          'PROCESSING',
          'RETRYING',
          'SUCCEEDED',
        ]),
      );
      expect(call[0].where.status.in).not.toContain('FAILED');
    });

    it('does not create duplicate jobs when activation fires twice', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);
      const certified = plannerWithCertifiedConnector();

      const first = await certified.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      // Second activation sees the job the first one created.
      prisma.deviceProvisioningJob.findFirst.mockResolvedValue({ id: 'job-1' });

      const second = await certified.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(first.created).toBe(1);
      expect(second.created).toBe(0);
      expect(second.alreadyPending).toBe(1);
      expect(prisma.deviceProvisioningJob.create).toHaveBeenCalledTimes(1);
    });

    it('queues identity only — never biometric data or credentials', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);

      await plannerWithCertifiedConnector().planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      const [call] = prisma.deviceProvisioningJob.create.mock.calls;
      expect(call[0].data.payload).toEqual({
        employeeCode: 'EMP-0001',
        displayName: 'Ayesha Khan',
        enabled: true,
      });
      const serialized = JSON.stringify(call[0].data.payload);
      expect(serialized).not.toMatch(/password|pin|template|finger|face/i);
    });

    it('survives a lost insert race without throwing', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([certifiedDevice]);
      prisma.deviceProvisioningJob.create.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      const result = await plannerWithCertifiedConnector().planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.alreadyPending).toBe(1);
    });
  });

  describe('preconditions', () => {
    it('does nothing when the employee has no authorised work site', async () => {
      workSites.resolveAuthorizedWorkSiteIds.mockResolvedValue([]);

      const result = await planner.planForEmployee({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.disabledReason).toContain('no authorised work site');
    });

    it('refuses an employee from another tenant', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await planner.planForEmployee({
        tenantId: 'tenant-b',
        employeeId: EMPLOYEE,
      });

      expect(result.created).toBe(0);
      expect(result.disabledReason).toContain('not found in this tenant');
    });

    it('scopes the employee lookup by tenant', async () => {
      await planner.planForEmployee({ tenantId: TENANT, employeeId: EMPLOYEE });

      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT }),
        }),
      );
    });
  });

  describe('staged work site transfer', () => {
    it('is not ready to disable the old site while new-site jobs are outstanding', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([]);
      prisma.deviceProvisioningJob.count.mockResolvedValue(2);

      const result = await planner.planWorkSiteTransfer({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        fromLocationId: 'location-1',
        toLocationId: 'location-2',
      });

      expect(result.readyToDisable).toBe(false);
      expect(result.pendingNewSiteJobs).toBe(2);
    });

    it('is ready to disable once new-site provisioning has settled', async () => {
      prisma.attendanceDevice.findMany.mockResolvedValue([]);
      prisma.deviceProvisioningJob.count.mockResolvedValue(0);

      const result = await planner.planWorkSiteTransfer({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        fromLocationId: 'location-1',
        toLocationId: 'location-2',
      });

      expect(result.readyToDisable).toBe(true);
    });
  });
});
