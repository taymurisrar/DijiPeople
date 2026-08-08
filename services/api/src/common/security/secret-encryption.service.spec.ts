import { SecretEncryptionService } from './secret-encryption.service';
import { SECRET_KEY_PATTERN } from '../../modules/notifications/email/email-safety';

/*
 * Provider credentials used to sit in the database as plain JSON. These pin the
 * round trip, and the two behaviours that matter operationally: values written
 * before a key existed keep working, and encrypting twice is not possible.
 */

/* null means "no key configured"; undefined would hit the default. */
function buildService(key: string | null = 'a-test-encryption-key') {
  return new SecretEncryptionService({
    get: (name: string) =>
      name === 'SECRET_ENCRYPTION_KEY' ? (key ?? undefined) : undefined,
  } as never);
}

const isSecret = (key: string) => SECRET_KEY_PATTERN.test(key);

describe('secret encryption', () => {
  it('round-trips a value', () => {
    const service = buildService();
    const encrypted = service.encrypt('hunter2');

    expect(encrypted).not.toContain('hunter2');
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(service.decrypt(encrypted)).toBe('hunter2');
  });

  it('produces a different ciphertext each time', () => {
    const service = buildService();
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('encrypts only the fields that look like secrets', () => {
    const service = buildService();
    const result = service.encryptSecrets(
      { host: 'smtp.example.com', port: 2525, password: 'hunter2' },
      isSecret,
    ) as Record<string, unknown>;

    expect(result.host).toBe('smtp.example.com');
    expect(result.port).toBe(2525);
    expect(service.isEncrypted(result.password)).toBe(true);
    expect(
      (service.decryptSecrets(result, isSecret) as Record<string, unknown>)
        .password,
    ).toBe('hunter2');
  });

  it('reaches secrets nested inside the configuration', () => {
    const service = buildService();
    const result = service.encryptSecrets(
      { auth: { user: 'bob', pass: 'sesame' } },
      (key) => key === 'pass',
    ) as { auth: Record<string, unknown> };

    expect(service.isEncrypted(result.auth.pass)).toBe(true);
    expect(result.auth.user).toBe('bob');
  });

  it('does not encrypt an already encrypted value again', () => {
    const service = buildService();
    const once = service.encryptSecrets({ password: 'x' }, isSecret) as Record<
      string,
      unknown
    >;
    const twice = service.encryptSecrets(once, isSecret) as Record<
      string,
      unknown
    >;

    expect(twice.password).toBe(once.password);
    expect(service.decrypt(twice.password as string)).toBe('x');
  });

  it('passes through values stored before a key was configured', () => {
    const service = buildService();
    expect(service.decrypt('plaintext-legacy-password')).toBe(
      'plaintext-legacy-password',
    );
  });

  it('stores plaintext outside production when no key is set', () => {
    const service = buildService(null);
    expect(service.isEnabled).toBe(false);
    expect(service.encrypt('hunter2')).toBe('hunter2');
  });

  it('refuses a value written with a different key', () => {
    const encrypted = buildService('key-one').encrypt('hunter2');
    expect(() => buildService('key-two').decrypt(encrypted)).toThrow(
      /could not be decrypted/i,
    );
  });
});
