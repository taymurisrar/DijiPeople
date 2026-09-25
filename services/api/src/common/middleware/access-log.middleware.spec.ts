import { Logger } from '@nestjs/common';
import { AccessLogMiddleware } from './access-log.middleware';

function buildResponse() {
  const handlers: Record<string, () => void> = {};
  return {
    statusCode: 200,
    on: jest.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    fireFinish: () => handlers.finish?.(),
  };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    path: '/api/employees',
    route: { path: '/api/employees/:id' },
    requestId: 'req_test-1',
    query: { secretToken: 'do-not-log-me' },
    body: { password: 'do-not-log-me-either' },
    headers: { authorization: 'Bearer do-not-log-me' },
    ...overrides,
  };
}

describe('AccessLogMiddleware', () => {
  /*
   * REG-579. Before this middleware existed, a successful (or slow) request
   * produced zero log output at all — this proves the opposite: exactly one
   * line, on `finish`, carrying the trace id.
   */
  it('logs exactly one structured line per request when enabled', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new AccessLogMiddleware({
      get: () => 'true',
    } as never);
    const req = buildRequest({
      user: { tenantId: 'tenant-1', userId: 'user-1' },
    });
    const res = buildResponse();
    const next = jest.fn();

    middleware.use(req as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    res.fireFinish();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0];
    const parsed = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      method: 'GET',
      route: '/api/employees/:id',
      statusCode: 200,
      traceId: 'req_test-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(typeof parsed.durationMs).toBe('number');

    logSpy.mockRestore();
  });

  it('never includes the request body, headers or query string in the log line', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new AccessLogMiddleware({
      get: () => 'true',
    } as never);
    const req = buildRequest();
    const res = buildResponse();

    middleware.use(req as never, res as never, jest.fn());
    res.fireFinish();

    const [line] = logSpy.mock.calls[0];
    expect(line).not.toContain('do-not-log-me');
    expect(line).not.toContain('do-not-log-me-either');
    expect(line).not.toContain('secretToken');
    expect(line).not.toContain('authorization');
    expect(line).not.toContain('password');

    logSpy.mockRestore();
  });

  it('logs null tenantId/userId for an unauthenticated request rather than fabricating identity', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new AccessLogMiddleware({
      get: () => 'true',
    } as never);
    const req = buildRequest();
    const res = buildResponse();

    middleware.use(req as never, res as never, jest.fn());
    res.fireFinish();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.tenantId).toBeNull();
    expect(parsed.userId).toBeNull();

    logSpy.mockRestore();
  });

  it('does not attach a finish listener or log anything when REQUEST_LOGGING_ENABLED is not "true"', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new AccessLogMiddleware({
      get: () => undefined,
    } as never);
    const req = buildRequest();
    const res = buildResponse();
    const next = jest.fn();

    middleware.use(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
