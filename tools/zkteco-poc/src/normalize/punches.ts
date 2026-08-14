/**
 * Normalises raw device transactions into `RawAttendancePunch`.
 *
 * SCOPE: this is a faithful transcription of what the device stored. It does NOT
 * decide Present / Absent / Late / Early / Overtime / worked hours, and it does
 * not translate the raw Verify or State codes into check-in / check-out. Those
 * semantics are unverified for this firmware, and all of that belongs to
 * DijiPeople's attendance & reconciliation engine in a later phase.
 *
 * TIMESTAMPS: `SSR_GetGeneralLogData` returns separate year/month/day/hour/
 * minute/second parts with no timezone. The worker composes them into
 * `YYYY-MM-DDTHH:mm:ss` and nothing here attaches an offset — doing so would be
 * an assumption, not data.
 */

import { PUNCH_PROVIDER, PUNCH_SOURCE, type RawAttendancePunch } from '../types';
import { buildEventFingerprint } from './fingerprint';

interface RawPunchLike {
  externalUserId?: unknown;
  occurredAtLocal?: unknown;
  verificationModeRaw?: unknown;
  punchStateRaw?: unknown;
  workCodeRaw?: unknown;
}

/** Device strings are fixed-width and null padded. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** The exact shape the worker emits. Anything else is treated as unusable. */
const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export interface PunchNormalisationResult {
  punches: RawAttendancePunch[];
  /** Records dropped for having no user id or no usable timestamp. */
  skipped: number;
  /** Distinct `eventFingerprint` values, i.e. collisions within this batch. */
  distinctFingerprints: number;
  /** Earliest and latest `occurredAtLocal` seen, for the historical-range report. */
  earliestOccurredAtLocal?: string;
  latestOccurredAtLocal?: string;
}

export interface PunchNormalisationContext {
  deviceSerialNumber: string;
  machineNumber: number;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(CONTROL_CHARACTERS, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function rawNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizePunches(
  rawPunches: readonly unknown[],
  context: PunchNormalisationContext,
): PunchNormalisationResult {
  const punches: RawAttendancePunch[] = [];
  const fingerprints = new Set<string>();
  let skipped = 0;

  for (const entry of rawPunches) {
    if (!entry || typeof entry !== 'object') {
      skipped += 1;
      continue;
    }
    const raw = entry as RawPunchLike;

    const externalUserId = cleanText(raw.externalUserId);
    const occurredAtLocal = cleanText(raw.occurredAtLocal);

    if (!externalUserId || !occurredAtLocal || !LOCAL_TIMESTAMP.test(occurredAtLocal)) {
      skipped += 1;
      continue;
    }

    const verificationModeRaw = rawNumber(raw.verificationModeRaw);
    const punchStateRaw = rawNumber(raw.punchStateRaw);
    const workCodeRaw = rawNumber(raw.workCodeRaw);

    const eventFingerprint = buildEventFingerprint({
      deviceSerialNumber: context.deviceSerialNumber,
      externalUserId,
      occurredAtLocal,
      verificationModeRaw,
      punchStateRaw,
      workCodeRaw,
    });
    fingerprints.add(eventFingerprint);

    punches.push({
      provider: PUNCH_PROVIDER,
      deviceSerialNumber: context.deviceSerialNumber,
      machineNumber: context.machineNumber,
      externalUserId,
      occurredAtLocal,
      ...(verificationModeRaw !== undefined ? { verificationModeRaw } : {}),
      ...(punchStateRaw !== undefined ? { punchStateRaw } : {}),
      ...(workCodeRaw !== undefined ? { workCodeRaw } : {}),
      source: PUNCH_SOURCE,
      eventFingerprint,
    });
  }

  // Sorting makes repeated runs byte-comparable, which matters when the customer
  // is asked to run the POC twice and diff the output. `occurredAtLocal` sorts
  // correctly as a string because the format is fixed-width.
  punches.sort((left, right) => {
    if (left.occurredAtLocal !== right.occurredAtLocal) {
      return left.occurredAtLocal < right.occurredAtLocal ? -1 : 1;
    }
    if (left.externalUserId !== right.externalUserId) {
      return left.externalUserId < right.externalUserId ? -1 : 1;
    }
    return left.eventFingerprint < right.eventFingerprint ? -1 : 1;
  });

  const first = punches[0];
  const last = punches[punches.length - 1];

  return {
    punches,
    skipped,
    distinctFingerprints: fingerprints.size,
    ...(first ? { earliestOccurredAtLocal: first.occurredAtLocal } : {}),
    ...(last ? { latestOccurredAtLocal: last.occurredAtLocal } : {}),
  };
}
