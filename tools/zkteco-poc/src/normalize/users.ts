/**
 * Normalises device users into `ExternalAttendanceUser`.
 *
 * PRIVACY: `SSR_GetAllUserInfo` returns a password in its fourth argument. That
 * value is discarded inside the x86 worker the moment the SDK call returns and
 * never crosses the worker's JSON boundary, so it cannot reach this file, the
 * logs or the output. Nothing biometric is requested anywhere in the chain.
 *
 * External user IDs are explicit device identities. They are NOT assumed to be
 * sequential, dense, or numeric — they are treated as opaque strings.
 */

import { PUNCH_SOURCE, type ExternalAttendanceUser } from '../types';

interface RawUserLike {
  externalUserId?: unknown;
  name?: unknown;
  privilegeRaw?: unknown;
  enabled?: unknown;
}

/** Device strings are fixed-width and null padded. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(CONTROL_CHARACTERS, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface UserNormalisationResult {
  users: ExternalAttendanceUser[];
  /** Records the worker returned that carried no usable identifier. */
  skipped: number;
}

export function normalizeUsers(rawUsers: readonly unknown[]): UserNormalisationResult {
  const users: ExternalAttendanceUser[] = [];
  let skipped = 0;

  for (const entry of rawUsers) {
    if (!entry || typeof entry !== 'object') {
      skipped += 1;
      continue;
    }
    const raw = entry as RawUserLike;

    const externalUserId = cleanText(raw.externalUserId);
    if (!externalUserId) {
      skipped += 1;
      continue;
    }

    const name = cleanText(raw.name);
    const privilegeRaw = typeof raw.privilegeRaw === 'number' ? raw.privilegeRaw : undefined;
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined;

    users.push({
      externalUserId,
      ...(name ? { name } : {}),
      // Raw privilege only. No USER/ADMIN label is applied: the meaning of the
      // privilege value on this firmware has not been verified.
      ...(privilegeRaw !== undefined ? { privilegeRaw } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      source: PUNCH_SOURCE,
    });
  }

  // Stable ordering makes repeated runs diffable. Sorted as strings because the
  // IDs are opaque identities, not numbers.
  users.sort((left, right) =>
    left.externalUserId < right.externalUserId
      ? -1
      : left.externalUserId > right.externalUserId
        ? 1
        : 0,
  );

  return { users, skipped };
}
