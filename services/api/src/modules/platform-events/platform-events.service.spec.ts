import { PlatformEventSource } from '@prisma/client';
import { PlatformEventsService } from './platform-events.service';

describe('PlatformEventsService', () => {
  it('normalizes event codes and removes sensitive metadata', async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new PlatformEventsService({
      platformEvent: { create },
    } as never);

    await service.record({
      eventCode: ' agreement signed ',
      source: PlatformEventSource.API,
      correlationId: 'request-123',
      metadata: {
        contractId: 'contract-1',
        accessToken: 'must-not-be-stored',
        nested: { password: 'must-not-be-stored', status: 'complete' },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'AGREEMENT_SIGNED',
        correlationId: 'request-123',
        metadata: {
          contractId: 'contract-1',
          nested: { status: 'complete' },
        },
      }),
    });
  });
});
