import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { ErrorLogsService } from '../../modules/error-logs/error-logs.service';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * BUG-3188. A rejected rate-limited request must not cost a database write per
 * rejection, and every other status must keep being persisted in full because the
 * monitoring queue and support's trace-id lookup rely on those rows.
 */
function harness() {
  const persist = jest.fn().mockResolvedValue(undefined);
  const filter = new HttpExceptionFilter(
    { get: jest.fn() } as unknown as ConfigService,
    { persist } as unknown as ErrorLogsService,
  );
  const call = async (
    status: number,
    options: { ip?: string; url?: string } = {},
  ) => {
    const json = jest.fn();
    const response = {
      status: jest.fn(() => ({ json })),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    };
    const request = {
      originalUrl: options.url ?? '/api/public/tenants/resolve?slug=a',
      url: options.url ?? '/api/public/tenants/resolve?slug=a',
      method: 'GET',
      ip: options.ip ?? '203.0.113.7',
      headers: {},
      params: {},
      query: {},
      body: {},
      get: jest.fn(),
      header: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    await filter.catch(new HttpException('Too many requests', status), host);
    return { response, json };
  };
  return { call, persist };
}

describe('HttpExceptionFilter persistence (BUG-3188)', () => {
  it('persists one row for a flood of 429s from one address to one path, and still answers every one', async () => {
    const h = harness();
    const url = `/api/flood-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 50; i += 1) {
      const { response } = await h.call(429, { url: `${url}?n=${i}` });
      expect(response.status).toHaveBeenCalledWith(429);
    }
    expect(h.persist).toHaveBeenCalledTimes(1);
  });

  it('persists again for a different address', async () => {
    const h = harness();
    const url = `/api/flood-${Math.random().toString(36).slice(2)}`;
    await h.call(429, { url, ip: '198.51.100.1' });
    await h.call(429, { url, ip: '198.51.100.2' });
    expect(h.persist).toHaveBeenCalledTimes(2);
  });

  it('does not sample any other status: every 404 and 400 is persisted', async () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) await h.call(404, { url: '/api/missing' });
    for (let i = 0; i < 5; i += 1) await h.call(400, { url: '/api/bad' });
    expect(h.persist).toHaveBeenCalledTimes(10);
  });
});
