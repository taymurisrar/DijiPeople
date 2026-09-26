import {
  CustomizationEnvironmentVariableType,
  CustomizationFieldDataType,
  CustomizationFormType,
  ModuleViewType,
  ModuleViewVisibilityScope,
} from '@prisma/client';
import {
  DEFINITION_ENUMS,
  buildPackageArtifact,
  bumpVersion,
  canonicalJson,
  compareSemver,
  findPackageDependencyCycle,
  orderComponents,
  PACKAGE_ARTIFACT_MAX_BYTES,
  parsePackageArtifact,
  parseSemver,
  satisfiesVersionRange,
  type PackageManifest,
  type PortableComponentInput,
} from './package-artifact';

/*
 * TASK-0033 — the artifact is the contract between environments. These tests
 * pin the three properties every other part of the import relies on:
 * determinism, integrity, and refusing what this reader cannot trust.
 */

/* An exported artifact as the tests edit it: loosely, like a hand-edited file. */
type ArtifactDocument = {
  formatVersion: unknown;
  contentChecksum: unknown;
  manifest: Record<string, unknown> & { componentCount: number };
  components: Array<
    Record<string, unknown> & {
      definition: Record<string, unknown>;
      layer: unknown;
      type: unknown;
    }
  >;
};
const parseDocument = (text: string) => JSON.parse(text) as ArtifactDocument;

const manifest = (
  overrides: Partial<
    Omit<PackageManifest, 'componentCount' | 'signature'>
  > = {},
): Omit<PackageManifest, 'componentCount' | 'signature'> => ({
  packageKey: 'mis_customizations',
  displayName: 'MIS Customizations',
  description: null,
  version: '1.2.0',
  publisher: { publisherKey: 'mis', displayName: 'MIS', prefix: 'mis' },
  metadataSchemaVersion: '1.0.0',
  sourceEnvironmentType: 'DEVELOPMENT',
  releasedAt: null,
  dependencies: [],
  coreDependencies: [],
  ...overrides,
});

const table = (tableKey = 'misAsset'): PortableComponentInput => ({
  key: `table:${tableKey}`,
  type: 'table',
  objectKey: tableKey,
  parentKey: null,
  layerAction: 'create',
  baseIsSystem: false,
  definition: {
    tableKey,
    displayName: 'Asset',
    pluralDisplayName: 'Assets',
    systemName: 'MisAsset',
  },
  layer: null,
  dependsOn: [],
});

const column = (
  tableKey: string,
  columnKey: string,
  extra: Partial<PortableComponentInput> = {},
): PortableComponentInput => ({
  key: `column:${tableKey}.${columnKey}`,
  type: 'column',
  objectKey: `${tableKey}.${columnKey}`,
  parentKey: tableKey,
  layerAction: 'create',
  baseIsSystem: false,
  definition: {
    columnKey,
    displayName: 'Grade',
    dataType: 'text',
    fieldType: 'text',
  },
  layer: null,
  dependsOn: [`table:${tableKey}`],
  ...extra,
});

const form = (
  tableKey: string,
  formKey: string,
  fields: string[],
): PortableComponentInput => ({
  key: `form:${tableKey}.${formKey}`,
  type: 'form',
  objectKey: `${tableKey}.${formKey}`,
  parentKey: tableKey,
  layerAction: 'create',
  baseIsSystem: false,
  definition: {
    formKey,
    name: 'Main',
    type: 'main',
    type: 'main',
    layoutJson: {
      tabs: [
        { sections: [{ fields: fields.map((columnKey) => ({ columnKey })) }] },
      ],
    },
  },
  layer: null,
  dependsOn: [
    `table:${tableKey}`,
    ...fields.map((field) => `column:${tableKey}.${field}`),
  ],
});

const sample = () => [
  form('misAsset', 'main', ['mis_grade']),
  column('misAsset', 'mis_grade'),
  table('misAsset'),
];

describe('canonical serialization', () => {
  it('produces the same bytes whatever the key order', () => {
    expect(
      canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    ).toBe(canonicalJson({ a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 }));
  });

  it('drops undefined members and refuses non-finite numbers', () => {
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
  });
});

