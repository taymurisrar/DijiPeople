import { formatErrorLogText } from './error-log.formatter';

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
});
