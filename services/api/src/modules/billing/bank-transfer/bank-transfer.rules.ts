import { randomInt } from 'node:crypto';
import { BankTransferClaimStatus } from '@prisma/client';

/**
 * Pure rules for bank-transfer settlement. No I/O lives here, so every rule the
 * money depends on can be pinned by a unit test without a database.
 */

/** Open claims: the buyer is waiting on an operator, so funds may be in flight. */
export const OPEN_CLAIM_STATUSES: readonly BankTransferClaimStatus[] = [
  BankTransferClaimStatus.PENDING_VERIFICATION,
  BankTransferClaimStatus.CLARIFICATION_REQUESTED,
];

/** A claim an operator may still decide. */
export const DECIDABLE_CLAIM_STATUSES = OPEN_CLAIM_STATUSES;

/** How long a bank invoice stays payable before the order ages out. */
export const BANK_INVOICE_TTL_DAYS = 7;

// No 0/O/1/I/L: the buyer types this into a banking app by hand.
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A short, human-typable payment reference, e.g. `DP-7K3M-X9QA`.
 *
 * Randomness is the point: a sequential reference lets one buyer guess another
 * buyer's reference and quote it. Uniqueness is enforced by the database
 * (`SubscriptionOrder.bankReference @unique`); the caller retries on collision.
 */
export function generateBankReference(): string {
  const pick = (length: number) =>
    Array.from(
      { length },
      () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)],
    ).join('');
  return `DP-${pick(4)}-${pick(4)}`;
}

/** Canonical form of a customer- or operator-typed bank reference. */
export function normalizeBankReference(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** `PK36SCBL0000001123456702` → `PK36••••••••••••••••6702`. */
export function maskIdentifier(value: string, visible = 4): string {
  const compact = value.replace(/\s+/g, '');
  if (compact.length <= visible * 2) {
    return '•'.repeat(Math.max(compact.length - 2, 0)) + compact.slice(-2);
  }
  return (
    compact.slice(0, 4) +
    '•'.repeat(compact.length - 4 - visible) +
    compact.slice(-visible)
  );
}

/** Mask all but the first letter of each word of an account title. */
export function maskAccountTitle(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0) + '•'.repeat(Math.max(word.length - 1, 0)))
    .join(' ');
}

/**
 * IBAN structure check (ISO 13616 mod-97). Pakistan IBANs are 24 characters,
 * but the checksum rule is country-independent so a USD account abroad is not
 * rejected by a hardcoded length.
 */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export type AmountCheck =
  | { ok: true }
  | { ok: false; reason: 'CURRENCY_MISMATCH' | 'UNDERPAID' | 'OVERPAID' };

/**
 * Compare what the bank received with what the order was priced at, in minor
 * units so no decimal rounding can hide a difference. Anything but an exact
 * match is never settled automatically: a part payment or an overpayment is a
 * reconciliation case for a human, not an activation.
 */
export function checkReceivedAmount(
  expected: { amount: string | number; currency: string },
  received: { amount: string | number; currency: string },
): AmountCheck {
  if (
    expected.currency.trim().toUpperCase() !==
    received.currency.trim().toUpperCase()
  ) {
    return { ok: false, reason: 'CURRENCY_MISMATCH' };
  }
  const expectedMinor = toMinorUnits(expected.amount);
  const receivedMinor = toMinorUnits(received.amount);
  if (receivedMinor === expectedMinor) return { ok: true };
  return {
    ok: false,
    reason: receivedMinor < expectedMinor ? 'UNDERPAID' : 'OVERPAID',
  };
}

export function toMinorUnits(value: string | number): bigint {
  const text = typeof value === 'number' ? value.toFixed(2) : value;
  const match = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(text.trim());
  if (!match) throw new Error(`Not a decimal amount: ${text}`);
  const cents =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? '0').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

// ---- evidence --------------------------------------------------------------

export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MAX_FILES_PER_CLAIM = 3;

export type EvidenceKind = 'application/pdf' | 'image/png' | 'image/jpeg';

/**
 * What the bytes actually are, from their signature. The browser-declared
 * content type and the file extension are attacker-controlled and are never
 * consulted: a script renamed `receipt.png` fails here.
 */
export function sniffEvidenceKind(buffer: Buffer): EvidenceKind | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return 'application/pdf';
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return null;
}

/** A name that is safe to store and show: no path, no control characters. */
export function sanitizeEvidenceFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'evidence';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f"<>|:*?]/g, '').trim();
  return (cleaned || 'evidence').slice(0, 120);
}
