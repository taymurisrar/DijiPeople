import { BadRequestException } from '@nestjs/common';
import { assertValidTenantSlug, suggestTenantSlug } from './slug.util';

describe('tenant slug utilities', () => {
  it('normalizes and accepts valid tenant slugs', () => {
    expect(assertValidTenantSlug(' Acme-HR1 ')).toBe('acme-hr1');
  });

  it('rejects invalid tenant slug formats', () => {
    expect(() => assertValidTenantSlug('acme--hr')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidTenantSlug('-acme')).toThrow(BadRequestException);
    expect(() => assertValidTenantSlug('acme hr')).toThrow(BadRequestException);
  });

  it('rejects reserved tenant slugs', () => {
    expect(() => assertValidTenantSlug('admin')).toThrow(BadRequestException);
    expect(() => assertValidTenantSlug('dijipeople')).toThrow(
      BadRequestException,
    );
  });

  it('suggests safe slugs from customer names', () => {
    expect(suggestTenantSlug('Acme HRM, Inc.')).toBe('acme-hrm-inc');
  });
});
