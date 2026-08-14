/**
 * Deterministic dedupe candidate for a raw punch.
 *
 * NOTE ON THE NAME: "fingerprint" here means a content hash, not biometrics. The
 * POC never reads biometric templates.
 *
 * It is not yet proven that this K50 exposes a stable transaction/event ID
 * through `SSR_GetGeneralLogData` — the SDK call returns only enrolment number,
 * date/time parts, verify mode, in/out mode and work code, with no record id
 * among them. Until a stable id is proven to exist, the key is derived from the
 * punch's own content.
 *
 * Fields are joined with a separator that cannot occur inside any of them, so
 * `("a","bc")` and `("ab","c")` cannot collide.
 *
 * KNOWN LIMITATION — this is preparation, not the final deduplication design:
 * two genuinely distinct punches by the same user, in the same second, with the
 * same raw verify/state/workcode values would hash identically. The device
 * stores only second-level resolution, so nothing in the payload can separate
 * them. Whether that matters must be decided from real device data before this
 * key is promoted into a production uniqueness constraint.
 */

import { createHash } from 'node:crypto';

const SEPARATOR = '␟'; // SYMBOL FOR UNIT SEPARATOR — never present in device payloads

export interface EventFingerprintInput {
  deviceSerialNumber: string;
  externalUserId: string;
  occurredAtLocal: string;
  verificationModeRaw?: number;
  punchStateRaw?: number;
  workCodeRaw?: number;
}

function part(value: string | number | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

export function buildEventFingerprint(input: EventFingerprintInput): string {
  const payload = [
    part(input.deviceSerialNumber),
    part(input.externalUserId),
    part(input.occurredAtLocal),
    part(input.verificationModeRaw),
    part(input.punchStateRaw),
    part(input.workCodeRaw),
  ].join(SEPARATOR);

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
