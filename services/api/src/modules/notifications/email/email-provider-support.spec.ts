import { EmailProviderType } from '@prisma/client';
import {
  ALL_EMAIL_PROVIDER_TYPES,
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
} from '@repo/config';
import { EmailProviderFactory } from './email-provider-factory.service';
import { ApiPlaceholderEmailProvider } from './providers';

/*
 * BUG-0050 — the settings UI offered five email providers the backend could not
 * deliver through. Each mapped to ApiPlaceholderEmailProvider, whose send and
 * connection-test methods throw, so a tenant administrator could configure SES,
 * mark it default, and silently receive no mail.
 *
 * The defect was two catalogs with nothing comparing them: the UI listed what
 * the Prisma enum allowed, the factory decided what was actually built. These
 * tests are that comparison. They are deliberately blunt — if someone adds an
 * enum value, or ships a provider implementation without publishing it, or
 * publishes one without implementing it, exactly one of them goes red.
 */

function buildFactory() {
  return new EmailProviderFactory(
    {} as never, // repository — unused by getProvider
    {} as never, // configService — unused by getProvider
    { name: 'console' } as never,
    { name: 'smtp' } as never,
  );
}

describe('email provider support is a single catalog', () => {
  it('publishes every value the Prisma enum declares, exactly once', () => {
    const declared = Object.values(EmailProviderType).sort();
    const published = [...ALL_EMAIL_PROVIDER_TYPES].sort();

    expect(published).toEqual(declared);
    expect(new Set(published).size).toBe(published.length);
  });

  it('splits supported and unimplemented without overlap', () => {
    const overlap = SUPPORTED_EMAIL_PROVIDER_TYPES.filter((type) =>
      UNIMPLEMENTED_EMAIL_PROVIDER_TYPES.includes(type),
    );

    expect(overlap).toEqual([]);
  });

  it.each([...SUPPORTED_EMAIL_PROVIDER_TYPES])(
    'returns a real implementation for %s',
    (providerType) => {
      const provider = buildFactory().getProvider(
        providerType as EmailProviderType,
      );

      expect(provider).not.toBeInstanceOf(ApiPlaceholderEmailProvider);
    },
  );

  it.each([...UNIMPLEMENTED_EMAIL_PROVIDER_TYPES])(
    'still resolves %s to the placeholder, so nothing pretends it can send',
    (providerType) => {
      const provider = buildFactory().getProvider(
        providerType as EmailProviderType,
      );

      expect(provider).toBeInstanceOf(ApiPlaceholderEmailProvider);
    },
  );

  it('agrees with its own predicate', () => {
    for (const type of ALL_EMAIL_PROVIDER_TYPES) {
      expect(isSupportedEmailProviderType(type)).toBe(
        SUPPORTED_EMAIL_PROVIDER_TYPES.includes(type),
      );
    }
  });
});
