import {
  LEGACY_DEFAULT_VIEW_KEY,
  PLANNED_FORMS,
  PLANNED_VIEWS,
  isModuleComplete,
  missingModuleComponents,
} from './module-provisioning';

const all = {
  formKeys: PLANNED_FORMS.map((f) => f.formKey),
  viewKeys: PLANNED_VIEWS.map((v) => v.viewKey),
  hasDefaultView: true,
  hasActionBar: true,
};

describe('module provisioning plan', () => {
  it('requires every planned component of an empty module', () => {
    const gap = missingModuleComponents({
      formKeys: [],
      viewKeys: [],
      hasDefaultView: false,
      hasActionBar: false,
    });
    expect(gap.forms).toHaveLength(PLANNED_FORMS.length);
    expect(gap.views).toHaveLength(PLANNED_VIEWS.length);
    expect(gap.actionBar).toBe(true);
  });

  it('is idempotent: a complete module has no gap, so a re-run creates nothing', () => {
    expect(isModuleComplete(all)).toBe(true);
    const gap = missingModuleComponents(all);
    expect(gap.forms).toEqual([]);
    expect(gap.views).toEqual([]);
    expect(gap.actionBar).toBe(false);
  });

  it('only fills what is missing and leaves customised components alone', () => {
    const gap = missingModuleComponents({
      ...all,
      formKeys: ['main'],
      viewKeys: ['all', 'recent'],
    });
    expect(gap.forms.map((f) => f.formKey)).toEqual([
      'quick-create',
      'quick-view',
      'lookup',
    ]);
    expect(gap.views.map((v) => v.viewKey)).toEqual(['quick-find', 'lookup']);
  });

  it('treats the legacy "active" default as satisfying "all" (no second default)', () => {
    const gap = missingModuleComponents({
      ...all,
      viewKeys: [LEGACY_DEFAULT_VIEW_KEY],
    });
    expect(gap.views.map((v) => v.viewKey)).not.toContain('all');
  });

  it('plans exactly one default form and one default view', () => {
    expect(PLANNED_FORMS.filter((f) => f.isDefault)).toHaveLength(1);
    expect(PLANNED_VIEWS.filter((v) => v.isDefault)).toHaveLength(1);
  });

  it('has unique keys', () => {
    expect(new Set(PLANNED_FORMS.map((f) => f.formKey)).size).toBe(
      PLANNED_FORMS.length,
    );
    expect(new Set(PLANNED_VIEWS.map((v) => v.viewKey)).size).toBe(
      PLANNED_VIEWS.length,
    );
  });

  it('does not plan views whose filters the web runtime would silently drop', () => {
    const keys = PLANNED_VIEWS.map((v) => v.viewKey);
    expect(keys).not.toEqual(
      expect.arrayContaining(['active-records', 'inactive', 'my-records']),
    );
  });
});
