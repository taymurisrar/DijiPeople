const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'apikey',
  'api_key',
  'pass',
  'connectionstring',
  'database_url',
  'jwt',
  'otp',
  /*
   * BUG-3555. The list above is a generic auth-token/credential denylist. It
   * does not catch the PII/financial fields AGENTS.md's own Security checklist
   * calls out by name ("national ids or bank details"), so a field literally
   * named `bankAccountNumber` or `nationalId` reached the sanitized error log
   * unredacted whenever it appeared inside `details`/`cause` rather than the
   * dedicated employee-record path (which redacts these through
   * `audit-snapshot.ts` instead, a different file for a different write path).
   *
   * `account` and `bank` alone are deliberately NOT added: half the schema
   * uses `accountId`/`accountStatus` as a plain foreign-key or state field, and
   * blanket-redacting every key containing "account" would erase exactly the
   * routing information a support agent opened the error log to find. The
   * patterns below are narrowed to the compound forms that are actually
   * financial-account identifiers.
   */
  'iban',
  'cnic',
  'ssn',
  'nationalid',
  'taxid',
  'bankaccount',
  'accountnumber',
  'routingnumber',
  'cardnumber',
  'cvv',
  'cvc',
  'pin',
  'signingkey',
  'privatekey',
];

const REDACTED = '[REDACTED]';

/*
 * BUG-3555. `stack` and `message` are free text, not keyed objects, so the
 * key-based redaction above never looked at them — a stack trace built from an
 * interpolated string (`throw new Error(\`Invalid token ${token}\`)`) reached
 * the sanitized error log with the live token still in it. Every string value
 * this function touches, at any depth, is now also scanned for the shapes a
 * secret actually takes in free text, independent of what key it lives under.
 */
const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g;
// `user:pass@host` inside any `scheme://` URL — Postgres, MySQL, MongoDB,
// Redis, AMQP, etc. all share this shape. Only the credential half is
// stripped; the host/db name stays, because that is what the reader needs to
// diagnose a connection failure.
const CONNECTION_STRING_CREDENTIALS_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)[^:/\s@]+:[^@\s]+@/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// Three base64url segments separated by dots is a JWT whatever the header
// claims — a real token embedded in a message reads exactly like this.
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
// `password=`, `secret=`, `token:` style pairs inside a free-text message —
// the value is redacted, the surrounding sentence and the key name survive.
const KEY_VALUE_SECRET_PATTERN =
  /\b(password|secret|pwd|token|apikey|api_key)\s*([:=])\s*['"]?[^\s'",;]+/gi;
// IBAN: two uppercase letters (country), two digits (check digits), then
// 11-30 alphanumerics. Deliberately case-sensitive (no `i` flag) — a
// lowercase UUID or trace id never matches, only a real, correctly-cased IBAN
// does.
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
// A candidate card number: starts and ends on a digit, with 11-25 digits/
// separators between. The actual digit count and Luhn check below decide
// whether it is redacted — this only bounds how far the scan looks.
const CARD_CANDIDATE_PATTERN = /\b\d[\d -]{11,25}\d\b/g;

export function sanitizeForErrorLog<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[Max depth reached]' as T;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForErrorLog(item, depth + 1)) as T;
  }
  if (value instanceof Date) return value.toISOString() as T;
  if (typeof value === 'string') return redactSecretsInText(value) as T;
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitizeForErrorLog(item, depth + 1);
  }
  return result as T;
}

export function sanitizeHeaders(headers: Record<string, unknown>) {
  return sanitizeForErrorLog(headers);
}

/**
 * Scrubs secret-shaped substrings out of free text — a stack trace or an
 * interpolated error message — rather than redacting the whole string.
 *
 * BUG-3555's decision on email addresses: a free-standing email in a message
 * or stack (`Employee jane@acme.com not found`) is left intact. Support
 * exists to identify the affected user, and the exception filter's own
 * `enrichErrorDetails` deliberately attaches the caller's email for exactly
 * that reason — stripping every email here would remove the diagnostic value
 * this page exists to preserve, for no attacker-relevant gain (an email
 * address is not a credential). The one place an email is genuinely
 * "secret-bearing" is as the userinfo segment of a connection string
 * (`https://alice@example.com:hunter2@host`), and that whole segment is
 * already redacted by `CONNECTION_STRING_CREDENTIALS_PATTERN` regardless of
 * whether the username happens to look like an email.
 */
export function redactSecretsInText(text: string): string {
  if (!text) return text;
  let result = text;
  result = result.replace(PRIVATE_KEY_BLOCK_PATTERN, '[REDACTED_PRIVATE_KEY]');
  result = result.replace(
    CONNECTION_STRING_CREDENTIALS_PATTERN,
    (_match, scheme: string) => `${scheme}[REDACTED]@`,
  );
  result = result.replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]');
  result = result.replace(JWT_PATTERN, '[REDACTED_JWT]');
  result = result.replace(
    KEY_VALUE_SECRET_PATTERN,
    (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`,
  );
  result = result.replace(IBAN_PATTERN, '[REDACTED_IBAN]');
  result = redactCardNumbers(result);
  return result;
}

function redactCardNumbers(text: string): string {
  return text.replace(CARD_CANDIDATE_PATTERN, (match) => {
    const digits = match.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19) return match;
    return isLuhnValid(digits) ? '[REDACTED_CARD]' : match;
  });
}

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[-\s.]/g, '_').toLowerCase();
  if (
    ['authenabled', 'smtp_auth_enabled', 'smtpauthenabled'].includes(normalized)
  ) {
    return false;
  }
  return (
    normalized === 'auth' ||
    SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern))
  );
}
