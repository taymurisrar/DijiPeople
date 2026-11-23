import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-3187. The anonymous reads every workspace page load depends on were
 * unguarded, and the invariant that protects public writes could not see them.
 * They now carry an explicit budget of 600 per window and route.
 *
 * Two things are asserted, because both are failure modes:
 *   - TOO LOOSE: request 601 inside one window is refused with 429.
 *   - TOO TIGHT: the first 600 are all served. A 429 on these routes is a broken
 *     login for everyone in an office behind one address, so the budget must be
 *     well above what a person produces. The old default was 120.
 *
 * EVIDENCE CLASS: HTTP integration against the real guard and a real database.
 */
describeWithDatabase()('Anonymous read rate limits (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;

  const hit = () =>
    request(app.getHttpServer()).get(
      '/workspaces/resolve?host=nonexistent.invalid',
    );

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the first 600 requests and refuses the 601st, with a body that names nothing', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 600; i += 1) {
      statuses.push((await hit()).status);
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(0);

    const refused = await hit();
    expect(refused.status).toBe(429);
    expect(JSON.stringify(refused.body)).not.toContain('nonexistent.invalid');
  });

  it('does not let a different query string buy a fresh bucket', async () => {
    // The window above is already exhausted for this route and address; a new
    // query value must not reset it.
    const res = await request(app.getHttpServer()).get(
      '/workspaces/resolve?host=another-host.invalid',
    );
    expect(res.status).toBe(429);
  });
});
