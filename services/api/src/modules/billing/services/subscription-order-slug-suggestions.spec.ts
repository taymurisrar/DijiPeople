import { SubscriptionOrderService } from './subscription-order.service';

/*
 * WS02: an unavailable workspace address comes back with deterministic,
 * verified-free alternatives. Only the Prisma calls checkSlugAvailability makes
 * are stubbed; the slug rules themselves run for real.
 */
function build(opts: { takenTenants?: string[]; heldOrders?: string[] }) {
  const prisma = {
    subscriptionOrder: {
      findUnique: jest.fn(async (args: { where: Record<string, string> }) =>
        'id' in args.where
          ? {
              id: args.where.id,
              status: 'DRAFT',
              expiresAt: null,
              requestedSlug: null,
            }
          : opts.heldOrders?.includes(args.where.requestedSlug)
            ? { id: 'other' }
            : null,
      ),
      findMany: jest.fn(
        async (args: { where: { requestedSlug: { in: string[] } } }) =>
          args.where.requestedSlug.in
            .filter((slug) => opts.heldOrders?.includes(slug))
            .map((requestedSlug) => ({ requestedSlug })),
      ),
    },
    tenant: {
      findUnique: jest.fn(async (args: { where: { slug: string } }) =>
        opts.takenTenants?.includes(args.where.slug) ? { id: 't' } : null,
      ),
      findMany: jest.fn(async (args: { where: { slug: { in: string[] } } }) =>
        args.where.slug.in
          .filter((slug) => opts.takenTenants?.includes(slug))
          .map((slug) => ({ slug })),
      ),
    },
  };
  const service = new SubscriptionOrderService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // The session must be reusable; stub the private predicate rather than
  // depend on its status table.
  jest
    .spyOn(service as unknown as { isReusable: () => boolean }, 'isReusable')
    .mockReturnValue(true);
  return service;
}

describe('SubscriptionOrderService.checkSlugAvailability suggestions', () => {
  it('offers no suggestions when the address is free', async () => {
    const result = await build({}).checkSlugAvailability('o1', 'acme');
    expect(result).toMatchObject({ available: true });
    expect((result as { suggestions?: string[] }).suggestions).toBeUndefined();
  });

  it('offers deterministic free alternatives when taken', async () => {
    const result = await build({
      takenTenants: ['acme'],
    }).checkSlugAvailability('o1', 'acme');
    expect(result).toMatchObject({
      available: false,
      reason: 'TAKEN',
      suggestions: ['acme-hr', 'acme-team', 'acme-2'],
    });
  });

  it('skips alternatives held by a tenant or by another order', async () => {
    const result = await build({
      takenTenants: ['acme', 'acme-hr'],
      heldOrders: ['acme-team'],
    }).checkSlugAvailability('o1', 'acme');
    expect(result).toMatchObject({
      suggestions: ['acme-2', 'acme-3', 'acme-4'],
    });
  });

  it('suggests around a reserved word', async () => {
    const result = await build({}).checkSlugAvailability('o1', 'api');
    expect(result).toMatchObject({
      available: false,
      reason: 'INVALID_FORMAT',
      suggestions: ['api-hr', 'api-team', 'api-2'],
    });
  });

  it('never exceeds 50 characters', async () => {
    const long = 'a'.repeat(50);
    const result = (await build({
      takenTenants: [long],
    }).checkSlugAvailability('o1', long)) as { suggestions: string[] };
    expect(result.suggestions.length).toBe(3);
    for (const suggestion of result.suggestions) {
      expect(suggestion.length).toBeLessThanOrEqual(50);
    }
  });
});
