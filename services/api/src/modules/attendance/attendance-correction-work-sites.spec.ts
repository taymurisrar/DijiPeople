import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';

/**
 * BUG-2508 — the correction form's "Which work site?" selector was never
 * populated. The one pre-existing endpoint for an employee's work sites
 * (`/integrations/attendance/employees/:employeeId/work-sites`) is gated on
 * `attendanceDevices.read`, a device-management permission an ordinary
 * employee neither holds nor should be granted to fill in a dropdown.
 *
 * `listMyWorkSites` is the self-service alternative: always the caller's own
 * employee record, gated on the same permission set that already lets them
 * create a correction.
 */

const TENANT = 'tenant-1';

function buildUser(permissionKeys: string[]): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: TENANT,
    email: 'user-1@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
  };
}

function buildService(
  options: {
    sites?: Array<{ id: string; name: string }>;
  } = {},
) {
  const employeesRepository = {
    findByUserIdAndTenant: jest.fn().mockResolvedValue({ id: 'employee-1' }),
  };
  const policyResolver = {
    resolveAuthorizedWorkSiteOptions: jest
      .fn()
      .mockResolvedValue(options.sites ?? []),
  };
  const service = new AttendanceService(
    {} as never,
    employeesRepository as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    policyResolver as never,
  );

  return { service, employeesRepository, policyResolver };
}

describe('AttendanceService.listMyWorkSites (BUG-2508)', () => {
  it("returns the caller's own authorised sites", async () => {
    const sites = [
      { id: 'site-1', name: 'Head Office' },
      { id: 'site-2', name: 'Branch Office' },
    ];
    const { service, policyResolver } = buildService({ sites });

    const result = await service.listMyWorkSites(
      buildUser(['attendance.correction.create']),
    );

    expect(result).toEqual({ items: sites });
    expect(
      policyResolver.resolveAuthorizedWorkSiteOptions,
    ).toHaveBeenCalledWith(TENANT, 'employee-1');
  });

  it('resolves for the CALLER, never an id the client could supply', async () => {
    // There is no employeeId parameter at all — the only input is the
    // authenticated user, so there is no argument through which a caller
    // could ask for someone else's sites.
    expect(
      (
        AttendanceService.prototype.listMyWorkSites as (
          ...a: unknown[]
        ) => unknown
      ).length,
    ).toBe(1);
  });

  it.each([
    ['attendance.correction.create'],
    ['attendance.read'],
    ['attendance.read.own'],
    ['attendance.read.team'],
    ['attendance.read.all'],
  ])(
    'allows a caller holding %s, the same set correction creation allows',
    async (permission) => {
      const { service } = buildService({ sites: [] });

      await expect(
        service.listMyWorkSites(buildUser([permission])),
      ).resolves.toEqual({ items: [] });
    },
  );

  it('refuses a caller with none of the correction/read permissions', async () => {
    const { service, policyResolver } = buildService();

    await expect(
      service.listMyWorkSites(buildUser(['some.other.permission'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      policyResolver.resolveAuthorizedWorkSiteOptions,
    ).not.toHaveBeenCalled();
  });

  it('does NOT require attendanceDevices.read at the route', () => {
    // The bug's own acceptance criteria: do not widen a device-management
    // permission to cover this. Locks the controller decorator in place.
    const controllerSource = readFileSync(
      join(__dirname, 'attendance.controller.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');

    const routeIndex = controllerSource.indexOf('listMyCorrectionWorkSites');
    expect(routeIndex).toBeGreaterThan(-1);
    const decoratorBlock = controllerSource.slice(
      Math.max(0, controllerSource.lastIndexOf('@Get', routeIndex) - 200),
      routeIndex,
    );
    expect(decoratorBlock).not.toContain('attendanceDevices.read');
  });
});

describe('AttendanceService correction read model — requested site name (BUG-2508)', () => {
  // The manager's "What changed" diff had a name for the entry's CURRENT
  // site (already included via the entry's own relation) but only a raw
  // UUID for the site being REQUESTED, because `requestedWorkSiteId` has no
  // relation on the model. `mapCorrectionRequest` now resolves it.
  function buildCorrection(overrides: Record<string, unknown> = {}) {
    return {
      id: 'correction-1',
      tenantId: TENANT,
      status: 'PENDING_APPROVAL',
      requestedByUserId: 'employee-user-1',
      employeeId: 'employee-1',
      requestedWorkSiteId: null,
      employee: {
        id: 'employee-1',
        userId: 'employee-user-1',
        manager: null,
      },
      ...overrides,
    };
  }

  function buildReadService(correction: ReturnType<typeof buildCorrection>) {
    const locationFindFirst = jest
      .fn()
      .mockResolvedValue({ name: 'Branch Office' });
    const prisma = {
      attendanceCorrectionRequest: {
        findFirst: jest.fn().mockResolvedValue(correction),
      },
      location: { findFirst: locationFindFirst },
      approvalRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      approvalAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AttendanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, locationFindFirst };
  }

  it('resolves the requested work site name, scoped to the caller tenant', async () => {
    const correction = buildCorrection({ requestedWorkSiteId: 'site-new' });
    const { service, locationFindFirst } = buildReadService(correction);

    const result = await service.getCorrectionRequest(
      buildUser(['attendance.correction.read']),
      'correction-1',
    );

    expect(locationFindFirst).toHaveBeenCalledWith({
      where: { id: 'site-new', tenantId: TENANT },
      select: { name: true },
    });
    expect(result.item.requestedWorkSiteName).toBe('Branch Office');
  });

  it('is null when the correction did not request a site', async () => {
    const correction = buildCorrection({ requestedWorkSiteId: null });
    const { service, locationFindFirst } = buildReadService(correction);

    const result = await service.getCorrectionRequest(
      buildUser(['attendance.correction.read']),
      'correction-1',
    );

    expect(locationFindFirst).not.toHaveBeenCalled();
    expect(result.item.requestedWorkSiteName).toBeNull();
  });
});
