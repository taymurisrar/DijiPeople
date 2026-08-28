import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTROLLER = readFileSync(
  join(__dirname, 'controllers/stripe-webhook.controller.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * BUG-1543 — the billing webhook rejected two of Stripe's callbacks with
 * `400 VALIDATION_FAILED` during a real payment on production.
 *
 * The payment succeeded and the tenant provisioned, so nothing was lost. What
 * it did do was raise the critical "a customer may have paid without us
 * knowing" alert — exactly the condition that alert exists to detect — and
 * working out which of three different rejections had fired meant log
 * archaeology.
 *
 * This is the half of that record which needs no Stripe access and no
 * diagnosis: *"A rejected webhook should record which validation failed, so
 * this does not require log archaeology next time."* The cause itself is still
 * open and waits on a paid signup re-run.
 */
describe('BUG-1543 — a rejected webhook says which check refused it', () => {
  const code = codeOnly(CONTROLLER);

  it('records a reason rather than only throwing', () => {
    expect(code).toContain("event: 'stripe.webhook.rejected'");
    expect(code).toContain('this.logger.warn');
  });

  it('distinguishes all three rejections', () => {
    /*
     * `VALIDATION_FAILED` is the catalog's code for every 400, so the response
     * cannot tell these apart. Each has a different answer: a missing header is
     * a caller that is not Stripe, a non-buffer body is raw-body middleware not
     * running for this route, and a failed verification is either the wrong
     * webhook secret or a forgery.
     */
    for (const check of [
      "check: 'signature-header-present'",
      "check: 'raw-body-buffer'",
      "check: 'signature-verification'",
    ]) {
      expect([check, code.includes(check)]).toEqual([check, true]);
    }
  });

  it('records the signature verification failure at all', () => {
    // It used to propagate uncaught, arriving as an indistinguishable 400.
    expect(code).toContain('try {');
    expect(code).toContain('verifyWebhookSignature');
    expect(code).toContain('cause: error instanceof Error');
  });

  it('logs neither the payload nor the signature', () => {
    /*
     * The body is a customer's payment detail and the signature is a
     * credential. What is worth knowing is which check failed and whether the
     * request looked like Stripe — not what it contained.
     */
    const refuse = code.slice(
      code.indexOf('private refuse('),
      code.indexOf('async handleStripeWebhook('),
    );
    expect(refuse).not.toMatch(/request\.body[^.]/);
    expect(refuse).not.toContain('signature');

    // And the call sites pass shape, not content.
    expect(code).toContain('bodyType: typeof request.body');
    expect(code).toContain('bodyBytes: request.body.length');
    expect(code).not.toMatch(/body:\s*request\.body/);
  });

  it('still answers the caller with the same status it always did', () => {
    // Diagnosability was the ask; changing what Stripe receives was not.
    expect(code).toContain('BadRequestException(reason)');
    expect(code).toContain('@HttpCode(200)');
  });
});
