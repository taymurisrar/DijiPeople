import { redactSecretsInText, sanitizeForErrorLog } from './sanitize-error-log';

describe('sanitizeForErrorLog', () => {
  it('keeps boolean auth flags while redacting credentials', () => {
    const sanitized = sanitizeForErrorLog({
      authEnabled: true,
      smtpAuthEnabled: false,
      auth: { user: 'api', pass: 'secret-token' },
      password: 'secret-password',
    });

    expect(sanitized).toEqual({
      authEnabled: true,
      smtpAuthEnabled: false,
      auth: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  /*
   * BUG-3555. Before this fix, none of the fields below were in the
   * key-based denylist at all, so a `details`/`cause` payload carrying them
   * reached the sanitized error log verbatim. Each assertion fails on the
   * pre-fix version of sanitize-error-log.ts.
   */
  it('redacts national-id and bank-account-shaped keys', () => {
    const sanitized = sanitizeForErrorLog({
      cnic: '42101-1234567-1',
      nationalId: '42101-1234567-1',
      ssn: '123-45-6789',
      taxIdentifier: 'TAX-99887766',
      bankAccountNumber: '00123456789012',
      accountNumber: '00123456789012',
      routingNumber: '021000021',
      cardNumber: '4111111111111111',
      cvv: '123',
      signingKey: 'sk_live_abcdef123456',
      // Deliberately NOT redacted — see the comment in the source file: bare
      // "account"/"bank" keys are too broad and would erase harmless
      // reference fields.
      accountId: 'acc_123',
      accountStatus: 'ACTIVE',
    });

    expect(sanitized).toMatchObject({
      cnic: '[REDACTED]',
      nationalId: '[REDACTED]',
      ssn: '[REDACTED]',
      taxIdentifier: '[REDACTED]',
      bankAccountNumber: '[REDACTED]',
      accountNumber: '[REDACTED]',
      routingNumber: '[REDACTED]',
      cardNumber: '[REDACTED]',
      cvv: '[REDACTED]',
      signingKey: '[REDACTED]',
      accountId: 'acc_123',
      accountStatus: 'ACTIVE',
    });
  });

  it('scrubs a secret interpolated into a stack trace string, not just keyed fields', () => {
    const stack =
      'Error: request failed\n    at fetch (client.ts:12)\n    Authorization: Bearer sk_live_abcdefghijklmnop';

    const sanitized = sanitizeForErrorLog({ stack });

    expect(sanitized.stack).not.toContain('sk_live_abcdefghijklmnop');
    expect(sanitized.stack).toContain('Bearer [REDACTED]');
  });

  it('redacts a Postgres connection string embedded in a message, keeping the host visible', () => {
    const message =
      'Could not connect using postgres://appuser:Sup3rSecret@db.internal.example:5432/hrm';

    const sanitized = sanitizeForErrorLog({ message });

    expect(sanitized.message).not.toContain('Sup3rSecret');
    expect(sanitized.message).not.toContain('appuser');
    expect(sanitized.message).toBe(
      'Could not connect using postgres://[REDACTED]@db.internal.example:5432/hrm',
    );
  });

  it('redacts a JWT-shaped string in free text', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PYb4LddvhpEA';
    const sanitized = sanitizeForErrorLog({ message: `token=${jwt}` });

    expect(sanitized.message).not.toContain(jwt);
  });

  it('redacts a PEM private-key block', () => {
    const key =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAKj34GkxFhD90vcNLYLInFEr\n-----END RSA PRIVATE KEY-----';
    const sanitized = sanitizeForErrorLog({ details: key });

    expect(sanitized.details).toBe('[REDACTED_PRIVATE_KEY]');
  });

  it('redacts a Luhn-valid card number embedded in free text', () => {
    const sanitized = sanitizeForErrorLog({
      message: 'Charge failed for card 4111 1111 1111 1111 on file',
    });

    expect(sanitized.message).not.toContain('4111 1111 1111 1111');
    expect(sanitized.message).toContain('[REDACTED_CARD]');
  });

  it('redacts a password=/secret= pair in free text without erasing the rest of the message', () => {
    const sanitized = sanitizeForErrorLog({
      message: 'Login failed: password=hunter2 for user bob',
    });

    expect(sanitized.message).toBe(
      'Login failed: password=[REDACTED] for user bob',
    );
  });

  it('redacts a real IBAN', () => {
    const sanitized = sanitizeForErrorLog({
      message: 'Refund destination GB29NWBK60161331926819 rejected',
    });

    expect(sanitized.message).toContain('[REDACTED_IBAN]');
    expect(sanitized.message).not.toContain('GB29NWBK60161331926819');
  });

  /*
   * No-false-positive guard: a UUID, a trace id and a plausible epoch-ms
   * timestamp must all survive untouched. `1758800000000` is deliberately
   * Luhn-invalid (checksum 26, not divisible by 10) so the card-number scan
   * does not treat every millisecond timestamp as a card number.
   */
  it('does not redact a UUID, a trace id, or a non-card 13-digit timestamp', () => {
    const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const traceId = 'req_8f3c2d1a9b7e4c0a9a1d6e2f5b3c7d81';
    const timestamp = '1758800000000';

    const sanitized = sanitizeForErrorLog({
      message: `id=${uuid} trace=${traceId} at=${timestamp}`,
    });

    expect(sanitized.message).toContain(uuid);
    expect(sanitized.message).toContain(traceId);
    expect(sanitized.message).toContain(timestamp);
  });

  it('keeps a free-standing email address in a message intact (documented decision)', () => {
    const sanitized = sanitizeForErrorLog({
      message: 'Employee jane.doe@acme.com was not found',
    });

    expect(sanitized.message).toBe('Employee jane.doe@acme.com was not found');
  });
});

describe('redactSecretsInText', () => {
  it('returns falsy input unchanged', () => {
    expect(redactSecretsInText('')).toBe('');
  });
});
