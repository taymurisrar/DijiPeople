import {
  assertValidTenantSlug,
  normalizeTenantSlug,
  suggestTenantSlug,
} from './slug.util';

describe('tenant slug utilities', () => {
  it('normalizes tenant slugs', () => {
    expect(normalizeTenantSlug('  ABC-CPA  ')).toBe('abc-cpa');
  });

  it('rejects reserved tenant slugs', () => {
    expect(() => assertValidTenantSlug('admin')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'TENANT_SLUG_RESERVED',
        }),
      }),
    );
  });

  it('rejects invalid tenant slug formats', () => {
    expect(() => assertValidTenantSlug('-abc')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'TENANT_SLUG_INVALID_FORMAT',
        }),
      }),
    );
  });

  it('suggests url-safe tenant slugs', () => {
    expect(suggestTenantSlug('ABC CPA & Co.')).toBe('abc-cpa-co');
  });
});
