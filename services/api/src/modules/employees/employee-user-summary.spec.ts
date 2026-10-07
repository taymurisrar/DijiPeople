import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  EMPLOYEE_USER_SELECT,
  toEmployeeUserSummary,
} from './employee-user-summary';

/**
 * BUG-3883 — an employee response carried the linked User row whole: password
 * hash, MFA secrets, and a BigInt that made MFA-enrolled profiles return 500.
 */

/** Columns of User that must never be loaded for, or returned with, an employee. */
const SECRET_USER_COLUMNS = [
  'passwordHash',
  'mfaSecretEncrypted',
  'mfaPendingSecretEncrypted',
  'mfaLastUsedStep',
  'passwordHistory',
  'mfaRecoveryCodes',
];

/** Source with line endings normalised and comments removed — CRLF locally, LF on CI. */
function codeOnly(path: string) {
  return readFileSync(path, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('BUG-3883 — employee responses never carry login secrets', () => {
  it('selects no secret User column', () => {
    const selected = Object.keys(EMPLOYEE_USER_SELECT);
    expect(selected).toContain('email');
    expect(selected.filter((key) => SECRET_USER_COLUMNS.includes(key))).toEqual(
      [],
    );
  });

  it('returns only the summary fields, even from a full User row', () => {
    const fullRow = {
      id: 'u1',
      tenantId: 't1',
      email: 'a@example.test',
      firstName: 'A',
      lastName: 'B',
      status: 'ACTIVE',
      lastLoginAt: null,
      businessUnitId: null,
      passwordHash: 'hash',
      mfaSecretEncrypted: 'secret',
      mfaPendingSecretEncrypted: 'pending',
      mfaLastUsedStep: BigInt(59_000_000),
      userRoles: [{ role: { id: 'r1', key: 'hr', name: 'HR' } }],
    };

    const summary = toEmployeeUserSummary(fullRow);

    expect(summary).toEqual({
      id: 'u1',
      email: 'a@example.test',
      lastLoginAt: null,
      firstName: 'A',
      lastName: 'B',
      status: 'ACTIVE',
      roles: [{ id: 'r1', key: 'hr', name: 'HR' }],
    });
    // The original symptom: a BigInt anywhere in the body throws here.
    expect(() => JSON.stringify(summary)).not.toThrow();
  });

  it('loads the employee user relation through the safe select', () => {
    const repository = codeOnly(join(__dirname, 'employees.repository.ts'));
    expect(repository).toMatch(
      /user:\s*\{\s*select:\s*EMPLOYEE_USER_SELECT,\s*\}/,
    );
  });

  it('never passes a raw employee.user through to a response', () => {
    const offenders = readdirSync(__dirname)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) =>
        /\buser:\s*employee\.user\b(?!\s*\?\s*\{)/.test(
          codeOnly(join(__dirname, file)),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
