import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';

/**
 * BUG-2504 — approving a correction wrote only `checkIn`/`checkOut` onto the
 * attendance entry. `requestedWorkMode` and `requestedWorkSiteId` were
 * persisted on the request at creation and never read back at approval, and
 * `deriveManualStatus` was called with `existing.attendanceMode` — the mode
 * the request asked to REPLACE — so the status re-derivation re-asked the
 * question the approval was supposed to answer.
 *
 * `applyApprovedCorrection` is private. It is reached directly here, the same
 * way `attendance.correction-authorization.spec.ts` reaches
 * `canCurrentUserActionCorrection`: the full `approveCorrectionRequest` path
 * also drives the generic approval sync (`ApprovalRequest`/`ApprovalStep`/
 * `ApprovalAssignment`/`SlaTracking` upserts), which is authorization and
 * approval-routing plumbing this bug has nothing to do with.
 */

const TENANT = 'tenant-1';

function buildUser(): AuthenticatedUser {
  return {
    userId: 'manager-1',
    tenantId: TENANT,
    email: 'manager-1@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
  };
}

function callApply(
  service: AttendanceService,
  request: Record<string, unknown>,
  tx: unknown,
) {
  return (
    service as unknown as {
      applyApprovedCorrection: (
        request: unknown,
        user: AuthenticatedUser,
        tx: unknown,
      ) => Promise<void>;
    }
  ).applyApprovedCorrection(request, buildUser(), tx);
}

function buildService() {
  return new AttendanceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'correction-1',
    requestNumber: 'ACR-000001',
    reason: 'Worked from the branch office today.',
    employeeId: 'employee-1',
    attendanceEntryId: 'entry-1',
    requestedCheckInAtUtc: null,
    originalCheckInAtUtc: new Date('2026-09-01T05:00:00.000Z'),
    requestedCheckOutAtUtc: null,
    originalCheckOutAtUtc: new Date('2026-09-01T13:00:00.000Z'),
    requestedWorkMode: null,
    requestedWorkSiteId: null,
    ...overrides,
  };
}

function buildExistingEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    tenantId: TENANT,
    isLateCheckIn: false,
    attendanceMode: AttendanceMode.OFFICE,
    officeLocationId: 'site-old',
    notes: null,
    ...overrides,
  };
}

describe('applyApprovedCorrection — work site (BUG-2504)', () => {
  it('sets officeLocationId from the approved requestedWorkSiteId', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest.fn().mockResolvedValue(buildExistingEntry()),
        update,
      },
    };
    const service = buildService();

    await callApply(
      service,
      baseRequest({ requestedWorkSiteId: 'site-new' }),
      tx,
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.officeLocationId).toBe('site-new');
  });

  it('keeps the existing site when the correction did not request one', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest.fn().mockResolvedValue(buildExistingEntry()),
        update,
      },
    };
    const service = buildService();

    await callApply(service, baseRequest(), tx);

    expect(update.mock.calls[0][0].data.officeLocationId).toBe('site-old');
  });
});

describe('applyApprovedCorrection — work mode (BUG-2504)', () => {
  it('maps an approved REMOTE request onto the entry AttendanceMode', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            buildExistingEntry({ attendanceMode: AttendanceMode.OFFICE }),
          ),
        update,
      },
    };
    const service = buildService();

    await callApply(service, baseRequest({ requestedWorkMode: 'REMOTE' }), tx);

    expect(update.mock.calls[0][0].data.attendanceMode).toBe(
      AttendanceMode.REMOTE,
    );
  });

  it('re-derives status from the APPROVED mode, not the mode as it was', async () => {
    // The exact defect: deriveManualStatus used to be called with
    // `existing.attendanceMode`, which for an office->remote approval meant
    // the new REMOTE mode's LATE-on-remote rule never fired.
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest.fn().mockResolvedValue(
          buildExistingEntry({
            attendanceMode: AttendanceMode.OFFICE,
            isLateCheckIn: false,
          }),
        ),
        update,
      },
    };
    const service = buildService();

    await callApply(
      service,
      baseRequest({
        requestedWorkMode: 'REMOTE',
        originalCheckInAtUtc: new Date('2026-09-01T05:00:00.000Z'),
        originalCheckOutAtUtc: new Date('2026-09-01T13:00:00.000Z'),
      }),
      tx,
    );

    expect(update.mock.calls[0][0].data.status).toBe('LATE');
  });

  it('leaves the mode untouched when the correction did not request one', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            buildExistingEntry({ attendanceMode: AttendanceMode.OFFICE }),
          ),
        update,
      },
    };
    const service = buildService();

    await callApply(service, baseRequest(), tx);

    expect(update.mock.calls[0][0].data.attendanceMode).toBe(
      AttendanceMode.OFFICE,
    );
  });

  it('refuses a FIELD-mode approval rather than silently doing nothing', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest.fn().mockResolvedValue(buildExistingEntry()),
        update,
      },
    };
    const service = buildService();

    await expect(
      callApply(service, baseRequest({ requestedWorkMode: 'FIELD' }), tx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // The refusal happens before any write — approving must not leave the
    // entry half-changed.
    expect(update).not.toHaveBeenCalled();
  });
});

describe('applyApprovedCorrection — the no-linked-entry path', () => {
  it('applies mode and site when creating the entry for a wholly missing day', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = {
      attendanceEntry: {
        findFirst: jest.fn().mockResolvedValue(null), // no duplicate
        create,
      },
    };
    const service = buildService();

    await callApply(
      service,
      baseRequest({
        attendanceEntryId: null,
        requestedWorkMode: 'REMOTE',
        requestedWorkSiteId: 'site-new',
        requestedCheckInAtUtc: new Date('2026-09-01T05:00:00.000Z'),
        requestedCheckOutAtUtc: new Date('2026-09-01T13:00:00.000Z'),
      }),
      tx,
    );

    expect(create.mock.calls[0][0].data.attendanceMode).toBe(
      AttendanceMode.REMOTE,
    );
    expect(create.mock.calls[0][0].data.officeLocationId).toBe('site-new');
  });
});
