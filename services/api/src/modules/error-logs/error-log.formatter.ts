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
  details?: unknown;
  stack?: string | null;
};

export function formatErrorLogText(
  log: DownloadableErrorLog,
  options: { includeStack: boolean },
) {
  const stack = options.includeStack
    ? log.stack || 'Stack trace is not available.'
    : 'Stack trace is not available.';

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
    '',
    'User Context:',
    `User ID: ${log.userId ?? 'N/A'}`,
    `Tenant ID: ${log.tenantId ?? 'N/A'}`,
    `Organization ID: ${log.organizationId ?? 'N/A'}`,
    `Business Unit ID: ${log.businessUnitId ?? 'N/A'}`,
    '',
    'Details:',
    formatJson(log.details),
    '',
    'Stack Trace:',
    stack,
    '',
  ].join('\n');
}

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
