import { EmailExecutionService } from './email-execution.service';

/**
 * DP-QA-028. The auth-mail cool-down stops an anonymous endpoint being used to
 * flood an address. An invitation resend is an administrator's request and
 * revokes the previous link first, so a cool-down skip left no valid link.
 */
function cooldown(input: Record<string, unknown>, recent: number) {
  const service = Object.create(EmailExecutionService.prototype) as Record<
    string,
    unknown
  >;
  service.repository = {
    countRecentDeliveryLogs: jest.fn().mockResolvedValue(recent),
  };
  return (
    service as unknown as {
      checkAuthNotificationCooldown: (
        i: unknown,
      ) => Promise<{ limited: boolean }>;
    }
  ).checkAuthNotificationCooldown(input);
}

const base = {
  tenantId: 't1',
  recipient: 'a@example.test',
  eventCode: 'AUTH_ACCOUNT_ACTIVATION',
};

describe('auth notification cool-down', () => {
  it('limits a second auth mail inside the window', async () => {
    await expect(cooldown(base, 1)).resolves.toMatchObject({ limited: true });
  });

  it('does not limit an administrator-requested mail (invitation resend)', async () => {
    await expect(
      cooldown({ ...base, bypassAuthNotificationCooldown: true }, 5),
    ).resolves.toMatchObject({ limited: false });
  });

  it('still limits the anonymous password-reset event', async () => {
    await expect(
      cooldown({ ...base, eventCode: 'AUTH_PASSWORD_RESET' }, 1),
    ).resolves.toMatchObject({ limited: true });
  });
});
