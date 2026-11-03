import { CustomizationModuleKind } from '@prisma/client';
import {
  CURRENT_USER_TOKEN,
  LEGACY_DEFAULT_VIEW_KEY,
  PLANNED_FORMS,
  PLANNED_VIEWS,
  commandsFor,
  formsFor,
  isModuleComplete,
  missingModuleComponents,
  viewsFor,
} from './module-provisioning';
import { DEFAULT_MODULE_ACTION_COMMANDS } from './customization.service';

const KINDS: CustomizationModuleKind[] = [
  'STANDARD',
  'ORGANIZATION_OWNED',
  'IMMUTABLE',
  'CONFIGURATION',
];
const keys = (kind: CustomizationModuleKind) =>
  viewsFor(kind).map((v) => v.viewKey);

const completeFor = (kind: CustomizationModuleKind) => ({
  formKeys: formsFor(kind).map((f) => f.formKey),
  viewKeys: viewsFor(kind).map((v) => v.viewKey),
  hasDefaultView: true,
  hasActionBar: true,
});

describe('module provisioning plan', () => {
  it('requires every planned component of an empty module, for every kind', () => {
    for (const kind of KINDS) {
      const gap = missingModuleComponents(
        {
          formKeys: [],
          viewKeys: [],
          hasDefaultView: false,
          hasActionBar: false,
        },
        kind,
      );
      expect(gap.forms).toHaveLength(formsFor(kind).length);
      expect(gap.views).toHaveLength(viewsFor(kind).length);
      expect(gap.actionBar).toBe(true);
    }
  });

  it('is idempotent: a complete module has no gap, so a re-run creates nothing', () => {
    for (const kind of KINDS) {
      expect(isModuleComplete(completeFor(kind), kind)).toBe(true);
      const gap = missingModuleComponents(completeFor(kind), kind);
      expect(gap.forms).toEqual([]);
      expect(gap.views).toEqual([]);
      expect(gap.actionBar).toBe(false);
    }
  });

  it('only fills what is missing and leaves customised components alone', () => {
    const gap = missingModuleComponents(
      {
        ...completeFor('STANDARD'),
        formKeys: ['main'],
        viewKeys: ['all', 'recent'],
      },
      'STANDARD',
    );
    expect(gap.forms.map((f) => f.formKey)).toEqual([
      'quickCreate',
      'quickView',
      'lookup',
    ]);
    expect(gap.views.map((v) => v.viewKey)).toEqual([
      'activeRecords',
      'inactiveRecords',
      'myRecords',
      'quickFind',
      'lookup',
    ]);
  });

  it('every planned key is a valid component logical name (hyphenated keys broke package export)', () => {
    // The platform's metadata key pattern (dto/customization.dto.ts METADATA_KEY_PATTERN): the package
    // artifact rejects any component whose objectKey is not a camelCase logical name.
    const pattern = /^[a-z][a-zA-Z0-9]*$/;
    for (const f of PLANNED_FORMS) expect(f.formKey).toMatch(pattern);
    for (const v of PLANNED_VIEWS) expect(v.viewKey).toMatch(pattern);
  });

  it('treats the legacy "active" default as satisfying "all" (no second default)', () => {
    const gap = missingModuleComponents(
      { ...completeFor('STANDARD'), viewKeys: [LEGACY_DEFAULT_VIEW_KEY] },
      'STANDARD',
    );
    expect(gap.views.map((v) => v.viewKey)).not.toContain('all');
  });

  it('plans exactly one default form and one default view for every kind', () => {
    for (const kind of KINDS) {
      expect(formsFor(kind).filter((f) => f.isDefault)).toHaveLength(1);
      expect(viewsFor(kind).filter((v) => v.isDefault)).toHaveLength(1);
    }
  });

  it('has unique keys', () => {
    expect(new Set(PLANNED_FORMS.map((f) => f.formKey)).size).toBe(
      PLANNED_FORMS.length,
    );
    expect(new Set(PLANNED_VIEWS.map((v) => v.viewKey)).size).toBe(
      PLANNED_VIEWS.length,
    );
  });
});

describe('module kind decides what is provisioned (owner decision 2026-11-03)', () => {
  it('STANDARD gets All, Active, Inactive, My, Recent, Quick Find and Lookup', () => {
    expect(keys('STANDARD')).toEqual([
      'all',
      'activeRecords',
      'inactiveRecords',
      'myRecords',
      'recent',
      'quickFind',
      'lookup',
    ]);
  });

  it('"My Records" exists only where a person owns records', () => {
    for (const kind of KINDS) {
      expect(keys(kind).includes('myRecords')).toBe(kind === 'STANDARD');
    }
  });

  it('immutable modules get no Active/Inactive/My views (their records have no status to filter)', () => {
    expect(keys('IMMUTABLE')).toEqual(['all', 'recent', 'quickFind', 'lookup']);
  });

  it('organization-owned and configuration modules get status views but no per-user view', () => {
    expect(keys('ORGANIZATION_OWNED')).toEqual([
      'all',
      'activeRecords',
      'inactiveRecords',
      'recent',
      'quickFind',
      'lookup',
    ]);
    expect(keys('CONFIGURATION')).toEqual([
      'all',
      'activeRecords',
      'inactiveRecords',
      'recent',
      'quickFind',
      'lookup',
    ]);
  });

  it('view filters target real record-level fields and the @me token, never a phantom column', () => {
    const allowed = new Set(['isActive', 'ownerUserId']);
    for (const v of PLANNED_VIEWS)
      for (const f of v.filters) expect(allowed.has(f.columnKey)).toBe(true);
    expect(
      PLANNED_VIEWS.find((v) => v.viewKey === 'myRecords')?.filters[0].value,
    ).toBe(CURRENT_USER_TOKEN);
    expect(
      PLANNED_VIEWS.find((v) => v.viewKey === 'activeRecords')?.filters[0],
    ).toMatchObject({ columnKey: 'isActive', value: true });
    expect(
      PLANNED_VIEWS.find((v) => v.viewKey === 'inactiveRecords')?.filters[0],
    ).toMatchObject({ columnKey: 'isActive', value: false });
  });

  it('the command bar never offers an operation the record lifecycle forbids', () => {
    const immutable = commandsFor('IMMUTABLE', DEFAULT_MODULE_ACTION_COMMANDS);
    for (const banned of [
      'system.edit',
      'system.delete',
      'system.import',
      'record.deactivate',
      'record.activate',
      'record.assignOwner',
    ]) {
      expect(immutable).not.toContain(banned);
    }
    expect(immutable).toContain('system.new');

    const config = commandsFor('CONFIGURATION', DEFAULT_MODULE_ACTION_COMMANDS);
    expect(config).not.toContain('system.delete');
    expect(config).toContain('record.deactivate');
    expect(config).toContain('system.edit');

    const standard = commandsFor('STANDARD', DEFAULT_MODULE_ACTION_COMMANDS);
    for (const c of [
      'system.delete',
      'system.edit',
      'record.assignOwner',
      'record.deactivate',
      'record.activate',
    ]) {
      expect(standard).toContain(c);
    }
    expect(new Set(standard).size).toBe(standard.length);
  });
});
