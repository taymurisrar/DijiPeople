import { PublicTenantsService } from './public-tenants.service';

type Keyed = { buildCacheKey(input: object): string };

/**
 * BUG-3162. The cached answer for a tenant resolution must be returned only to a
 * request that supplied exactly the same selectors, because the resolver reads
 * more than one of them. Keying on the first selector present let a caller
 * resolve `?slug=victim&host=<attacker domain>` to the attacker's tenant and
 * have that answer served to every later `slug=victim` request.
 */
describe('PublicTenantsService cache key (BUG-3162)', () => {
  const service = Object.create(
    PublicTenantsService.prototype,
  ) as unknown as Keyed;
  const key = (input: object) => service.buildCacheKey(input);

  it('differs when a second selector is added to the same slug', () => {
    expect(key({ slug: 'victim', host: 'attacker.example.com' })).not.toBe(
      key({ slug: 'victim' }),
    );
  });

  it('differs for every single-selector variant of the same value', () => {
    const keys = [
      key({ slug: 'acme' }),
      key({ domain: 'acme' }),
      key({ host: 'acme' }),
      key({ tenantCode: 'acme' }),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it('is identical for identical selectors, whatever the property order', () => {
    expect(key({ slug: 'a', host: 'b' })).toBe(key({ host: 'b', slug: 'a' }));
  });

  it('keeps the prefix that cache invalidation deletes by', () => {
    for (const input of [{}, { slug: 'a' }, { slug: 'a', host: 'b' }]) {
      expect(key(input).startsWith('tenant:resolve:')).toBe(true);
    }
  });

  it('cannot be confused by a selector value containing the separator', () => {
    expect(key({ slug: 'a|host=b' })).not.toBe(key({ slug: 'a', host: 'b' }));
  });
});
