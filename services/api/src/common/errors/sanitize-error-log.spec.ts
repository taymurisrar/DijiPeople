import { sanitizeForErrorLog } from './sanitize-error-log';

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
});
