import { deriveErrorModule } from './derive-error-module';

describe('deriveErrorModule', () => {
  it('returns the first path segment after /api for an ordinary module route', () => {
    expect(deriveErrorModule('/api/contracts/abc-123')).toBe('contracts');
    expect(deriveErrorModule('/api/employees')).toBe('employees');
  });

  it('appends the second segment for generic umbrella prefixes', () => {
    expect(deriveErrorModule('/api/platform/tenants/xyz')).toBe(
      'platform/tenants',
    );
    expect(deriveErrorModule('/api/super-admin/billing/diagnostics')).toBe(
      'super-admin/billing',
    );
    expect(deriveErrorModule('/api/settings/monitoring/error-logs')).toBe(
      'settings/monitoring',
    );
  });

  it('falls back to the bare prefix when there is no second segment', () => {
    expect(deriveErrorModule('/api/platform')).toBe('platform');
  });

  it('strips a query string before deriving', () => {
    expect(deriveErrorModule('/api/employees?tenantId=abc')).toBe('employees');
  });

  it('handles a path with no /api prefix by using its own first segment', () => {
    expect(deriveErrorModule('/contracts/abc')).toBe('contracts');
  });

  it('returns null for an empty, root or missing path', () => {
    expect(deriveErrorModule(null)).toBeNull();
    expect(deriveErrorModule(undefined)).toBeNull();
    expect(deriveErrorModule('')).toBeNull();
    expect(deriveErrorModule('/api')).toBeNull();
    expect(deriveErrorModule('/')).toBeNull();
  });
});
