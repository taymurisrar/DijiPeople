import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';

/**
 * REG-071 — BUG-0075, and the retest that record has been waiting for.
 *
 * `public-write-rate-limit.invariant.spec.ts` asserts the **rule**: every
 * `@Public()` write handler declares `PublicRateLimitGuard`. It reads controller
 * sources deliberately, so it holds for handlers nobody has written yet — and
 * that is the right shape for the defect it was written against, which was three
 * separate endpoints each shipped without protection.
 *
 * What it cannot say is whether the guard *works*. A declared-but-broken guard
 * passes that check completely. BUG-0075's own QA Retest names the missing half
 * — "exceed the public write threshold against `POST /public/subscribe` and
 * assert `429 PUBLIC_RATE_LIMITED`" — and it sat pending because nothing
 * exercised the runtime behaviour.
 *
 * This is that scenario. It is the `declared-but-unwired-step` pattern applied
 * to a guard: the declaration and the behaviour are two different claims, and
 * only one of them was checked.
 *
 * ## Why the payloads are deliberately invalid
 *
 * The guard runs **before** validation, so a rejected body still consumes a slot.
 * That lets this suite exercise the limiter without creating twenty customers,
 * twenty orders and twenty tenant slug reservations — and it asserts something
 * that matters on its own: a caller cannot escape throttling by sending rubbish.
 *
 * ## Why the suite sets `TRUST_PROXY_HEADERS`
 *
 * The limiter keys on `resolveClientIp(request) + path`, and that function only
 * believes `X-Forwarded-For` when `isProxyTrusted` says a proxy we control is in
 * front — otherwise the header is an attacker-controlled string and trusting it
 * would hand any caller an unlimited supply of identities to rotate through.
 *
 * That is BUG-0032's fix, and it is why a first version of this suite failed:
 * every request fell back to the same loopback socket address, so "two different
 * callers" were one. The suite now states the topology it is testing — the
 * production one, where every public form arrives through a Next route handler —
 * and asserts the untrusted case too, because "the header is ignored when we do
 * not trust the hop" is the more security-relevant half of the pair.
 *
 * The window map is module-level and lives for the whole process, so each test
 * uses a distinct address. Sharing one would make them order-dependent, which is
 * how a throttling test becomes flaky and then gets deleted.
 */
describe('Public write rate limiting (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;

  /** Matches the guard: 20 writes per address per path, per ten-minute window. */
  const WRITE_LIMIT = 20;

  let previousTrustProxy: string | undefined;

  beforeAll(async () => {
    // State the topology under test: production reaches this API through the
    // Next route handlers, so the forwarded address is the real client. Without
    // this every request resolves to the same loopback peer and the per-client
    // assertions below are meaningless.
    previousTrustProxy = process.env.TRUST_PROXY_HEADERS;
    process.env.TRUST_PROXY_HEADERS = 'true';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // The same pipe main.ts installs. Without it an invalid body would reach the
    // handler rather than being refused, which would change what these assert.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();

    if (previousTrustProxy === undefined)
      delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousTrustProxy;
  });

  /**
   * A distinct caller per test, so the module-level window cannot leak.
   *
   * A real dotted address from TEST-NET-3 (RFC 5737), because the header is now
   * parsed rather than ignored — a label-shaped string would be rejected and
   * every caller would collapse back onto the socket address.
   */
  let nextOctet = 11;
  function caller() {
    nextOctet += 1;
    return `203.0.113.${nextOctet}`;
  }

  async function post(path: string, ip: string, body: unknown = {}) {
    return request(app.getHttpServer())
      .post(path)
      .set('x-forwarded-for', ip)
      .send(body);
  }

  it('refuses the twenty-first write from one address with 429 PUBLIC_RATE_LIMITED', async () => {
    const ip = caller();

    // Twenty are allowed. They are refused on their *contents* — 400, not 429 —
    // which is itself the point: validation failures still consume the window.
    for (let attempt = 1; attempt <= WRITE_LIMIT; attempt += 1) {
      const response = await post('/api/public/subscribe', ip);
      expect(response.status).not.toBe(429);
    }

    const throttled = await post('/api/public/subscribe', ip);

    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ code: 'PUBLIC_RATE_LIMITED' });
  });

  it('does not leak the throttle across addresses', async () => {
    // One noisy visitor must not lock out everybody behind a different address —
    // the failure BUG-0032 describes, from the other direction.
    const noisy = caller();
    for (let attempt = 1; attempt <= WRITE_LIMIT + 1; attempt += 1) {
      await post('/api/public/subscribe', noisy);
    }
    expect((await post('/api/public/subscribe', noisy)).status).toBe(429);

    const quiet = caller();
    expect((await post('/api/public/subscribe', quiet)).status).not.toBe(429);
  });

  it('does not leak the throttle across paths', async () => {
    // The window is per address *and* path. Exhausting one public write must not
    // close another: a visitor who mistyped a subscribe form should still be
    // able to submit a lead.
    const ip = caller();
    for (let attempt = 1; attempt <= WRITE_LIMIT + 1; attempt += 1) {
      await post('/api/public/subscribe', ip);
    }
    expect((await post('/api/public/subscribe', ip)).status).toBe(429);

    expect((await post('/api/public/leads', ip)).status).not.toBe(429);
  });

  it('throttles a malformed body too, so rubbish is not a way past the limiter', async () => {
    // The guard runs before validation, and it must: otherwise the cheapest way
    // to hammer an endpoint is to send something that fails validation.
    const ip = caller();
    for (let attempt = 1; attempt <= WRITE_LIMIT; attempt += 1) {
      await post('/api/public/subscribe', ip, { nonsense: 'x'.repeat(50) });
    }

    const throttled = await post('/api/public/subscribe', ip, {
      nonsense: 'x',
    });
    expect(throttled.status).toBe(429);
  });

  it('ignores a forwarded address when the hop is not trusted', async () => {
    /*
     * The other half of BUG-0032, and the more important one. Reachable
     * directly, `X-Forwarded-For` is attacker-controlled: believing it would let
     * one caller rotate through an unlimited supply of identities and never be
     * throttled at all. With trust off, twenty-one writes from twenty-one
     * *claimed* addresses must still be throttled, because they are one peer.
     */
    process.env.TRUST_PROXY_HEADERS = 'false';
    try {
      let throttled = false;
      for (let attempt = 1; attempt <= WRITE_LIMIT + 5; attempt += 1) {
        const response = await post(
          '/api/public/onboarding',
          `198.51.100.${attempt}`,
        );
        if (response.status === 429) {
          throttled = true;
          break;
        }
      }
      expect(throttled).toBe(true);
    } finally {
      process.env.TRUST_PROXY_HEADERS = 'true';
    }
  });

  it('says what happened, without naming a tenant or a customer', async () => {
    // A public endpoint's refusal is readable by anyone. It should say "slow
    // down" and nothing about who else exists.
    const ip = caller();
    for (let attempt = 1; attempt <= WRITE_LIMIT + 1; attempt += 1) {
      await post('/api/public/subscribe', ip);
    }

    const throttled = await post('/api/public/subscribe', ip);
    const body = JSON.stringify(throttled.body);

    expect(throttled.status).toBe(429);
    expect(throttled.body.message).toMatch(/too many requests/i);
    expect(body).not.toMatch(/tenant/i);
    expect(body).not.toMatch(/customer/i);
  });
});
