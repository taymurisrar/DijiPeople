import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REG-225 — BUG-0223.
 *
 * `Plan` carried two independent answers to one question — *may a customer buy
 * this?*
 *
 *   `isPublic`           boolean, defaults to **true**, no audit columns, and
 *                        no operator write path at all: it could only be changed
 *                        by a seed or by hand in the database.
 *   `publicationStatus`  DRAFT / PUBLISHED / ARCHIVED, with `publishedAt` and
 *                        `archivedAt`, applied uniformly to plan, market and
 *                        price, and already treated as the authority by
 *                        `commercial-offer.resolver.ts`.
 *
 * Two gates that can disagree is worse than either alone. A plan could be
 * `PUBLISHED` and `isPublic: false` — visible in the offer, refused at checkout
 * — or `DRAFT` and `isPublic: true`, which is a plan nobody published being
 * purchasable. Nothing detected either state, because each gate was correct on
 * its own terms.
 *
 * Publication won, and the boolean's reads were removed. The column is still in
 * the schema; dropping it is a contract-phase migration.
 *
 * ## Why this test reads source rather than calling the service
 *
 * The defect is *the existence of a second gate*, not the behaviour of any one
 * call. A behavioural test would have to guess which of the eleven read sites
 * somebody might reintroduce, and would pass for every site it did not guess.
 * The invariant is "no gating read of `Plan.isPublic` exists", and that is a
 * statement about the source.
 *
 * It is scoped narrowly to earn that: only the three files that held the gates,
 * and only `Plan.isPublic` — the unrelated `IS_PUBLIC_KEY` route decorator and
 * `isPublicSafeReason` share a prefix and are none of this test's business.
 */
describe('BUG-0223 — one self-service gate, not two', () => {
  const API_SRC = join(__dirname, '..', '..');

  const GATED_FILES = [
    'modules/billing/services/billing.service.ts',
    'modules/billing/services/commercial-config.service.ts',
    'modules/super-admin/super-admin.service.ts',
  ];

  function sourceOf(relative: string) {
    return readFileSync(join(API_SRC, relative), 'utf8');
  }

  /** Lines that read or filter on `Plan.isPublic`, ignoring comments. */
  function gatingReads(body: string) {
    return body
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => {
        if (line.startsWith('//') || line.startsWith('*')) return false;
        if (/isPublicSafeReason|IS_PUBLIC_KEY/.test(line)) return false;
        // `isPublic:` as a Prisma filter or a read of `.isPublic` on a plan.
        return (
          /\bisPublic\s*:\s*(true|false)\b/.test(line) ||
          /\.isPublic\b/.test(line)
        );
      });
  }

  it.each(GATED_FILES)('%s does not gate on Plan.isPublic', (relative) => {
    const found = gatingReads(sourceOf(relative));

    expect(
      found.map(({ number, line }) => `${relative}:${number}  ${line}`),
    ).toEqual([]);
  });

  it('still exposes an isPublic field, derived from publication', () => {
    /*
     * The paired assertion. Removing the reads without keeping the response
     * field would be a silent contract break — the landing site consumes it —
     * and a test that only forbade `isPublic` would have called that a pass.
     */
    const body = sourceOf('modules/billing/services/billing.service.ts');

    expect(body).toContain('isPublic:');
    expect(body).toMatch(
      /isPublic:\s*\n?\s*plan\.publicationStatus === CommercialPublicationStatus\.PUBLISHED/,
    );
  });

  it('gates checkout on PUBLISHED in every place it gates at all', () => {
    // Both checkout entry points and the plan listings.
    const body = sourceOf('modules/billing/services/billing.service.ts');
    const gates = body.match(
      /publicationStatus(?:\s*!==\s*|\s*:\s*)CommercialPublicationStatus\.PUBLISHED/g,
    );

    expect(gates?.length ?? 0).toBeGreaterThanOrEqual(6);
  });
});
