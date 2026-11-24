import { RecruitmentService } from './recruitment.service';

/*
 * DP-MASTER/WP-04.S1 (A01, A02). Moving an application announces
 * recruitment.application.stage.changed after the move commits, and a delivery
 * failure never undoes or blocks the move.
 */

function harness(emit: jest.Mock) {
  const repository = {
    findApplicationById: jest.fn().mockResolvedValue({
      id: 'app-1',
      candidateId: 'cand-1',
      jobOpeningId: 'job-1',
      stage: 'APPLIED',
      notes: null,
    }),
    findJobOpeningById: jest.fn().mockResolvedValue({
      pipeline: null,
      pipelineId: null,
    }),
    updateApplication: jest.fn(),
    createApplicationStageHistory: jest.fn(),
    updateCandidate: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
  };
  const service = Object.assign(Object.create(RecruitmentService.prototype), {
    recruitmentRepository: repository,
    prisma,
    notificationsService: { emit },
    logger: { warn: jest.fn() },
    resolvePipelineForJobOpening: jest.fn().mockResolvedValue(null),
    validateApplicationStageMove: jest.fn(),
    createApplicationHistorySnapshot: jest.fn(),
    findApplicationById: jest.fn().mockResolvedValue({ id: 'app-1' }),
  }) as RecruitmentService;
  return { service, repository, prisma };
}

const USER = { tenantId: 'tenant-1', userId: 'user-1' } as never;

describe('RecruitmentService.moveApplicationStage event', () => {
  it('emits the stage change after the transaction, without candidate contact data', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = harness(emit);
    await service.moveApplicationStage(USER, 'app-1', {
      stage: 'SCREENING',
    } as never);

    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: 'tenant-1',
      eventKey: 'recruitment.application.stage.changed',
      moduleKey: 'recruitment',
      relatedEntityType: 'application',
      relatedEntityId: 'app-1',
    });
    expect(call.metadata).toMatchObject({
      fromStage: 'APPLIED',
      toStage: 'SCREENING',
    });
    expect(JSON.stringify(call.metadata)).not.toMatch(/@/);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    );
  });

  it('still completes the move when the announcement fails', async () => {
    const emit = jest.fn().mockRejectedValue(new Error('queue down'));
    const { service, repository } = harness(emit);
    await expect(
      service.moveApplicationStage(USER, 'app-1', {
        stage: 'SCREENING',
      } as never),
    ).resolves.toEqual({ id: 'app-1' });
    expect(repository.updateApplication).toHaveBeenCalled();
  });
});
