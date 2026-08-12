import {
  ERROR_LOG_TERMINATOR,
  formatErrorLogText,
} from './error-log.formatter';

describe('formatErrorLogText', () => {
  it('includes persisted client debugging context', () => {
    const text = formatErrorLogText(
      {
        traceId: 'client_123',
        createdAt: '2026-06-05T10:00:00.000Z',
        severity: 'ERROR',
        errorCode: 'SYSTEM_UNEXPECTED_ERROR',
        statusCode: 500,
        message: 'Render failed',
        description: 'A client-side error occurred.',
        method: 'CLIENT',
        path: '/employees',
        stack: 'Error: Render failed\n at EmployeesPage',
        details: {
          details: { action: 'render' },
          componentStack: 'at EmployeesPage',
          browserInfo: 'Test Browser',
        },
      },
      { includeStack: true },
    );

    expect(text).toContain('client_123');
    expect(text).toContain('Error: Render failed');
    expect(text).toContain('at EmployeesPage');
    expect(text).toContain('Test Browser');
  });

  it('keeps complete server details when they contain a nested details property', () => {
    const sessionId = 'f39aaed3-289d-4fca-9c02-123456789abc';
    const text = formatErrorLogText(
      {
        traceId: 'admin_1a3ee63f-a177-4583-aeee-7f8d5bab3b70',
        createdAt: '2026-08-11T10:10:52.720Z',
        severity: 'WARNING',
        errorCode: 'VALIDATION_FAILED',
        statusCode: 400,
        message: 'Lead sub-status is not valid for the selected lead status.',
        description: 'Review the highlighted fields and submit again.',
        method: 'POST',
        path: '/api/platform-runtime/leads/lead-1/actions/change-status',
        sourceApp: 'admin',
        environment: 'production',
        params: { id: 'lead-1' },
        query: {},
        requestBody: { status: 'QUALIFIED' },
        details: {
          details: { selectedStatus: 'QUALIFIED' },
          platformActor: { sessionId },
        },
      },
      { includeStack: false },
    );

    expect(text).toContain(sessionId);
    expect(text).toContain('selectedStatus');
    expect(text).toContain('Route Parameters:');
    expect(text).toContain('Request Body:');
    expect(text.trimEnd().endsWith(ERROR_LOG_TERMINATOR)).toBe(true);
  });
});
