import { isErrorCode } from './app-error';
import { getErrorCatalogEntry } from './error-catalog';

/**
 * TASK-0032 added error codes for MFA (ADR-0019), platform authorization
 * (ADR-0018), agreements (ADR-0020) and the platform audit trail. The
 * exception filter only passes a thrown `code` through when the catalog knows
 * it; any other code is replaced with a status-derived generic one. Found in
 * browser QA: MFA's "encryption key not configured" refusal reached the admin
 * error dialog as `SYSTEM_UNEXPECTED_ERROR`, and a client could not tell an
 * expired sign-in challenge from a wrong code.
 *
 * Each code below is thrown somewhere in `services/api/src`; this pins that it
 * keeps its own catalog entry with the status its throw site uses.
 */
const TASK_0032_CODES: Array<[code: string, status: number]> = [
  ['ADMIN_AUTH_INVALID_CREDENTIALS', 401],
  ['AUTH_MFA_CHALLENGE_INVALID', 401],
  ['AUTH_MFA_CODE_INVALID', 401],
  ['MFA_CODE_INVALID', 400],
  ['MFA_ALREADY_ENABLED', 409],
  ['MFA_NOT_ENABLED', 400],
  ['MFA_SETUP_NOT_STARTED', 400],
  ['MFA_SETUP_SUPERSEDED', 409],
  ['MFA_FACTOR_REQUIRED', 400],
  ['MFA_RESET_SELF', 400],
  ['MFA_ENCRYPTION_UNAVAILABLE', 503],
  ['CURRENT_PASSWORD_INVALID', 400],
  ['ACCOUNT_NOT_FOUND', 404],
  ['PLATFORM_PERMISSION_DENIED', 403],
  ['PLATFORM_MONITORING_PERMISSION_REQUIRED', 403],
  ['PLATFORM_ROLE_NOT_ASSIGNABLE', 400],
  ['PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT', 400],
  ['TENANT_STATUS_REQUIRES_LIFECYCLE_ACTION', 400],
  ['CONTRACT_TEMPLATE_PLACEHOLDER_OUT_OF_CONTEXT', 400],
  ['CONTRACT_PLACEHOLDER_UNRESOLVABLE_CONTEXT', 400],
  ['CONTRACT_DUPLICATE_AGREEMENT', 409],
];

describe('TASK-0032 error codes are catalogued', () => {
  it.each(TASK_0032_CODES)('%s keeps its own entry (%i)', (code, status) => {
    expect(isErrorCode(code)).toBe(true);
    const entry = getErrorCatalogEntry(code);
    expect(entry.statusCode).toBe(status);
    expect(entry.message).not.toBe('Unexpected error');
  });
});
