import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { isErrorCode } from './app-error';
import { ERROR_CATALOG } from './error-catalog';

/*
 * BUG-2332 — every attendance refusal reached the browser as VALIDATION_FAILED.
 *
 * `attendance.service.ts` throws an UnprocessableEntityException carrying the
 * engine's own `reasonCode` as `{ code, errorCode }`. `HttpExceptionFilter`
 * keeps that code only if `isErrorCode` recognises it; otherwise it falls
 * through to `statusCode === 422 → VALIDATION_FAILED`. None of the attendance
 * reason codes existed in the catalog, so every one of them was erased.
 *
 * The damage was in the browser. `classifyAttendanceFailure`
 * (apps/web/lib/attendance/attendance-outcome.ts) switches on exactly these
 * codes and deliberately routes an unrecognised code to `unexpected`, which
 * raises the platform's technical error dialog. An employee refused for an
 * ordinary policy reason got "ERROR VALIDATION_FAILED", a reference id and a
 * "Download log" button.
 *
 * This test is derived from the engine source rather than from a hand-written
 * list, so a reason code added later is caught here instead of being discovered
 * by an employee. A hardcoded list would have passed on the day the bug shipped.
 */

const MODULES_DIR = join(__dirname, '..', '..', 'modules');
const SOURCE_DIRS = ['attendance-engine', 'attendance'].map((name) =>
  join(MODULES_DIR, name),
);

/**
 * Reason codes the engine emits for refusals.
 *
 * The ALLOW outcomes never become an exception, so they need no catalog entry.
 * They are excluded by name and not by an `_ALLOWED` suffix rule, because
 * METHOD_NOT_ALLOWED ends in exactly that suffix and is a refusal — a suffix
 * test drops it, and it is one of the codes this whole file exists to protect.
 */
const ALLOW_OUTCOME_CODES = new Set([
  'FIELD_WORK_ALLOWED',
  'OFFICE_WEB_ALLOWED',
  'REMOTE_WORK_ALLOWED',
]);

function typeScriptFilesUnder(dir: string): string[] {
  const files: string[] = [];

  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...typeScriptFilesUnder(full));
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }

  return files;
}

function refusalReasonCodesInEngineSource(): string[] {
  const codes = new Set<string>();

  for (const dir of SOURCE_DIRS) {
    for (const file of typeScriptFilesUnder(dir)) {
      const source = readFileSync(file, 'utf8');
      // Deliberately no \n in this pattern: this repository's working trees are
      // CRLF, and a \n-anchored source-reading assertion matches nothing locally
      // while matching everything in CI — it would pass here by being vacuous.
      for (const match of source.matchAll(
        /reasonCode:\s*'([A-Z][A-Z0-9_]*)'/g,
      )) {
        const code = match[1];
        if (!ALLOW_OUTCOME_CODES.has(code)) codes.add(code);
      }
    }
  }

  return [...codes].sort();
}

describe('attendance reason codes survive the exception filter', () => {
  it('finds the engine reason codes at all', () => {
    // Guards the test itself: if the source moves or the shape changes, the
    // loop below would iterate nothing and pass without checking anything.
    const codes = refusalReasonCodesInEngineSource();

    expect(codes.length).toBeGreaterThanOrEqual(7);
    expect(codes).toContain('WORK_MODE_DISALLOWS_REMOTE');
  });

  it('registers every engine refusal code in the error catalog', () => {
    const missing = refusalReasonCodesInEngineSource().filter(
      (code) => !isErrorCode(code),
    );

    // Named in the failure message: the fix is to add a catalog entry, and the
    // next reader should not have to work out which code is unregistered.
    expect(missing).toEqual([]);
  });

  it('keeps the codes the attendance UI switches on', () => {
    /*
     * These are the names `classifyAttendanceFailure` matches. They are pinned
     * separately from the source scan because a rename on either side breaks
     * the contract silently — the API would emit a code the UI does not know,
     * and the employee would get the technical dialog again.
     */
    const uiCodes = [
      'WORK_SITE_REQUIRES_DEVICE',
      'WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE',
      'WORK_SITE_ATTENDANCE_DISABLED',
      'WORK_MODE_DISALLOWS_REMOTE',
      'WORK_MODE_DISALLOWS_OFFICE',
      'WEB_ATTENDANCE_DISABLED',
      'REMOTE_REQUIRES_APPROVAL',
      'METHOD_NOT_ALLOWED',
      'UNAUTHORIZED_WORK_SITE',
      'ACCURACY_TOO_LOW',
      'COORDINATES_INVALID',
      'LOCATION_UNUSABLE',
    ];

    for (const code of uiCodes) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it('classifies them as business refusals, not server faults', () => {
    /*
     * 422 and `warning` are what make these renderable as a policy answer. A
     * 500 or an `error` severity would send the UI back to the technical dialog
     * by a different route, and would page whoever watches error severity.
     */
    for (const code of refusalReasonCodesInEngineSource()) {
      if (!isErrorCode(code)) continue;
      const entry = ERROR_CATALOG[code];

      expect(entry.statusCode).toBe(422);
      expect(entry.severity).toBe('warning');
    }
  });
});