describe('buildPackageArtifact', () => {
  it('is deterministic: the same package exported twice is byte-identical', () => {
    const first = buildPackageArtifact({
      manifest: manifest(),
      components: sample(),
    });
    const second = buildPackageArtifact({
      manifest: manifest(),
      components: [...sample()].reverse(),
    });
    expect(second.serialized).toBe(first.serialized);
    expect(second.artifact.contentChecksum).toBe(
      first.artifact.contentChecksum,
    );
  });

  it('orders a module before its fields and fields before the forms that use them', () => {
    const { artifact } = buildPackageArtifact({
      manifest: manifest(),
      components: sample(),
    });
    expect(artifact.components.map((component) => component.key)).toEqual([
      'table:misAsset',
      'column:misAsset.mis_grade',
      'form:misAsset.main',
    ]);
  });

  it('changes the checksum when content changes', () => {
    const before = buildPackageArtifact({
      manifest: manifest(),
      components: sample(),
    });
    const changed = sample();
    changed[1] = column('misAsset', 'mis_grade', {
      definition: {
        columnKey: 'mis_grade',
        displayName: 'Grade Level',
        dataType: 'text',
        fieldType: 'text',
      },
    });
    const after = buildPackageArtifact({
      manifest: manifest(),
      components: changed,
    });
    expect(after.artifact.contentChecksum).not.toBe(
      before.artifact.contentChecksum,
    );
  });

  it('refuses to export anything that looks like a credential', () => {
    const components = sample();
    components[2] = {
      ...table('misAsset'),
      layer: { connection: { apiKey: 'abc' } },
    };
    expect(() =>
      buildPackageArtifact({ manifest: manifest(), components }),
    ).toThrow(/looks like a credential/);
  });

  it('never writes a timestamp or database id into a component', () => {
    const { serialized } = buildPackageArtifact({
      manifest: manifest(),
      components: sample(),
    });
    expect(serialized).not.toMatch(
      /"(id|tenantId|createdAt|updatedAt|objectId|tableId)":/,
    );
  });
});

describe('orderComponents', () => {
  it('tolerates a schema cycle: two modules that look each other up', () => {
    const a = table('misA');
    const b = table('misB');
    const aToB = column('misA', 'misB', {
      dependsOn: ['table:misA', 'table:misB'],
    });
    const bToA = column('misB', 'misA', {
      dependsOn: ['table:misB', 'table:misA'],
    });
    const ordered = orderComponents([bToA, aToB, b, a]).map(
      (component) => component.key,
    );
    expect(ordered.slice(0, 2).sort()).toEqual(['table:misA', 'table:misB']);
    expect(ordered).toHaveLength(4);
  });

  it('breaks a true cycle deterministically instead of looping', () => {
    const x = { key: 'view:t.x', type: 'view', dependsOn: ['view:t.y'] };
    const y = { key: 'view:t.y', type: 'view', dependsOn: ['view:t.x'] };
    expect(orderComponents([y, x]).map((item) => item.key)).toEqual([
      'view:t.x',
      'view:t.y',
    ]);
    expect(orderComponents([x, y]).map((item) => item.key)).toEqual([
      'view:t.x',
      'view:t.y',
    ]);
  });
});

describe('parsePackageArtifact', () => {
  const valid = () =>
    buildPackageArtifact({ manifest: manifest(), components: sample() })
      .serialized;

  it('round-trips an exported package', () => {
    const serialized = valid();
    const parsed = parsePackageArtifact(serialized);
    expect(parsed.problems).toEqual([]);
    expect(canonicalJson(parsed.artifact)).toBe(serialized);
  });

  it('detects a component edited after export', () => {
    const document = parseDocument(valid());
    document.components[1].definition.dataType = 'number';
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.artifact).toBeNull();
    expect(parsed.problems[0].message).toMatch(/does not match its checksum/);
  });

  it('detects a tampered package checksum', () => {
    const document = parseDocument(valid());
    document.contentChecksum = 'a'.repeat(64);
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /checksum does not match its content/,
    );
  });

  it('refuses a format version it cannot read, and names both versions', () => {
    const document = parseDocument(valid());
    document.formatVersion = 4;
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems[0].message).toBe(
      'This package uses format version 4. This DijiPeople environment reads format 1.',
    );
  });

  it('refuses a corrupted file', () => {
    const parsed = parsePackageArtifact(valid().slice(0, 200));
    expect(parsed.problems[0].message).toMatch(/not valid JSON/);
  });

  it('refuses an oversized file before parsing it', () => {
    const parsed = parsePackageArtifact(
      Buffer.alloc(PACKAGE_ARTIFACT_MAX_BYTES + 1, 32),
    );
    expect(parsed.problems[0].message).toMatch(/limited to 5 MB/);
  });

  it('refuses prototype-pollution keys', () => {
    const parsed = parsePackageArtifact(
      '{"formatVersion":1,"manifest":{"__proto__":{"x":1}}}',
    );
    expect(parsed.problems[0].message).toMatch(
      /reserved property name "__proto__"/,
    );
  });

  it('refuses excessive nesting', () => {
    let nested = '1';
    for (let index = 0; index < 40; index += 1) nested = `[${nested}]`;
    const parsed = parsePackageArtifact(`{"formatVersion":1,"x":${nested}}`);
    expect(parsed.problems[0].message).toMatch(/nested too deeply/);
  });

  function rebuilt(
    mutate: (components: PortableComponentInput[]) => void,
    overrides = {},
  ) {
    /* Build honestly with a mutation, so only the rule under test can fail. */
    const components = sample();
    mutate(components);
    const { artifact } = buildPackageArtifact({
      manifest: manifest(overrides),
      components,
    });
    return parsePackageArtifact(JSON.stringify(artifact));
  }

  it('refuses a reserved publisher prefix', () => {
    const parsed = rebuilt(() => undefined, {
      packageKey: 'dp_customizations',
      publisher: { publisherKey: 'dp', displayName: 'Impostor', prefix: 'dp' },
    });
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /reserved for DijiPeople/,
    );
  });

  it('refuses a created field that does not carry the publisher prefix', () => {
    const parsed = rebuilt((components) => {
      components[1] = column('misAsset', 'abc_grade');
      components[0] = form('misAsset', 'main', ['abc_grade']);
    });
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /does not use its prefix mis_/,
    );
  });

  it('refuses a package that would create a DijiPeople Core component', () => {
    const parsed = rebuilt((components) => {
      components.push(column('employees', 'mis_grade', { baseIsSystem: true }));
    });
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /system components can only be extended/,
    );
  });

  it('refuses duplicate logical identifiers', () => {
    const document = parseDocument(valid());
    document.components.push(document.components[1]);
    document.manifest.componentCount += 1;
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /appears more than once/,
    );
  });

  it('refuses a component type this environment does not support', () => {
    const document = parseDocument(valid());
    document.components[0].type = 'plugin';
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems[0].message).toMatch(
      /Component type plugin is not supported/,
    );
  });

  it('refuses a package that carries a credential', () => {
    const document = parseDocument(valid());
    document.components[2].layer = { password: 'hunter2' };
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /Packages never carry secrets/,
    );
  });

  it('refuses a signed package rather than pretending to verify it', () => {
    const document = parseDocument(valid());
    document.manifest.signature = 'abc';
    const parsed = parsePackageArtifact(JSON.stringify(document));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /Signed packages are not supported/,
    );
  });

  it('refuses a package that depends on itself', () => {
    const parsed = rebuilt(() => undefined, {
      dependencies: [
        {
          packageKey: 'mis_customizations',
          publisherKey: 'mis',
          displayName: null,
          minVersion: '1.0.0',
          maxVersion: null,
        },
      ],
    });
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /cannot depend on itself/,
    );
  });
});

