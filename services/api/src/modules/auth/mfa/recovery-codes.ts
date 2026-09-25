import { randomBytes } from 'node:crypto';

/*
 * One-time MFA recovery codes (ADR-0019).
 *
 * Ten codes of ten characters from a 32-symbol alphabet: fifty bits each, far
 * beyond what a locked-out-after-five-failures endpoint can be made to search.
 * The alphabet is Crockford's base32 — no I, L, O or U — because these codes
 * are read off paper and typed by a person who has just lost their phone, and
 * `1`/`l`/`I` and `0`/`O` are exactly the characters that get mistyped. The
 * normaliser maps those look-alikes back, so a code written down ambiguously
 * still works.
 *
 * Only a keyed hash is stored (`SecretEncryptionService.hmac`), salted with the
 * owning account's id so the same code on two accounts never produces the same
 * hash — `codeHash` is unique across the whole table.
 */

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** A fresh set, formatted for display: `xxxxx-xxxxx`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();

  while (codes.size < count) {
    // 32 symbols and 256 byte values: `byte & 31` is uniform, no modulo bias.
    const bytes = randomBytes(RECOVERY_CODE_LENGTH);
    const raw = Array.from(bytes, (byte) => ALPHABET[byte & 31]).join('');
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }

  return [...codes];
}

/**
 * The canonical form a code is hashed in, or `null` when the input cannot be a
 * recovery code at all. Case, spaces and hyphens are ignored; `o` reads as `0`,
 * and `i`/`l` as `1`.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const collapsed = input
    .toLowerCase()
    .replace(/[\s-]/g, '')
    .replace(/o/g, '0')
    .replace(/[il]/g, '1');

  if (collapsed.length !== RECOVERY_CODE_LENGTH) return null;
  for (const character of collapsed) {
    if (!ALPHABET.includes(character)) return null;
  }

  return collapsed;
}

/** What is passed to the keyed hash: the subject id binds the code to one account. */
export function recoveryCodeHashInput(
  subjectId: string,
  normalizedCode: string,
): string {
  return `mfa-recovery:${subjectId}:${normalizedCode}`;
}
