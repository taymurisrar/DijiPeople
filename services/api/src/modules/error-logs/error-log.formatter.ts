type DownloadableErrorLog = {
  traceId: string;
  createdAt: Date | string;
  severity: string;
  errorCode: string;
  statusCode: number;
  message: string;
  description: string;
  method?: string | null;
  path?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  organizationId?: string | null;
  businessUnitId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  sourceApp?: string | null;
  environment?: string | null;
  cause?: unknown;
  details?: unknown;
  params?: unknown;
  query?: unknown;
  requestBody?: unknown;
  stack?: string | null;
};

export function formatErrorLogText(
  log: DownloadableErrorLog,
  options: { includeStack: boolean },
) {
  const stack = options.includeStack
    ? log.stack || 'Stack trace is not available.'
    : 'Stack trace is restricted by the server error-log policy.';
  const clientDetails = readClientDetails(log.details);

  return [
    'DijiPeople HRM Error Log',
    '========================',
    '',
    'Reference ID:',
    log.traceId,
    '',
    'Timestamp:',
    toIso(log.createdAt),
    '',
    'Severity:',
    log.severity,
    '',
    'Error Code:',
    log.errorCode,
    '',
    'Status Code:',
    String(log.statusCode),
    '',
    'Message:',
    log.message,
    '',
    'Description:',
    log.description,
    '',
    'Request:',
    `${log.method ?? 'N/A'} ${log.path ?? 'N/A'}`,
    `Source application: ${log.sourceApp ?? 'N/A'}`,
    `Environment: ${log.environment ?? 'N/A'}`,
    `IP address: ${log.ipAddress ?? 'N/A'}`,
    '',
    'User Context:',
    `User ID: ${log.userId ?? 'N/A'}`,
    `Tenant ID: ${log.tenantId ?? 'N/A'}`,
    `Organization ID: ${log.organizationId ?? 'N/A'}`,
    `Business Unit ID: ${log.businessUnitId ?? 'N/A'}`,
    '',
    'Details:',
    formatJson(clientDetails.details ?? log.details),
    '',
    'Cause:',
    formatJson(log.cause),
    '',
    'Route Parameters:',
    formatJson(log.params),
    '',
    'Query Parameters:',
    formatJson(log.query),
    '',
    'Request Body:',
    formatJson(log.requestBody),
    '',
    'Stack Trace:',
    stack,
    '',
    'Component Stack:',
    clientDetails.componentStack ??
      'Component stack is not available for this error.',
    '',
    'Browser Info:',
    clientDetails.browserInfo ?? log.userAgent ?? 'N/A',
    '',
    // A terminator makes a truncated download obvious instead of leaving the
    // reader guessing whether the file simply ended.
    ERROR_LOG_TERMINATOR,
    '',
  ].join('\n');
}

export const ERROR_LOG_TERMINATOR = '--- End of error log ---';

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return 'N/A';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'N/A';
  }
}

function readClientDetails(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      details: value,
      componentStack: null,
      browserInfo: null,
    };
  }

  const record = value as Record<string, unknown>;
  const isClientEnvelope =
    Object.prototype.hasOwnProperty.call(record, 'details') &&
    ('componentStack' in record ||
      'browserInfo' in record ||
      'reportedAt' in record);
  return {
    details: isClientEnvelope ? record.details : value,
    componentStack:
      typeof record.componentStack === 'string' ? record.componentStack : null,
    browserInfo:
      typeof record.browserInfo === 'string' ? record.browserInfo : null,
  };
}
