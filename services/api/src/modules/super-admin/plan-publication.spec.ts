import { BadRequestException } from '@nestjs/common';
import {
  planPublicationRefusal,
  PlanPublicationService,
} from './plan-publication.service';

type State = Parameters<typeof planPublicationRefusal>[1];

const plan = (overrides: Partial<State> = {}): State => ({
  name: 'Enterprise+',
  isActive: false,
  publicationStatus: 'PUBLISHED',
  salesModel: 'CUSTOM_ONLY',
  publishedPrices: 0,
  ...overrides,
});

describe('Plan publication transitions (ITEM-0022)', () => {
  it('unpublishes a published plan back to draft', () => {
    expect(planPublicationRefusal('unpublish', plan())).toBeNull();
  });

  it('archives a draft or a published plan', () => {
    expect(planPublicationRefusal('archive', plan())).toBeNull();
    expect(
      planPublicationRefusal('archive', plan({ publicationStatus: 'DRAFT' })),
    ).toBeNull();
  });

  it('refuses to republish an archived plan', () => {
    expect(
      planPublicationRefusal(
        'publish',
        plan({ publicationStatus: 'ARCHIVED' }),
      ),
    ).toMatch(/Create a new plan instead/);
  });

  it('refuses to publish an inactive plan', () => {
    expect(
      planPublicationRefusal('publish', plan({ publicationStatus: 'DRAFT' })),
    ).toMatch(/Activate the plan/);
  });

  it('refuses to publish a self-service plan with no published price', () => {
    expect(
      planPublicationRefusal(
        'publish',
        plan({
          publicationStatus: 'DRAFT',
          isActive: true,
          salesModel: 'SELF_SERVICE',
        }),
      ),
    ).toMatch(/Publish at least one price first/);
  });

  it('publishes a custom-quote plan without a price', () => {
    expect(
      planPublicationRefusal(
        'publish',
        plan({ publicationStatus: 'DRAFT', isActive: true }),
      ),
    ).toBeNull();
  });

  it('refuses a transition from the wrong state', () => {
    expect(
      planPublicationRefusal('unpublish', plan({ publicationStatus: 'DRAFT' })),
    ).toMatch(/cannot be unpublished/);
  });
});

describe('PlanPublicationService.transition', () => {
  function serviceWith(row: Record<string, unknown> | null) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      plan: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'p1', ...data }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new PlanPublicationService(
      prisma as never,
      auditService as never,
    );
    return { service, tx, auditService };
  }
  const row = {
    id: 'p1',
    key: 'enterprise-plus',
    name: 'Enterprise+',
    isActive: false,
    publicationStatus: 'PUBLISHED',
    salesModel: 'CUSTOM_ONLY',
    publishedAt: new Date('2026-08-22'),
    archivedAt: null,
    _count: { prices: 0 },
  };
  const ACTOR = { userId: 'owner-1' } as never;
  const updateData = (tx: ReturnType<typeof serviceWith>['tx']) =>
    (tx.plan.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

  it('unpublishes, keeps the first-published stamp, and audits the transition', async () => {
    const { service, tx, auditService } = serviceWith(row);
    await service.transition(ACTOR, 'p1', 'unpublish');
    const data = updateData(tx);
    expect(data.publicationStatus).toBe('DRAFT');
    expect(data).not.toHaveProperty('publishedAt');
    const [entry, client] = auditService.log.mock.calls[0] as [
      {
        action: string;
        beforeSnapshot: { publicationStatus: string };
        afterSnapshot: unknown;
      },
      unknown,
    ];
    expect(entry.action).toBe('PLAN_UNPUBLISHED');
    expect(entry.beforeSnapshot.publicationStatus).toBe('PUBLISHED');
    expect(entry.afterSnapshot).toEqual({ publicationStatus: 'DRAFT' });
    expect(client).toBe(tx);
  });

  it('refuses with a named reason and writes nothing', async () => {
    const { service, tx, auditService } = serviceWith({
      ...row,
      publicationStatus: 'ARCHIVED',
    });
    await expect(service.transition(ACTOR, 'p1', 'publish')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.plan.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('stamps archivedAt when archiving', async () => {
    const { service, tx } = serviceWith(row);
    await service.transition(ACTOR, 'p1', 'archive');
    const data = updateData(tx);
    expect(data.publicationStatus).toBe('ARCHIVED');
    expect(data.archivedAt).toBeInstanceOf(Date);
  });
});
