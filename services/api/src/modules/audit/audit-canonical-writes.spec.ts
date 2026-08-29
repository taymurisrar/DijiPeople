import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUDIT_ACTIONS,
  LEGACY_AUDIT_ACTION_ALIASES,
} from '../../common/constants/audit-actions';

/**
 * BUG-2046 — regression guard for the write side of the naming-convention fix.
 *
 * `audit-actions.spec.ts` proves the catalog and the alias resolver behave
 * correctly in isolation: an unknown action passes through, a legacy alias
 * resolves, a filter expands. None of that proves the three call sites the
 * bug cited as evidence — `attendance.manual_created`, `attendance.deleted`,
 * `project.create`, `project.update`, `auth.login.succeeded` — actually
 * stopped writing the dotted spelling. A regression there would leave every
 * catalog test above green while new rows kept being written exactly the way
 * this bug was filed against, because nothing exercises those files.
 *
 * This test reads the three files directly and asserts each now writes
 * through `AUDIT_ACTIONS`, not the string literal. Plain substring checks,
 * not a multiline regex: this repository's line endings are CRLF, and a
 * `.`/`\n`-sensitive pattern here would silently stop matching without
 * failing — a `.toContain()` substring check is unaffected by that either
 * way, which is why this file uses one instead of a source-wide regex scan.
 *
 * Existing rows already written under the dotted spelling are untouched —
 * `LEGACY_AUDIT_ACTION_ALIASES` in `common/constants/audit-actions.ts`
 * still resolves them for filtering and display. This test is only about
 * what a *new* row writes.
 */
describe('BUG-2046 write-side canonicalization', () => {
  function source(...segments: string[]) {
    return readFileSync(join(__dirname, '..', ...segments), 'utf8');
  }

  it('attendance.service.ts writes canonical actions, not the dotted literals', () => {
    const text = source('attendance', 'attendance.service.ts');

    expect(text).toContain('AUDIT_ACTIONS.ATTENDANCE_DELETED');
    expect(text).toContain('AUDIT_ACTIONS.ATTENDANCE_MANUAL_CREATED');
    expect(text).toContain('AUDIT_ACTIONS.ATTENDANCE_MANUAL_UPDATED');
    expect(text).not.toContain("action: 'attendance.deleted'");
    expect(text).not.toContain("action: 'attendance.manual_created'");
    expect(text).not.toContain("action: 'attendance.manual_updated'");
  });

  it('projects.service.ts writes canonical actions, not the dotted literals', () => {
    const text = source('projects', 'projects.service.ts');

    expect(text).toContain('AUDIT_ACTIONS.PROJECT_CREATED');
    expect(text).toContain('AUDIT_ACTIONS.PROJECT_UPDATED');
    expect(text).toContain('AUDIT_ACTIONS.PROJECT_ALLOCATION_DELETED');
    expect(text).not.toContain("action: 'project.create'");
    expect(text).not.toContain("action: 'project.update'");
    expect(text).not.toContain("action: 'project-allocation.delete'");
  });

  it('auth.service.ts writes canonical actions, not the dotted literals', () => {
    const text = source('auth', 'auth.service.ts');

    expect(text).toContain('AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED');
    expect(text).toContain('AUDIT_ACTIONS.AUTH_LOGIN_FAILED');
    expect(text).not.toContain("action: 'auth.login.succeeded'");
    expect(text).not.toContain("action: 'auth.login.failed'");
  });

  it('every legacy alias target used by these call sites is declared in AUDIT_ACTIONS', () => {
    const declared = new Set<string>(Object.values(AUDIT_ACTIONS));

    for (const canonical of Object.values(LEGACY_AUDIT_ACTION_ALIASES)) {
      expect(declared.has(canonical)).toBe(true);
    }
  });
});
