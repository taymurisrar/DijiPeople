import { PlatformCommunicationsService } from './platform-communications.service';

describe('PlatformCommunicationsService', () => {
  const input = {
    eventCode: 'CONTRACT_SIGNATURE_REQUEST',
    recipient: 'Signer@Example.test',
    subject: 'Please sign',
    html: '<h1>Please sign</h1><script>unsafe()</script>',
    entityType: 'Contract',
    entityId: 'contract-1',
    metadata: { requestId: 'request-1', recipientId: 'recipient-1' },
  };

  it('sanitizes, sends once, and persists a stable idempotency key', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 'email-1', ...data }));
    const update = jest.fn(async ({ data }) => ({ id: 'email-1', ...data }));
    const send = jest.fn(async () => ({
      accepted: true,
      providerType: 'smtp',
    }));
    const service = new PlatformCommunicationsService(
      {
        platformOutboundEmail: {
          findUnique: jest.fn(async () => null),
          create,
          update,
        },
      } as never,
      {
        resolveProvider: jest.fn(async () => ({ provider: { send } })),
      } as never,
    );
    await service.sendEmail(input);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipient: 'signer@example.test',
          idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
          attemptCount: 1,
        }),
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(String(create.mock.calls[0][0].data.htmlBody)).not.toContain(
      '<script',
    );
  });

  it('returns an already-sent delivery without calling the provider', async () => {
    const existing = {
      id: 'email-1',
      status: 'SENT',
      lastAttemptAt: new Date(),
    };
    const send = jest.fn();
    const service = new PlatformCommunicationsService(
      {
        platformOutboundEmail: {
          findUnique: jest.fn(async () => existing),
        },
      } as never,
      {
        resolveProvider: jest.fn(async () => ({ provider: { send } })),
      } as never,
    );
    await expect(service.sendEmail(input)).resolves.toBe(existing);
    expect(send).not.toHaveBeenCalled();
  });

  it('records a retry time when provider delivery fails', async () => {
    const update = jest.fn(async ({ data }) => ({ id: 'email-1', ...data }));
    const service = new PlatformCommunicationsService(
      {
        platformOutboundEmail: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async ({ data }) => ({ id: 'email-1', ...data })),
          update,
        },
      } as never,
      { resolveProvider: jest.fn(async () => null) } as never,
    );
    await service.sendEmail(input);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          nextRetryAt: expect.any(Date),
        }),
      }),
    );
  });
});
