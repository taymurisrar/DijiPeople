import {
  componentChecksum,
  type PortableComponent,
  type PortableComponentInput,
} from './package-artifact';
import { comparePackageToTarget, type TargetEntry } from './package-comparison';

/*
 * TASK-0033 — every status the import plan can show, and the rule behind it.
 * The import never overwrites what it does not own, and never makes a change
 * that would destroy stored data, even to its own components.
 */

const withChecksum = (
  component: PortableComponentInput,
): PortableComponent => ({
  ...component,
  checksum: componentChecksum(component),
});

const column = (
  columnKey: string,
  definition: Record<string, unknown> = {},
  extra: Partial<PortableComponentInput> = {},
): PortableComponentInput => ({
  key: `column:mis_asset.${columnKey}`,
  type: 'column',
  objectKey: `mis_asset.${columnKey}`,
  parentKey: 'mis_asset',
  layerAction: 'create',
  baseIsSystem: false,
  definition: {
    columnKey,
    displayName: 'Grade',
    dataType: 'text',
    fieldType: 'text',
    lookupTargetTableKey: null,
    ...definition,
  },
  layer: null,
  dependsOn: ['table:mis_asset'],
  ...extra,
});

const tableEntry: TargetEntry = {
  ownerKind: 'package',
  ownerPackageKey: 'mis_customizations',
  ownerPackageName: 'MIS Customizations',
  ownedByImportingPackage: true,
  current: null,
  installedChecksum: null,
  definition: null,
};

const entry = (overrides: Partial<TargetEntry>): TargetEntry => ({
  ownerKind: 'package',
  ownerPackageKey: 'mis_customizations',
  ownerPackageName: 'MIS Customizations',
  ownedByImportingPackage: true,
  current: null,
  installedChecksum: null,
  definition: null,
  ...overrides,
});

function compare(
  components: PortableComponentInput[],
  target: Record<string, TargetEntry>,
  ownedByPackageInTarget: string[] = [],
) {
  return comparePackageToTarget({
    components: components.map(withChecksum),
    target: new Map(
      Object.entries({ 'table:mis_asset': tableEntry, ...target }),
    ),
    ownedByPackageInTarget,
  });
}