describe('semantic versions', () => {
  it('parses strictly', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('1.2.0-beta')).toBeNull();
    expect(parseSemver('01.2.3')).toBeNull();
  });

  it('compares numerically, not lexically', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
    expect(compareSemver('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it('checks version ranges', () => {
    expect(satisfiesVersionRange('2.7.0', '2.5.0')).toBe(true);
    expect(satisfiesVersionRange('1.1.0', '1.2.0')).toBe(false);
    expect(satisfiesVersionRange('3.1.0', '2.0.0', '3.0.0')).toBe(false);
  });

  it('bumps', () => {
    expect(bumpVersion('1.2.3')).toBe('1.2.4');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });
});

describe('findPackageDependencyCycle', () => {
  it('finds a package dependency loop and names it', () => {
    const cycle = findPackageDependencyCycle(
      new Map([
        ['misA', ['misB']],
        ['misB', ['mis_c']],
        ['mis_c', ['misA']],
      ]),
    );
    expect(cycle).toEqual(['misA', 'misB', 'mis_c', 'misA']);
  });

  it('accepts a diamond, which is not a cycle', () => {
    expect(
      findPackageDependencyCycle(
        new Map([
          ['mis_app', ['mis_hr', 'mis_pay']],
          ['mis_hr', ['mis_core']],
          ['mis_pay', ['mis_core']],
        ]),
      ),
    ).toBeNull();
  });
});

describe('definition values (untrusted input that becomes rows)', () => {
  it('mirrors every Prisma enum a definition can carry', () => {
    expect([...DEFINITION_ENUMS.fieldType].sort()).toEqual(
      Object.values(CustomizationFieldDataType).sort(),
    );
    expect([...DEFINITION_ENUMS.formType].sort()).toEqual(
      Object.values(CustomizationFormType).sort(),
    );
    expect([...DEFINITION_ENUMS.viewType].sort()).toEqual(
      Object.values(ModuleViewType).sort(),
    );
    expect([...DEFINITION_ENUMS.visibilityScope].sort()).toEqual(
      Object.values(ModuleViewVisibilityScope).sort(),
    );
    expect([...DEFINITION_ENUMS.variableType].sort()).toEqual(
      Object.values(CustomizationEnvironmentVariableType).sort(),
    );
  });

  it('refuses a field type this environment cannot store', () => {
    const components = sample();
    components[1] = column('misAsset', 'mis_grade', {
      definition: {
        columnKey: 'mis_grade',
        displayName: 'Grade',
        dataType: 'hologram',
      },
    });
    const { artifact } = buildPackageArtifact({
      manifest: manifest(),
      components,
    });
    const parsed = parsePackageArtifact(JSON.stringify(artifact));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /dataType "hologram" is not supported/,
    );
  });

  it('refuses a definition whose key disagrees with its identity', () => {
    const components = sample();
    components[1] = column('misAsset', 'mis_grade', {
      definition: {
        columnKey: 'mis_other',
        displayName: 'Grade',
        dataType: 'text',
      },
    });
    const { artifact } = buildPackageArtifact({
      manifest: manifest(),
      components,
    });
    const parsed = parsePackageArtifact(JSON.stringify(artifact));
    expect(parsed.problems.map((problem) => problem.message).join()).toMatch(
      /field key does not match/,
    );
  });
});
