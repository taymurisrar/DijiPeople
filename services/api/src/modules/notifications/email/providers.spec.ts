import { ConsoleEmailProvider } from './providers';

describe('ConsoleEmailProvider', () => {
  it('logs rendered activation and reset links clearly', async () => {
    const provider = new ConsoleEmailProvider();
    const log = jest.fn();
    (
      provider as unknown as { logger: { log: (message: string) => void } }
    ).logger = { log };

    await provider.send({
      tenantId: 'tenant-1',
      eventCode: 'AUTH_ACCOUNT_ACTIVATION',
      recipient: 'ada@example.com',
      subject: 'Activate account',
      html: '<a href="https://app.example.com/activate-account?token=abc">Activate</a>',
      text: 'Activate: https://app.example.com/activate-account?token=abc',
      fromEmail: 'no-reply@example.com',
      fromName: 'DijiPeople',
      metadata: {
        activationUrl: 'https://app.example.com/activate-account?token=abc',
        resetUrl: 'https://app.example.com/reset-password?token=xyz',
      },
    });

    const output = JSON.parse(log.mock.calls[0][0] as string) as {
      bootstrapArtifacts: {
        activationUrl: string;
        resetUrl: string;
      };
    };
    expect(output.bootstrapArtifacts.activationUrl).toBe(
      'https://app.example.com/activate-account?token=abc',
    );
    expect(output.bootstrapArtifacts.resetUrl).toBe(
      'https://app.example.com/reset-password?token=xyz',
    );
  });
});