describe('comparePackageToTarget', () => {
  it('NEW — a component the target does not have', () => {
    const result = compare([column('mis_grade')], {});
    expect(result.items[0]).toMatchObject({
      status: 'NEW',
      apply: 'create',
      blocking: false,
    });
  });

  it('MATCHING — importing the same content again changes nothing (idempotency)', () => {
    const grade = column('mis_grade');
    const result = compare([grade], {
      'column:mis_asset.mis_grade': entry({
        current: grade,
        installedChecksum: componentChecksum(grade),
        definition: grade.definition,
      }),
    });
    expect(result.items[0]).toMatchObject({
      status: 'MATCHING',
      apply: 'none',
    });
    expect(result.blocking).toBe(false);
  });

  it('UPDATE — the package owns it and the new version changed it', () => {
    const before = column('mis_grade');
    const after = column('mis_grade', { displayName: 'Grade Level' });
    const result = compare([after], {
      'column:mis_asset.mis_grade': entry({
        current: before,
        installedChecksum: componentChecksum(before),
        definition: before.definition,
      }),
    });
    expect(result.items[0]).toMatchObject({
      status: 'UPDATE',
      apply: 'update',
      changedFields: ['displayName'],
    });
  });

  it('TARGET_MODIFIED — someone changed it here after it was installed', () => {
    const installed = column('mis_grade');
    const locallyEdited = column('mis_grade', { displayName: 'Edited here' });
    const incoming = column('mis_grade', { displayName: 'Grade Level' });
    const result = compare([incoming], {
      'column:mis_asset.mis_grade': entry({
        current: locallyEdited,
        installedChecksum: componentChecksum(installed),
        definition: locallyEdited.definition,
      }),
    });
    expect(result.items[0]).toMatchObject({
      status: 'TARGET_MODIFIED',
      apply: 'update',
      blocking: false,
    });
    expect(result.items[0].messages[0]).toMatch(
      /changed in this workspace after it was installed/,
    );
  });

  it("CONFLICT — changing a field type is destructive, even in the package's own upgrade", () => {
    const installed = column('mis_grade', {
      dataType: 'number',
      fieldType: 'number',
    });
    const incoming = column('mis_grade');
    const result = compare([incoming], {
      'column:mis_asset.mis_grade': entry({
        current: installed,
        definition: installed.definition,
      }),
    });
    expect(result.items[0]).toMatchObject({
      status: 'CONFLICT',
      apply: 'none',
      blocking: true,
    });
    expect(result.items[0].messages[0]).toBe(
      "Cannot update field mis_asset.mis_grade. Source type is text, target type is number. Changing a field's type would be destructive.",
    );
  });

  it('CONFLICT — a lookup that points somewhere else here', () => {
    const installed = column('mis_owner', {
      dataType: 'lookup',
      fieldType: 'lookup',
      lookupTargetTableKey: 'employees',
    });
    const incoming = column('mis_owner', {
      dataType: 'lookup',
      fieldType: 'lookup',
      lookupTargetTableKey: 'departments',
    });
    const result = compare([incoming], {
      'column:mis_asset.mis_owner': entry({
        current: installed,
        definition: installed.definition,
      }),
    });
    expect(result.items[0].status).toBe('CONFLICT');
    expect(result.items[0].messages[0]).toMatch(
      /looks up departments in the package but employees here/,
    );
  });

  it('CONFLICT — the same logical name belongs to another package here', () => {
    const result = compare([column('mis_grade')], {
      'column:mis_asset.mis_grade': entry({
        ownerPackageKey: 'abc_hr',
        ownerPackageName: 'ABC HR Extensions',
        ownedByImportingPackage: false,
      }),
    });
    expect(result.items[0]).toMatchObject({
      status: 'CONFLICT',
      blocking: true,
    });
    expect(result.items[0].messages[0]).toMatch(/belongs to ABC HR Extensions/);
  });

  it('CONFLICT — a package may extend DijiPeople Core but never replace it', () => {
    const result = compare([column('mis_grade')], {
      'column:mis_asset.mis_grade': entry({
        ownerKind: 'core',
        ownerPackageKey: null,
        ownerPackageName: 'DijiPeople Core',
        ownedByImportingPackage: false,
      }),
    });
    expect(result.items[0].messages[0]).toMatch(/never replace it/);
  });

  it('MISSING_DEPENDENCY — needs something neither shipped nor present', () => {
    const result = compare(
      [
        column(
          'mis_dept',
          {},
          { dependsOn: ['table:mis_asset', 'table:departments'] },
        ),
      ],
      {},
    );
    expect(result.items[0]).toMatchObject({
      status: 'MISSING_DEPENDENCY',
      blocking: true,
    });
    expect(result.items[0].messages[0]).toMatch(/requires module departments/);
  });

  it('a Core extension over a component the target lacks is INCOMPATIBLE', () => {
    const layer: PortableComponentInput = {
      key: 'form:employees.main',
      type: 'form',
      objectKey: 'employees.main',
      parentKey: 'employees',
      layerAction: 'modify',
      baseIsSystem: true,
      definition: null,
      layer: { tabs: [] },
      dependsOn: [],
    };
    const result = compare([layer], {});
    expect(result.items[0]).toMatchObject({
      status: 'INCOMPATIBLE',
      blocking: true,
    });
  });

  it('a first-time Core extension is NEW, and the core form itself is untouched', () => {
    const layer: PortableComponentInput = {
      key: 'form:employees.main',
      type: 'form',
      objectKey: 'employees.main',
      parentKey: 'employees',
      layerAction: 'modify',
      baseIsSystem: true,
      definition: null,
      layer: { tabs: [] },
      dependsOn: [],
    };
    const result = compare([layer], {
      'form:employees.main': entry({
        ownerKind: 'core',
        ownerPackageKey: null,
        ownedByImportingPackage: false,
        definition: { formKey: 'main' },
      }),
    });
    expect(result.items[0]).toMatchObject({ status: 'NEW', apply: 'create' });
  });

  it('a removal of something absent is SKIPPED, not an error', () => {
    const removal: PortableComponentInput = {
      ...column('mis_old'),
      layerAction: 'remove',
      definition: null,
    };
    const result = compare([removal], {});
    expect(result.items[0]).toMatchObject({
      status: 'SKIPPED',
      blocking: false,
    });
  });

  it('reports components removed from the source but never deletes them', () => {
    const result = compare([column('mis_grade')], {}, [
      'column:mis_asset.mis_grade',
      'view:mis_asset.old',
    ]);
    expect(result.removedFromSource).toEqual([
      { key: 'view:mis_asset.old', type: 'view', objectKey: 'mis_asset.old' },
    ]);
    expect(
      result.items.every((item) => item.apply !== ('delete' as string)),
    ).toBe(true);
    expect(result.summary.REMOVED_FROM_SOURCE).toBe(1);
  });

  it('counts every status and blocks on any blocking item', () => {
    const result = compare(
      [
        column('mis_grade'),
        column('mis_dept', {}, { dependsOn: ['table:nowhere'] }),
      ],
      {},
    );
    expect(result.summary).toMatchObject({ NEW: 1, MISSING_DEPENDENCY: 1 });
    expect(result.blocking).toBe(true);
  });
});
