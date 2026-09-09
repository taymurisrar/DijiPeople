import type { AttendanceReconciliationQueueService } from '../../attendance-engine/attendance-reconciliation-queue.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { EmployeeMappingService } from './employee-mapping.service';

/**
 * Mapping a device user has to wake the punches that were waiting for it.
 *
 * Ingestion never queues an unmapped punch — there is no attendance day to
 * rebuild for an event nobody owns — and it says so in a comment that ends
 * "the mapping service requeues its events, so nothing is stranded". The queue
 * service even provides `requeueForMapping` for it. Nothing called it, so an
 * administrator could map a device user, be told how many punches had just been
 * attributed to them, and never see a minute of attendance appear.
 *
 * That failure is completely silent, which is why it is worth a test that fails
 * without the call rather than a comment saying it matters.
 */
describe('EmployeeMappingService.confirmMapping — requeueing backfilled punches', () => {
  const TENANT = 'tenant-a';
  const INTEGRATION = 'integration-1';
  const DEVICE = 'device-1';
  const EMPLOYEE = 'employee-1';
  const EXTERNAL = '1';

  let queue: {
    requeueForMapping: jest.Mock;
    enqueue: jest.Mock;
    enqueueMany: jest.Mock;
  };
  let backfilledCount: number;
  let service: EmployeeMappingService;

  beforeEach(() => {
    backfilledCount = 2;

    const tx = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE }) },
      attendanceIntegration: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: INTEGRATION, provider: 'ZKTECO' }),
      },
      attendanceDevice: {
        findFirst: jest.fn().mockResolvedValue({ id: DEVICE }),
      },
      employeeExternalIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'identity-1' }),
        update: jest.fn().mockResolvedValue({ id: 'identity-1' }),
      },
      externalDeviceUser: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rawAttendanceEvent: {
        updateMany: jest
          .fn()
          .mockImplementation(async () => ({ count: backfilledCount })),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };

    queue = {
      requeueForMapping: jest.fn().mockResolvedValue(2),
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueMany: jest.fn().mockResolvedValue(0),
    };

    service = new EmployeeMappingService(
      prisma as unknown as PrismaService,
      queue as unknown as AttendanceReconciliationQueueService,
    );
  });

  const confirm = () =>
    service.confirmMapping({
      tenantId: TENANT,
      integrationId: INTEGRATION,
      deviceId: DEVICE,
      externalUserId: EXTERNAL,
      employeeId: EMPLOYEE,
      actorUserId: 'user-1',
      mappingSource: 'MANUAL',
    });

  it('requeues the days the newly attributed punches fall on', async () => {
    // The assertion the fix exists for. Without the call the mapping still
    // succeeds and still reports its backfill count, which is exactly why the
    // absence was invisible.
    const result = await confirm();

    expect(result.backfilledEvents).toBe(2);
    expect(queue.requeueForMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        integrationId: INTEGRATION,
        externalUserId: EXTERNAL,
      }),
    );
  });

  it('does not queue anything when the mapping attributed no punches', async () => {
    // A device user mapped before they have ever punched. Queueing a day with
    // no evidence behind it would be work for nothing.
    backfilledCount = 0;

    const result = await confirm();

    expect(result.backfilledEvents).toBe(0);
    expect(queue.requeueForMapping).not.toHaveBeenCalled();
  });

  it('still returns the mapping when queueing fails', async () => {
    // The mapping is durable and is the thing the operator asked for. Failing
    // it because a queue write failed would undo real work to report something
    // recoverable — the day is still reachable through Recalculate.
    queue.requeueForMapping.mockRejectedValue(new Error('queue unavailable'));

    await expect(confirm()).resolves.toMatchObject({ backfilledEvents: 2 });
  });
});
