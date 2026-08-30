export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export type ErrorCategory =
  | 'auth'
  | 'session'
  | 'access'
  | 'rbac'
  | 'tenant'
  | 'organization'
  | 'business-unit'
  | 'user'
  | 'employee'
  | 'attendance'
  | 'validation'
  | 'database'
  | 'file'
  | 'notification'
  | 'integration'
  | 'agent'
  | 'payroll'
  | 'settings'
  | 'network'
  | 'system';

export type ErrorCatalogEntry = {
  statusCode: number;
  message: string;
  description: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  userAction?: string;
  retryable: boolean;
};

export const ERROR_CATALOG = {
  AUTH_INVALID_CREDENTIALS: entry(
    401,
    'Invalid credentials',
    'The email or password you entered is not correct.',
    'warning',
    'auth',
  ),
  AUTH_PASSWORD_EXPIRED: entry(
    401,
    'Password expired',
    'Your password has expired. Reset it to sign in again.',
    'warning',
    'auth',
  ),
  AUTH_ACCOUNT_DISABLED: entry(
    403,
    'Account disabled',
    'This account has been disabled. Contact your administrator.',
    'warning',
    'auth',
  ),
  AUTH_ACCOUNT_LOCKED: entry(
    423,
    'Account locked',
    'This account is temporarily locked after too many failed attempts.',
    'warning',
    'auth',
  ),
  AUTH_TOKEN_MISSING: entry(
    401,
    'Authentication required',
    'Access token is required to continue.',
    'warning',
    'auth',
    'Sign in again.',
  ),
  AUTH_TOKEN_INVALID: entry(
    401,
    'Session expired',
    'Your session has expired. Please sign in again.',
    'warning',
    'auth',
    'Sign in again.',
  ),
  AUTH_REFRESH_TOKEN_INVALID: entry(
    401,
    'Session expired',
    'Your session has expired. Please sign in again.',
    'warning',
    'auth',
    'Sign in again.',
  ),
  AUTH_UNAUTHORIZED: entry(
    401,
    'Authentication required',
    'You must be signed in to perform this action.',
    'warning',
    'auth',
    'Sign in again.',
  ),
  SESSION_EXPIRED: entry(
    401,
    'Session expired',
    'Your session has expired. Please sign in again.',
    'warning',
    'session',
    'Sign in again.',
  ),
  SESSION_REVOKED: entry(
    401,
    'Session ended',
    'This session is no longer active. Please sign in again.',
    'warning',
    'session',
    'Sign in again.',
  ),
  SESSION_CONFLICT: entry(
    409,
    'Session conflict',
    'This session conflicts with another active session.',
    'warning',
    'session',
  ),
  SESSION_INVALID_CONTEXT: entry(
    401,
    'Invalid session context',
    'The current session context could not be verified.',
    'warning',
    'session',
  ),
  ACCESS_DENIED: entry(
    403,
    'Access denied',
    'You do not have permission to perform this action.',
    'warning',
    'access',
  ),
  RBAC_PERMISSION_MISSING: entry(
    403,
    'Permission missing',
    'Your role does not include the permission required for this action.',
    'warning',
    'rbac',
  ),
  RBAC_ROLE_MISSING: entry(
    403,
    'Role missing',
    'Your account does not include the role required for this action.',
    'warning',
    'rbac',
  ),
  RBAC_SCOPE_VIOLATION: entry(
    403,
    'Scope violation',
    'This record is outside your permitted access scope.',
    'warning',
    'rbac',
  ),
  PERMISSION_ASSIGNMENT_FAILED: entry(
    400,
    'Permission assignment failed',
    'The permission assignment could not be saved.',
    'error',
    'rbac',
  ),
  TENANT_CONTEXT_MISSING: entry(
    400,
    'Tenant context missing',
    'The request did not include a valid tenant context.',
    'warning',
    'tenant',
  ),
  TENANT_NOT_FOUND: entry(
    404,
    'Tenant not found',
    'The requested tenant could not be found.',
    'warning',
    'tenant',
  ),
  TENANT_INACTIVE: entry(
    403,
    'Tenant inactive',
    'This tenant is not active.',
    'warning',
    'tenant',
  ),
  TENANT_SLUG_INVALID: entry(
    400,
    'Invalid tenant slug',
    'The tenant slug format is not valid.',
    'warning',
    'tenant',
  ),
  TENANT_SLUG_ALREADY_EXISTS: entry(
    409,
    'Tenant slug already exists',
    'Another tenant is already using this slug.',
    'warning',
    'tenant',
  ),
  TENANT_ACCESS_DENIED: entry(
    403,
    'Tenant access denied',
    'You do not have access to this tenant.',
    'warning',
    'tenant',
  ),
  /*
   * Distinct from ACCESS_DENIED on purpose (BUG-1952). A commercial boundary and
   * an authorization boundary produce the same 403 status, and a client that
   * cannot tell them apart shows "you do not have permission" to a tenant
   * administrator who holds every permission there is — which reads as a
   * permissions bug and gets reported as one. The code carries the difference,
   * and each frontend maps it to its own copy.
   */
  TENANT_FEATURE_NOT_ENTITLED: entry(
    403,
    'Not included in your plan',
    'This module is not part of your current subscription plan.',
    'warning',
    'tenant',
    'Ask your administrator to upgrade the subscription plan to use it.',
  ),
  /*
   * 503 and retryable, not 403. When the platform cannot resolve what a tenant
   * bought, the honest statement is "we could not check", not "you did not buy
   * this" — and only one of those is something a customer can act on. The
   * resolver reaches this only on a cold cache; a tenant that resolved a moment
   * ago keeps its last answer instead of being refused.
   */
  TENANT_ENTITLEMENT_UNAVAILABLE: entry(
    503,
    'Plan check unavailable',
    'Your subscription entitlements could not be verified just now.',
    'error',
    'tenant',
    'Try again in a moment.',
    true,
  ),
  ORGANIZATION_NOT_FOUND: entry(
    404,
    'Organization not found',
    'The requested organization could not be found.',
    'warning',
    'organization',
  ),
  ORGANIZATION_ACCESS_DENIED: entry(
    403,
    'Organization access denied',
    'You do not have access to this organization.',
    'warning',
    'organization',
  ),
  BUSINESS_UNIT_NOT_FOUND: entry(
    404,
    'Business unit not found',
    'The requested business unit could not be found.',
    'warning',
    'business-unit',
  ),
  BUSINESS_UNIT_ACCESS_DENIED: entry(
    403,
    'Business unit access denied',
    'You do not have access to this business unit.',
    'warning',
    'business-unit',
  ),
  BUSINESS_UNIT_SCOPE_VIOLATION: entry(
    403,
    'Business unit scope violation',
    'This record is outside your permitted business unit scope.',
    'warning',
    'business-unit',
  ),
  USER_NOT_FOUND: entry(
    404,
    'User not found',
    'The requested user could not be found.',
    'warning',
    'user',
  ),
  USER_ALREADY_EXISTS: entry(
    409,
    'User already exists',
    'A user with these details already exists.',
    'warning',
    'user',
  ),
  USER_INVITATION_INVALID: entry(
    400,
    'Invalid invitation',
    'This user invitation is invalid or can no longer be used.',
    'warning',
    'user',
  ),
  USER_ACTIVATION_EXPIRED: entry(
    410,
    'Activation expired',
    'The account activation link has expired.',
    'warning',
    'user',
  ),
  EMPLOYEE_NOT_FOUND: entry(
    404,
    'Employee not found',
    'The requested employee record could not be found.',
    'warning',
    'employee',
  ),
  EMPLOYEE_ACCESS_DENIED: entry(
    403,
    'Access denied',
    'You do not have permission to view this employee record.',
    'warning',
    'employee',
  ),
  EMPLOYEE_DUPLICATE_CODE: entry(
    409,
    'Duplicate employee code',
    'Another employee already uses this employee code.',
    'warning',
    'employee',
  ),
  EMPLOYEE_CREATE_FAILED: entry(
    400,
    'Employee create failed',
    'The employee record could not be created.',
    'error',
    'employee',
  ),
  EMPLOYEE_UPDATE_FAILED: entry(
    400,
    'Employee update failed',
    'The employee record could not be updated.',
    'error',
    'employee',
  ),
  EMPLOYEE_DELETE_FAILED: entry(
    400,
    'Employee delete failed',
    'The employee record could not be deleted.',
    'error',
    'employee',
  ),
  VALIDATION_FAILED: entry(
    400,
    'Validation failed',
    'Review the highlighted fields and submit again.',
    'warning',
    'validation',
  ),
  VALIDATION_REQUIRED_FIELD: entry(
    400,
    'Required field missing',
    'A required field is missing.',
    'warning',
    'validation',
  ),
  VALIDATION_INVALID_FORMAT: entry(
    400,
    'Invalid format',
    'One or more fields use an invalid format.',
    'warning',
    'validation',
  ),
  VALIDATION_DUPLICATE_VALUE: entry(
    409,
    'Duplicate value',
    'A record with this value already exists.',
    'warning',
    'validation',
  ),
  DATABASE_OPERATION_FAILED: entry(
    500,
    'Database operation failed',
    'The database operation could not be completed.',
    'error',
    'database',
    'Try again later.',
    true,
  ),
  DATABASE_RECORD_NOT_FOUND: entry(
    404,
    'Record not found',
    'The requested record could not be found.',
    'warning',
    'database',
  ),
  DATABASE_DUPLICATE_RECORD: entry(
    409,
    'Duplicate record',
    'A record with the same unique value already exists.',
    'warning',
    'database',
  ),
  DATABASE_CONSTRAINT_FAILED: entry(
    409,
    'Database constraint failed',
    'The change conflicts with existing related data.',
    'warning',
    'database',
  ),
  DATABASE_CONNECTION_FAILED: entry(
    503,
    'Database unavailable',
    'The database connection is currently unavailable.',
    'critical',
    'database',
    'Try again later.',
    true,
  ),
  DATABASE_TIMEOUT: entry(
    504,
    'Database timeout',
    'The database took too long to respond.',
    'error',
    'database',
    'Try again.',
    true,
  ),
  PRISMA_KNOWN_REQUEST_ERROR: entry(
    500,
    'Database request failed',
    'The database request could not be completed.',
    'error',
    'database',
  ),
  PRISMA_VALIDATION_ERROR: entry(
    400,
    'Database validation failed',
    'The database request contains invalid data.',
    'warning',
    'database',
  ),
  PRISMA_CONNECTION_ERROR: entry(
    503,
    'Database unavailable',
    'The database connection is currently unavailable.',
    'critical',
    'database',
    'Try again later.',
    true,
  ),
  EMAIL_SEND_FAILED: entry(
    502,
    'Email send failed',
    'The email provider could not send this message.',
    'error',
    'notification',
    'Try again later.',
    true,
  ),
  EMAIL_TEMPLATE_MISSING: entry(
    500,
    'Email template missing',
    'The required email template is not configured.',
    'error',
    'notification',
  ),
  NOTIFICATION_SEND_FAILED: entry(
    502,
    'Notification failed',
    'The notification could not be sent.',
    'error',
    'notification',
    'Try again later.',
    true,
  ),
  FILE_UPLOAD_FAILED: entry(
    400,
    'File upload failed',
    'The file could not be uploaded.',
    'error',
    'file',
  ),
  FILE_DOWNLOAD_FAILED: entry(
    404,
    'File download failed',
    'The file could not be downloaded.',
    'error',
    'file',
  ),
  FILE_TOO_LARGE: entry(
    413,
    'File too large',
    'The selected file exceeds the allowed size.',
    'warning',
    'file',
  ),
  FILE_UNSUPPORTED_TYPE: entry(
    415,
    'Unsupported file type',
    'This file type is not supported.',
    'warning',
    'file',
  ),
  INTEGRATION_FAILED: entry(
    502,
    'Integration failed',
    'The external integration request failed.',
    'error',
    'integration',
    'Try again later.',
    true,
  ),
  INTEGRATION_TIMEOUT: entry(
    504,
    'Integration timeout',
    'The external integration took too long to respond.',
    'error',
    'integration',
    'Try again.',
    true,
  ),
  INTEGRATION_UNAVAILABLE: entry(
    503,
    'Integration unavailable',
    'The external integration is currently unavailable.',
    'error',
    'integration',
    'Try again later.',
    true,
  ),
  /*
   * A provider callback that arrived before the record it is about exists.
   *
   * Distinct from `VALIDATION_FAILED`, which is what every 400 renders as and
   * which asserts the caller sent something malformed. Stripe's subscription
   * and invoice callbacks for a public self-service signup can beat tenant
   * provisioning to the database by a second or two, and answering those with
   * a 400 said the payload was invalid and raised the critical "a customer may
   * have paid without us knowing" alert on a payment that had in fact
   * succeeded (BUG-1543).
   *
   * `info` severity and `retryable`, because the provider redelivering it a
   * minute later is the resolution, not an escalation. The status is a 409
   * rather than a 2xx on purpose: the delivery genuinely has not been
   * processed, and Stripe's redelivery is what eventually writes the invoice
   * and payment rows.
   */
  INTEGRATION_EVENT_NOT_READY: entry(
    409,
    'Integration event arrived early',
    'The record this provider event refers to does not exist yet.',
    'info',
    'integration',
    'No action needed — the provider will deliver it again.',
    true,
  ),
  AGENT_HEARTBEAT_FAILED: entry(
    502,
    'Agent heartbeat failed',
    'The desktop agent heartbeat could not be processed.',
    'error',
    'agent',
    'Try again later.',
    true,
  ),
  AGENT_SESSION_INVALID: entry(
    401,
    'Agent session invalid',
    'The desktop agent session is invalid.',
    'warning',
    'agent',
  ),
  AGENT_DEVICE_NOT_REGISTERED: entry(
    403,
    'Device not registered',
    'This device is not registered for agent access.',
    'warning',
    'agent',
  ),
  PAYROLL_PROCESSING_FAILED: entry(
    500,
    'Payroll processing failed',
    'Payroll processing could not be completed.',
    'error',
    'payroll',
  ),
  TIMESHEET_SUBMISSION_FAILED: entry(
    400,
    'Timesheet submission failed',
    'The timesheet could not be submitted.',
    'error',
    'payroll',
  ),
  LEAVE_REQUEST_FAILED: entry(
    400,
    'Leave request failed',
    'The leave request could not be processed.',
    'error',
    'payroll',
  ),
  POLICY_RESOLUTION_FAILED: entry(
    500,
    'Policy resolution failed',
    'The applicable policy could not be resolved.',
    'error',
    'payroll',
  ),
  SETTINGS_KEY_UNSUPPORTED: entry(
    400,
    'Unsupported setting',
    'This setting key is not supported.',
    'warning',
    'settings',
  ),
  SETTINGS_SAVE_FAILED: entry(
    400,
    'Settings save failed',
    'The settings could not be saved.',
    'error',
    'settings',
  ),
  CONFIGURATION_MISSING: entry(
    500,
    'Configuration missing',
    'Required system configuration is missing.',
    'critical',
    'settings',
  ),
  RATE_LIMIT_EXCEEDED: entry(
    429,
    'Rate limit exceeded',
    'Too many requests were sent in a short time.',
    'warning',
    'network',
    'Wait and try again.',
    true,
  ),
  NETWORK_ERROR: entry(
    503,
    'Network error',
    'The system could not reach a required network service.',
    'error',
    'network',
    'Try again later.',
    true,
  ),
  SYSTEM_UNEXPECTED_ERROR: entry(
    500,
    'Unexpected error',
    'An unexpected system error occurred.',
    'error',
    'system',
    'Try again later.',
    true,
  ),
  SYSTEM_MAINTENANCE: entry(
    503,
    'System maintenance',
    'The system is temporarily unavailable for maintenance.',
    'info',
    'system',
    'Try again later.',
    true,
  ),
  SYSTEM_CONFIGURATION_ERROR: entry(
    500,
    'System configuration error',
    'The system configuration is invalid or incomplete.',
    'critical',
    'system',
  ),

  // --- application release publishing --------------------------------------
  //
  // Publishing is machine-to-machine: the caller is a developer CLI or a CI
  // job, never a person filling in a form. The descriptions are therefore
  // written for whoever reads a failed pipeline log, and each one says what to
  // do next rather than only what went wrong.
  RELEASE_PUBLISH_UNAUTHORIZED: entry(
    401,
    'Release publishing not authorised',
    'The release publishing credential is missing, malformed or does not match this environment.',
    'warning',
    'auth',
    'Set DIJIPEOPLE_RELEASE_TOKEN to the value configured on the target environment.',
  ),
  RELEASE_ENVIRONMENT_MISMATCH: entry(
    400,
    'Release environment mismatch',
    'The environment named by the publisher does not match the environment this API is running as.',
    'error',
    'validation',
    'Re-run with --environment set to the environment the target API actually runs as.',
  ),
  RELEASE_ARTIFACT_INVALID: entry(
    400,
    'Release artefact invalid',
    'The uploaded artefact is missing, empty, too large, or did not match the checksum the publisher calculated.',
    'error',
    'file',
    'Rebuild the package and publish again.',
  ),
  RELEASE_METADATA_INVALID: entry(
    400,
    'Release metadata invalid',
    'The release descriptor names an unknown application, channel, platform, architecture or version.',
    'error',
    'validation',
  ),
  RELEASE_VERSION_CONFLICT: entry(
    409,
    'Release already published with different content',
    'A release already exists for this application, version, platform, architecture and channel, and its artefact differs from the one being published.',
    'error',
    'validation',
    'Publish a new version. A released version is immutable and is never replaced in place.',
  ),
  RELEASE_REGISTRATION_FAILED: entry(
    500,
    'Release registration failed',
    'The artefact was uploaded but the release record could not be created.',
    'critical',
    'system',
    'Check the compensation details in the response before publishing again.',
    true,
  ),
  RELEASE_VERIFICATION_FAILED: entry(
    500,
    'Release verification failed',
    'The release record was created but reading it back did not return the expected artefact.',
    'critical',
    'system',
    'Do not announce this release. Disable it and investigate before republishing.',
  ),
  RELEASE_SOURCE_NOT_FOUND: entry(
    404,
    'Release not found',
    'No published release matches the application, version, platform, architecture and channel given.',
    'error',
    'validation',
  ),
  LEGAL_VERSION_NOT_FOUND: entry(
    404,
    'Legal document version not found',
    'No legal document version matches that identifier.',
    'error',
    'validation',
  ),
  LEGAL_VERSION_IMMUTABLE: entry(
    409,
    'Published legal versions cannot be edited',
    'This version has been published and is the evidence behind every acknowledgement that names it. Publish a new version instead of changing this one.',
    'warning',
    'validation',
    'Create a new draft version and publish that.',
  ),
  LEGAL_VERSION_NOT_DRAFT: entry(
    409,
    'That version is not a draft',
    'Only a draft version can be published.',
    'warning',
    'validation',
  ),
  LEGAL_VERSION_HAS_PLACEHOLDERS: entry(
    409,
    'That version still has unfilled blanks',
    'Fill every {{PLACEHOLDER}} before publishing. The contracting party — legal entity name, registration number, registered office, tax number and jurisdiction — is left blank deliberately until it is known, and a published document must never show one.',
    'warning',
    'validation',
  ),
  // --- self-service attendance refusals ------------------------------------
  /*
   * BUG-2332. These are reason codes `AttendanceWebAttendanceService` and
   * `AttendanceGeofenceService` already emit, and which `attendance.service.ts`
   * already puts on the wire as `{ code, errorCode }` — but none of them
   * existed here, so `HttpExceptionFilter.mapLegacyCode` failed `isErrorCode`
   * and fell through to its `statusCode === 422 → VALIDATION_FAILED` default.
   * Every attendance refusal reached the browser as VALIDATION_FAILED.
   *
   * The consequence was not cosmetic. `classifyAttendanceFailure` in
   * apps/web/lib/attendance/attendance-outcome.ts routes on exactly these
   * codes, and an unrecognised code deliberately falls through to `unexpected`,
   * which raises the platform's technical error dialog. So an employee refused
   * for an ordinary policy reason — "your work arrangement is on-site only" —
   * was shown "ERROR VALIDATION_FAILED", a reference id and a "Download log"
   * button. That is precisely the defect the header comment on
   * attendance-outcome.ts says it exists to prevent: the classifier was right,
   * and was never reached, because the code it switches on had been erased one
   * layer below it.
   *
   * The messages here are fallbacks only. The filter prefers the thrown
   * payload's own message, which names the employee's work site and distance
   * and is far more specific than anything a static catalog can say.
   */
  WORK_SITE_REQUIRES_DEVICE: entry(
    422,
    'Use an attendance device at this work site',
    'Attendance at this work site must be recorded on an attendance device.',
    'warning',
    'attendance',
    'Use the attendance machine at your work site.',
  ),
  WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE: entry(
    422,
    'Use an attendance device at this work site',
    'Attendance here is normally recorded on a device, but you may request web attendance instead.',
    'warning',
    'attendance',
    'Use the attendance machine, or submit a web attendance request.',
  ),
  WORK_SITE_ATTENDANCE_DISABLED: entry(
    422,
    'This work site is not accepting attendance',
    'Attendance recording is switched off for this work site.',
    'warning',
    'attendance',
    'Contact your HR administrator.',
  ),
  WORK_MODE_DISALLOWS_REMOTE: entry(
    422,
    'Remote check-in is not available for you',
    'Your work arrangement is on-site only, so attendance cannot be recorded away from a work site.',
    'warning',
    'attendance',
    'Check in at your work site, or ask your manager to record this attendance.',
  ),
  WORK_MODE_DISALLOWS_OFFICE: entry(
    422,
    'Office check-in is not available for you',
    'Your work arrangement does not include attendance from this work site.',
    'warning',
    'attendance',
    'Check in from your usual place of work.',
  ),
  WEB_ATTENDANCE_DISABLED: entry(
    422,
    'Web attendance is switched off',
    'This organisation does not accept attendance from the web app.',
    'warning',
    'attendance',
    'Use an attendance device, or ask your manager to record this attendance.',
  ),
  REMOTE_REQUIRES_APPROVAL: entry(
    422,
    'Remote attendance needs approval',
    'Remote attendance must be approved before it can be recorded.',
    'warning',
    'attendance',
    'Submit a request for your manager to review.',
  ),
  METHOD_NOT_ALLOWED: entry(
    422,
    'This attendance method is not available here',
    'This work site does not accept attendance recorded this way.',
    'warning',
    'attendance',
    'Use a method this work site accepts.',
  ),
  UNAUTHORIZED_WORK_SITE: entry(
    422,
    'You are not assigned to this work site',
    'Attendance can only be recorded at a work site you are assigned to.',
    'warning',
    'attendance',
    'Contact your HR administrator if this is wrong.',
  ),
  ACCURACY_TOO_LOW: entry(
    422,
    'Your location could not be verified accurately enough',
    'The position your device reported is less precise than this work site requires.',
    'warning',
    'attendance',
    'Turn on Precise Location or move somewhere with a better signal, then try again.',
    true,
  ),
  COORDINATES_INVALID: entry(
    422,
    'The reported location could not be read',
    'The coordinates the device sent are not a usable position.',
    'warning',
    'attendance',
    'Check that location services are enabled and try again.',
    true,
  ),
  LOCATION_UNUSABLE: entry(
    422,
    'Your location could not be used',
    'The position captured for this attempt cannot be matched to a work site.',
    'warning',
    'attendance',
    'Check that location services are enabled and try again.',
    true,
  ),
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function getErrorCatalogEntry(code: string): ErrorCatalogEntry {
  return (
    ERROR_CATALOG[code as ErrorCode] ?? ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR
  );
}

function entry(
  statusCode: number,
  message: string,
  description: string,
  severity: ErrorSeverity,
  category: ErrorCategory,
  userAction?: string,
  retryable = false,
): ErrorCatalogEntry {
  return {
    statusCode,
    message,
    description,
    severity,
    category,
    userAction,
    retryable,
  };
}
