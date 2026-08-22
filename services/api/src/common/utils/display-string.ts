import { Prisma } from '@prisma/client';

/**
 * Turn an `unknown` into something worth reading.
 *
 * `String(value)` on an object produces `[object Object]`. That is tolerable in
 * a scratch script and expensive in a log line: an error message that reads
 * `[object Object]` is a lost incident, because the one artifact left behind
 * after a production failure says nothing about it. ITEM-0042 counted 47 sites
 * doing exactly that, several of them in error paths.
 *
 * The rule this satisfies — `@typescript-eslint/no-base-to-string` — is not
 * pedantry. It fires precisely where a value's type does not promise a useful
 * `toString`, which is precisely where the fallback is worthless.
 *
 * ## What it renders
 *
 * | Input | Output |
 * |---|---|
 * | `null`, `undefined` | `''` |
 * | a string | itself, unchanged |
 * | number, boolean, bigint | its usual form |
 * | `Error` | its `message`, or its name when the message is blank |
 * | `Date` | ISO 8601 |
 * | `Prisma.Decimal` | its exact decimal form, never a lossy float |
 * | anything else | JSON, or a described placeholder when JSON cannot |
 *
 * `Decimal` earns its own line because money is the case where the difference
 * matters most: `Number(decimal)` loses precision silently, and `[object
 * Object]` loses the value entirely.
 */
export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (value instanceof Error) {
    // A thrown Error with no message is common — `throw new NotFoundException()`
    // among them — and "Error" alone is more use than an empty string.
    return value.message.trim() || value.name;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (typeof value === 'symbol') return value.toString();

  /*
   * Arrays, Maps and Sets go to JSON rather than through their own `toString`.
   * `Array.prototype.toString` gives `1,two`, which cannot tell `['a,b']` from
   * `['a', 'b']`; `Map` and `Set` inherit Object's and give `[object Map]`,
   * which is the very thing this function exists to avoid. Their entries are
   * what a reader wants.
   */
  if (Array.isArray(value)) return safeJson(value);
  if (value instanceof Map) return safeJson(Object.fromEntries(value));
  if (value instanceof Set) return safeJson([...value]);

  // Any other class that defines its own `toString` meant it to be used; the
  // default one inherited from Object did not.
  if (
    typeof value === 'object' &&
    typeof (value as { toString?: unknown }).toString === 'function' &&
    (value as { toString: unknown }).toString !== Object.prototype.toString
  ) {
    /*
     * The guard above established that this object defines a `toString` of its
     * own, which is exactly the case the rule cannot see from the type. Saying
     * so in the cast is the honest fix; an `eslint-disable` here would suppress
     * the rule for the one function written to satisfy it.
     */
    return (value as { toString(): string }).toString();
  }

  return safeJson(value);
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    // `JSON.stringify` returns undefined for a function or a lone symbol.
    return json ?? `[${typeof value}]`;
  } catch {
    // Circular, or a BigInt inside. Say which, rather than `[object Object]`.
    return '[unserialisable object]';
  }
}

/**
 * The message to log or surface for a thrown value.
 *
 * The same shape appeared in seven places as
 * `error instanceof Error ? error.message : String(error ?? '')`, and the
 * second half of that ternary is the defect — the case where the value is *not*
 * an Error is exactly the case where `String` gives up.
 */
export function toErrorMessage(error: unknown, fallback = ''): string {
  const message = toDisplayString(error);
  return message || fallback;
}
