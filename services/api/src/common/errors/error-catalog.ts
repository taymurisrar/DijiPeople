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
  AUTH_INVALID_CREDENTIALS: entry(401, 'Invalid credentials', 'The email or password you entered is not correct.', 'warning', 'auth'),
  AUTH_ACCOUNT_DISABLED: entry(403, 'Account disabled', 'This account has been disabled. Contact your administrator.', 'warning', 'auth'),
  AUTH_ACCOUNT_LOCKED: entry(423, 'Account locked', 'This account is temporarily locked after too many failed attempts.', 'warning', 'auth'),
  AUTH_TOKEN_MISSING: entry(401, 'Authentication required', 'Access token is required to continue.', 'warning', 'auth', 'Sign in again.'),
  AUTH_TOKEN_INVALID: entry(401, 'Session expired', 'Your session has expired. Please sign in again.', 'warning', 'auth', 'Sign in again.'),
  AUTH_REFRESH_TOKEN_INVALID: entry(401, 'Session expired', 'Your session has expired. Please sign in again.', 'warning', 'auth', 'Sign in again.'),
  AUTH_UNAUTHORIZED: entry(401, 'Authentication required', 'You must be signed in to perform this action.', 'warning', 'auth', 'Sign in again.'),
  SESSION_EXPIRED: entry(401, 'Session expired', 'Your session has expired. Please sign in again.', 'warning', 'session', 'Sign in again.'),
  SESSION_REVOKED: entry(401, 'Session ended', 'This session is no longer active. Please sign in again.', 'warning', 'session', 'Sign in again.'),
  SESSION_CONFLICT: entry(409, 'Session conflict', 'This session conflicts with another active session.', 'warning', 'session'),
  SESSION_INVALID_CONTEXT: entry(401, 'Invalid session context', 'The current session context could not be verified.', 'warning', 'session'),
  ACCESS_DENIED: entry(403, 'Access denied', 'You do not have permission to perform this action.', 'warning', 'access'),
  RBAC_PERMISSION_MISSING: entry(403, 'Permission missing', 'Your role does not include the permission required for this action.', 'warning', 'rbac'),
  RBAC_ROLE_MISSING: entry(403, 'Role missing', 'Your account does not include the role required for this action.', 'warning', 'rbac'),
  RBAC_SCOPE_VIOLATION: entry(403, 'Scope violation', 'This record is outside your permitted access scope.', 'warning', 'rbac'),
  PERMISSION_ASSIGNMENT_FAILED: entry(400, 'Permission assignment failed', 'The permission assignment could not be saved.', 'error', 'rbac'),
  TENANT_CONTEXT_MISSING: entry(400, 'Tenant context missing', 'The request did not include a valid tenant context.', 'warning', 'tenant'),
  TENANT_NOT_FOUND: entry(404, 'Tenant not found', 'The requested tenant could not be found.', 'warning', 'tenant'),
  TENANT_INACTIVE: entry(403, 'Tenant inactive', 'This tenant is not active.', 'warning', 'tenant'),
  TENANT_SLUG_INVALID: entry(400, 'Invalid tenant slug', 'The tenant slug format is not valid.', 'warning', 'tenant'),
  TENANT_SLUG_ALREADY_EXISTS: entry(409, 'Tenant slug already exists', 'Another tenant is already using this slug.', 'warning', 'tenant'),
  TENANT_ACCESS_DENIED: entry(403, 'Tenant access denied', 'You do not have access to this tenant.', 'warning', 'tenant'),
  ORGANIZATION_NOT_FOUND: entry(404, 'Organization not found', 'The requested organization could not be found.', 'warning', 'organization'),
  ORGANIZATION_ACCESS_DENIED: entry(403, 'Organization access denied', 'You do not have access to this organization.', 'warning', 'organization'),
  BUSINESS_UNIT_NOT_FOUND: entry(404, 'Business unit not found', 'The requested business unit could not be found.', 'warning', 'business-unit'),
  BUSINESS_UNIT_ACCESS_DENIED: entry(403, 'Business unit access denied', 'You do not have access to this business unit.', 'warning', 'business-unit'),
  BUSINESS_UNIT_SCOPE_VIOLATION: entry(403, 'Business unit scope violation', 'This record is outside your permitted business unit scope.', 'warning', 'business-unit'),
  USER_NOT_FOUND: entry(404, 'User not found', 'The requested user could not be found.', 'warning', 'user'),
  USER_ALREADY_EXISTS: entry(409, 'User already exists', 'A user with these details already exists.', 'warning', 'user'),
  USER_INVITATION_INVALID: entry(400, 'Invalid invitation', 'This user invitation is invalid or can no longer be used.', 'warning', 'user'),
  USER_ACTIVATION_EXPIRED: entry(410, 'Activation expired', 'The account activation link has expired.', 'warning', 'user'),
  EMPLOYEE_NOT_FOUND: entry(404, 'Employee not found', 'The requested employee record could not be found.', 'warning', 'employee'),
  EMPLOYEE_ACCESS_DENIED: entry(403, 'Access denied', 'You do not have permission to view this employee record.', 'warning', 'employee'),
  EMPLOYEE_DUPLICATE_CODE: entry(409, 'Duplicate employee code', 'Another employee already uses this employee code.', 'warning', 'employee'),
  EMPLOYEE_CREATE_FAILED: entry(400, 'Employee create failed', 'The employee record could not be created.', 'error', 'employee'),
  EMPLOYEE_UPDATE_FAILED: entry(400, 'Employee update failed', 'The employee record could not be updated.', 'error', 'employee'),
  EMPLOYEE_DELETE_FAILED: entry(400, 'Employee delete failed', 'The employee record could not be deleted.', 'error', 'employee'),
  VALIDATION_FAILED: entry(400, 'Validation failed', 'Review the highlighted fields and submit again.', 'warning', 'validation'),
  VALIDATION_REQUIRED_FIELD: entry(400, 'Required field missing', 'A required field is missing.', 'warning', 'validation'),
  VALIDATION_INVALID_FORMAT: entry(400, 'Invalid format', 'One or more fields use an invalid format.', 'warning', 'validation'),
  VALIDATION_DUPLICATE_VALUE: entry(409, 'Duplicate value', 'A record with this value already exists.', 'warning', 'validation'),
  DATABASE_OPERATION_FAILED: entry(500, 'Database operation failed', 'The database operation could not be completed.', 'error', 'database', 'Try again later.', true),
  DATABASE_RECORD_NOT_FOUND: entry(404, 'Record not found', 'The requested record could not be found.', 'warning', 'database'),
  DATABASE_DUPLICATE_RECORD: entry(409, 'Duplicate record', 'A record with the same unique value already exists.', 'warning', 'database'),
  DATABASE_CONSTRAINT_FAILED: entry(409, 'Database constraint failed', 'The change conflicts with existing related data.', 'warning', 'database'),
  DATABASE_CONNECTION_FAILED: entry(503, 'Database unavailable', 'The database connection is currently unavailable.', 'critical', 'database', 'Try again later.', true),
  DATABASE_TIMEOUT: entry(504, 'Database timeout', 'The database took too long to respond.', 'error', 'database', 'Try again.', true),
  PRISMA_KNOWN_REQUEST_ERROR: entry(500, 'Database request failed', 'The database request could not be completed.', 'error', 'database'),
  PRISMA_VALIDATION_ERROR: entry(400, 'Database validation failed', 'The database request contains invalid data.', 'warning', 'database'),
  PRISMA_CONNECTION_ERROR: entry(503, 'Database unavailable', 'The database connection is currently unavailable.', 'critical', 'database', 'Try again later.', true),
  EMAIL_SEND_FAILED: entry(502, 'Email send failed', 'The email provider could not send this message.', 'error', 'notification', 'Try again later.', true),
  EMAIL_TEMPLATE_MISSING: entry(500, 'Email template missing', 'The required email template is not configured.', 'error', 'notification'),
  NOTIFICATION_SEND_FAILED: entry(502, 'Notification failed', 'The notification could not be sent.', 'error', 'notification', 'Try again later.', true),
  FILE_UPLOAD_FAILED: entry(400, 'File upload failed', 'The file could not be uploaded.', 'error', 'file'),
  FILE_DOWNLOAD_FAILED: entry(404, 'File download failed', 'The file could not be downloaded.', 'error', 'file'),
  FILE_TOO_LARGE: entry(413, 'File too large', 'The selected file exceeds the allowed size.', 'warning', 'file'),
  FILE_UNSUPPORTED_TYPE: entry(415, 'Unsupported file type', 'This file type is not supported.', 'warning', 'file'),
  INTEGRATION_FAILED: entry(502, 'Integration failed', 'The external integration request failed.', 'error', 'integration', 'Try again later.', true),
  INTEGRATION_TIMEOUT: entry(504, 'Integration timeout', 'The external integration took too long to respond.', 'error', 'integration', 'Try again.', true),
  INTEGRATION_UNAVAILABLE: entry(503, 'Integration unavailable', 'The external integration is currently unavailable.', 'error', 'integration', 'Try again later.', true),
  AGENT_HEARTBEAT_FAILED: entry(502, 'Agent heartbeat failed', 'The desktop agent heartbeat could not be processed.', 'error', 'agent', 'Try again later.', true),
  AGENT_SESSION_INVALID: entry(401, 'Agent session invalid', 'The desktop agent session is invalid.', 'warning', 'agent'),
  AGENT_DEVICE_NOT_REGISTERED: entry(403, 'Device not registered', 'This device is not registered for agent access.', 'warning', 'agent'),
  PAYROLL_PROCESSING_FAILED: entry(500, 'Payroll processing failed', 'Payroll processing could not be completed.', 'error', 'payroll'),
  TIMESHEET_SUBMISSION_FAILED: entry(400, 'Timesheet submission failed', 'The timesheet could not be submitted.', 'error', 'payroll'),
  LEAVE_REQUEST_FAILED: entry(400, 'Leave request failed', 'The leave request could not be processed.', 'error', 'payroll'),
  POLICY_RESOLUTION_FAILED: entry(500, 'Policy resolution failed', 'The applicable policy could not be resolved.', 'error', 'payroll'),
  SETTINGS_KEY_UNSUPPORTED: entry(400, 'Unsupported setting', 'This setting key is not supported.', 'warning', 'settings'),
  SETTINGS_SAVE_FAILED: entry(400, 'Settings save failed', 'The settings could not be saved.', 'error', 'settings'),
  CONFIGURATION_MISSING: entry(500, 'Configuration missing', 'Required system configuration is missing.', 'critical', 'settings'),
  RATE_LIMIT_EXCEEDED: entry(429, 'Rate limit exceeded', 'Too many requests were sent in a short time.', 'warning', 'network', 'Wait and try again.', true),
  NETWORK_ERROR: entry(503, 'Network error', 'The system could not reach a required network service.', 'error', 'network', 'Try again later.', true),
  SYSTEM_UNEXPECTED_ERROR: entry(500, 'Unexpected error', 'An unexpected system error occurred.', 'error', 'system', 'Try again later.', true),
  SYSTEM_MAINTENANCE: entry(503, 'System maintenance', 'The system is temporarily unavailable for maintenance.', 'info', 'system', 'Try again later.', true),
  SYSTEM_CONFIGURATION_ERROR: entry(500, 'System configuration error', 'The system configuration is invalid or incomplete.', 'critical', 'system'),
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function getErrorCatalogEntry(code: string): ErrorCatalogEntry {
  return ERROR_CATALOG[code as ErrorCode] ?? ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
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
  return { statusCode, message, description, severity, category, userAction, retryable };
}
