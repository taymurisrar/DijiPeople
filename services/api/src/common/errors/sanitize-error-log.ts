const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'auth',
  'apikey',
  'api_key',
  'connectionstring',
  'database_url',
  'jwt',
  'otp',
];

const REDACTED = '[REDACTED]';

export function sanitizeForErrorLog<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[Max depth reached]' as T;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForErrorLog(item, depth + 1)) as T;
  }
  if (value instanceof Date) return value.toISOString() as T;
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : sanitizeForErrorLog(item, depth + 1);
  }
  return result as T;
}

export function sanitizeHeaders(headers: Record<string, unknown>) {
  return sanitizeForErrorLog(headers);
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[-\s.]/g, '_').toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}
