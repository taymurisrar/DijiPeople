import {
  NOT_AN_INCIDENT,
  initialSupportStatus,
  isExpectedProtocolOutcome,
} from './expected-protocol-outcome';

/**
 * BUG-1754 — the triage queue held 1,588 rows and the newest pages were almost
 * entirely non-incidents.
 *
 * `401` from ordinary session expiry and `404` for routes that do not exist are
 * answers the protocol is *for*. Recorded as `NEW` they became work waiting for
 * a human, and they buried the genuine signal — eleven critical items nobody
 * had touched.
 *
 * The interesting assertions here are the negative ones. A classifier that
 * guesses wrong in this direction hides defects, and the cost of guessing wrong
 * in the other is one extra row somebody dismisses.
 */
describe('BUG-1754 — expected protocol outcomes are not incidents', () => {
  describe('what is filed as routine', () => {
    it.each([
      'AUTH_TOKEN_MISSING',
      'AUTH_TOKEN_INVALID',
      'AUTH_REFRESH_TOKEN_INVALID',
      'AUTH_UNAUTHORIZED',
      'SESSION_EXPIRED',
    ])('a 401 from %s', (errorCode) => {
      expect(isExpectedProtocolOutcome({ statusCode: 401, errorCode })).toBe(
        true,
      );
    });

    it('a 404 for a route that does not exist', () => {
      expect(
        isExpectedProtocolOutcome({ statusCode: 404, unmatchedRoute: true }),
      ).toBe(true);
    });
  });

  describe('what keeps its place in the queue', () => {
    it('a 400 validation rejection', () => {
      /*
       * The one the record proposing this fix suggested excluding, and the
       * reason it must not be. BUG-1742 — no lead could be created from
       * Platform Admin, for anyone, in production — presented as exactly this:
       * a 400 saying `partnerId must be a UUID`. Filed as routine client error,
       * it would have hidden a defect blocking the entry point of the
       * commercial funnel.
       */
      expect(
        isExpectedProtocolOutcome({
          statusCode: 400,
          errorCode: 'VALIDATION_FAILED',
        }),
      ).toBe(false);
    });

    it('a 404 for a record, rather than for a route', () => {
      // Same status code, different event. A missing record may be a broken
      // link or a row something still references.
      expect(
        isExpectedProtocolOutcome({
          statusCode: 404,
          errorCode: 'EMPLOYEE_NOT_FOUND',
        }),
      ).toBe(false);
    });

    it('a 401 that is not about the session', () => {
      expect(
        isExpectedProtocolOutcome({
          statusCode: 401,
          errorCode: 'AUTH_INVALID_CREDENTIALS',
        }),
      ).toBe(false);
    });

    it.each([403, 409, 422, 429, 500, 502, 503])('a %s', (statusCode) => {
      expect(isExpectedProtocolOutcome({ statusCode })).toBe(false);
    });

    it('anything it does not recognise', () => {
      // The default has to be "queue it". An unrecognised failure is exactly
      // the kind nobody has thought about yet.
      expect(isExpectedProtocolOutcome({})).toBe(false);
      expect(
        isExpectedProtocolOutcome({ statusCode: 401, errorCode: 'SOMETHING' }),
      ).toBe(false);
    });
  });

  describe('the status a row is born with', () => {
    it('routine outcomes are recorded, not queued', () => {
      expect(
        initialSupportStatus({
          statusCode: 401,
          errorCode: 'AUTH_TOKEN_INVALID',
        }),
      ).toBe(NOT_AN_INCIDENT);
    });

    it('everything else still asks for a human', () => {
      expect(initialSupportStatus({ statusCode: 500 })).toBe('NEW');
    });
  });
});
