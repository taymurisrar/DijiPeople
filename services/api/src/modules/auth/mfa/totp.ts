import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/*
 * RFC 6238 time-based one-time passwords, on `node:crypto` (ADR-0019).
 *
 * Deliberately not `otplib`/`speakeasy`: the whole algorithm is an HMAC, a
 * dynamic truncation and a modulus, and one fewer dependency in the
 * authentication path is worth more than the sixty lines. The parameters are
 * the ones every mainstream authenticator app defaults to — HMAC-SHA1, six
 * digits, a thirty-second step — because an app that silently ignores an
 * unusual `algorithm=` parameter in the otpauth URI would show codes that never
 * verify, and the person would have no way to tell why.
 *
 * Nothing in this file logs, and nothing should: every argument is either a
 * secret or a code derived from one.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of "now" — RFC 6238 §5.2's clock-drift allowance. */
export const TOTP_WINDOW = 1;
/** 160 bits: the RFC 4226 §4 recommended secret length for HMAC-SHA1. */
export const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, unpadded — the form authenticator apps expect in a URI. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes base32, tolerating what a person copying a key by hand produces:
 * lower case, spaces, hyphens and trailing `=` padding.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error('Invalid base32 character.');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** A fresh random TOTP secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** RFC 4226 HOTP with dynamic truncation. */
export function hotp(
  secret: Buffer,
  counter: number | bigint,
  digits = TOTP_DIGITS,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The RFC 6238 time step `T` for an instant. */
export function totpTimeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpAt(
  secretBase32: string,
  nowMs: number,
  digits = TOTP_DIGITS,
): string {
  return hotp(base32Decode(secretBase32), totpTimeStep(nowMs), digits);
}

export type TotpVerification =
  | { valid: true; step: number }
  | { valid: false; reason: 'MALFORMED' | 'INVALID' | 'REPLAYED' };

/**
 * Checks a six-digit code against the steps either side of now.
 *
 * Returns the step that matched so the caller can record it: RFC 6238 §5.2
 * requires that a verifier not accept a second use of a code, and the only
 * durable way to do that across requests is to remember the last accepted
 * step and refuse that step and everything before it. The caller persists the
 * step with a conditional write, so two concurrent requests presenting the same
 * code cannot both win.
 *
 * Every candidate step is compared, in constant time, whether or not an earlier
 * one already matched — so the time taken does not say which step was right.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: {
    nowMs?: number;
    window?: number;
    lastUsedStep?: number | bigint | null;
  } = {},
): TotpVerification {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const secret = base32Decode(secretBase32);
  const currentStep = totpTimeStep(options.nowMs ?? Date.now());
  const window = options.window ?? TOTP_WINDOW;
  const presented = Buffer.from(normalized);
  let matchedStep: number | null = null;

  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    const equal = timingSafeEqual(expected, presented);
    if (equal && matchedStep === null) {
      matchedStep = step;
    }
  }

  if (matchedStep === null) {
    return { valid: false, reason: 'INVALID' };
  }

  if (
    options.lastUsedStep !== undefined &&
    options.lastUsedStep !== null &&
    BigInt(matchedStep) <= BigInt(options.lastUsedStep)
  ) {
    return { valid: false, reason: 'REPLAYED' };
  }

  return { valid: true, step: matchedStep };
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The issuer appears both as the label prefix and as the `issuer` parameter:
 * older apps read only the prefix, newer ones prefer the parameter, and a
 * mismatch between the two makes some apps file the account under the wrong
 * name.
 */
export function buildOtpauthUri(input: {
  issuer: string;
  accountLabel: string;
  secretBase32: string;
}): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(
    input.accountLabel,
  )}`;
  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/** `ABCD EFGH …` — the key as a person types it into an app by hand. */
export function formatManualEntryKey(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}
