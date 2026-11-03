import { lifecycleOf, parseStatusFilter } from './custom-record-lifecycle';

describe('custom record lifecycle by module kind', () => {
  it('standard modules are editable, deactivatable, deletable and user-owned', () => {
    expect(lifecycleOf('STANDARD')).toEqual({
      update: true,
      deactivate: true,
      delete: true,
      userOwned: true,
    });
  });

  it('an unset kind behaves as STANDARD (existing modules before the column existed)', () => {
    expect(lifecycleOf(undefined)).toEqual(lifecycleOf('STANDARD'));
    expect(lifecycleOf(null)).toEqual(lifecycleOf('STANDARD'));
  });

  it('immutable modules allow nothing but creation', () => {
    expect(lifecycleOf('IMMUTABLE')).toMatchObject({
      update: false,
      deactivate: false,
      delete: false,
    });
  });

  it('configuration modules can be retired but never deleted', () => {
    expect(lifecycleOf('CONFIGURATION')).toMatchObject({
      update: true,
      deactivate: true,
      delete: false,
    });
  });

  it('only STANDARD is user-owned, so only STANDARD gets "My Records"', () => {
    const userOwned = (
      ['STANDARD', 'ORGANIZATION_OWNED', 'IMMUTABLE', 'CONFIGURATION'] as const
    ).filter((k) => lifecycleOf(k).userOwned);
    expect(userOwned).toEqual(['STANDARD']);
  });

  it('status filter accepts active|inactive|all, defaults to all, and rejects anything else', () => {
    expect(parseStatusFilter(undefined)).toBe('all');
    expect(parseStatusFilter('active')).toBe('active');
    expect(parseStatusFilter('inactive')).toBe('inactive');
    expect(parseStatusFilter('deleted')).toBeNull();
    expect(parseStatusFilter(['active'])).toBeNull();
  });
});
