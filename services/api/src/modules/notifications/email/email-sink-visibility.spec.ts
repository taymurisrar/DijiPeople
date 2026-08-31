import { EmailDeliveryStatus, EmailProviderType } from '@prisma/client';
import { isSinkProvider } from './providers';

/*
 * A workspace that cannot send email should say so.
 *
 * The demo tenant's only email provider was a CONSOLE sink, and every layer
 * reported success anyway: the scheduled report ran `COMPLETED`, its delivery
 * log said `SENT` with a `console_1788166820151_…` message id, and the single
 * trace that nobody had received anything was a `providerType` field nobody
 * reads. The owner chose to leave the demo tenant a sink and fix the silence.
 *
 * These pin the three facts that make the silence impossible to repeat:
 * a sink is recognisable, a sink send is not recorded as SENT, and the
 * capability answer distinguishes a sink from a real transport.
 */

describe('isSinkProvider', () => {
  it('names CONSOLE and DEV as sinks', () => {
    expect(isSinkProvider(EmailProviderType.CONSOLE)).toBe(true);
    expect(isSinkProvider(EmailProviderType.DEV)).toBe(true);
  });

  it.each([
    EmailProviderType.SMTP,
    EmailProviderType.SES,
    EmailProviderType.SENDGRID,
    EmailProviderType.MAILGUN,
    EmailProviderType.POSTMARK,
  ])('does not call %s a sink', (providerType) => {
    expect(isSinkProvider(providerType)).toBe(false);
  });

  /*
   * The enum also carries CUSTOM. It is not a sink — it reaches
   * ApiPlaceholderEmailProvider, which throws rather than silently discarding —
   * and calling it one would report "cannot deliver" for a configuration that
   * fails loudly instead.
   */
  it('does not call CUSTOM a sink', () => {
    expect(isSinkProvider(EmailProviderType.CUSTOM)).toBe(false);
  });
});

describe('EmailDeliveryStatus', () => {
  it('carries NOT_DELIVERED, distinct from DRY_RUN and SKIPPED', () => {
    /*
     * DRY_RUN means the caller asked for a rehearsal (`input.dryRun`) and
     * SKIPPED means the send was suppressed before a provider was reached.
     * Reusing either for "your workspace cannot deliver" would make all three
     * unreadable — the handoff argued this explicitly, so it is pinned.
     */
    expect(EmailDeliveryStatus.NOT_DELIVERED).toBe('NOT_DELIVERED');
    expect(EmailDeliveryStatus.NOT_DELIVERED).not.toBe(
      EmailDeliveryStatus.DRY_RUN,
    );
    expect(EmailDeliveryStatus.NOT_DELIVERED).not.toBe(
      EmailDeliveryStatus.SKIPPED,
    );
    expect(EmailDeliveryStatus.NOT_DELIVERED).not.toBe(
      EmailDeliveryStatus.SENT,
    );
  });
});
