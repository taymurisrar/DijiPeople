import {
  parsePackageArtifact,
  type PortableComponent,
} from '../customization/package-artifact';
import type { WorkProfileDefinition } from './work-profile-definition';
import {
  buildWorkProfilePackage,
  planWorkProfileImport,
  referencedUnitKeys,
  workProfilePackageKey,
} from './work-profile-portable';

const definition: WorkProfileDefinition = {
  workTypes: [
    {
      key: 'ward-round',
      name: 'Ward round',
      kind: 'DUTY',
      unitKey: '1st-duty',
      measurementMode: 'COMPLETION',
      standardEffortMinutes: 30,
    },
    {
      key: 'call-handled',
      name: 'Call handled',
      kind: 'TRANSACTION',
      unitKey: 'calls',
      measurementMode: 'QUANTITY',
      standardEffortMinutes: 6,
      complexityBands: [{ key: 'simple', name: 'Simple', multiplier: 1 }],
    },
  ],
};

const units = [
  { key: '1st-duty', name: 'Duty', kind: 'DUTY_COMPLETION' as const },
  { key: 'calls', name: 'Calls', kind: 'COUNT' as const },
];

const build = (def: WorkProfileDefinition = definition) =>
  buildWorkProfilePackage({
    profile: {
      key: 'nurse-ward',
      name: 'Ward nurse',
      description: null,
      version: 3,
      definition: def,
      publishedAt: new Date('2026-11-01T00:00:00.000Z'),
    },
    units,
  });

const components = (serialized: string): PortableComponent[] => {
  const parsed = parsePackageArtifact(serialized);
  expect(parsed.problems).toEqual([]);
  return parsed.artifact!.components;
};

type Doc = {
  components: Array<{
    definition: { definition: { workTypes: Array<Record<string, unknown>> } };
  }>;
};
const parsedDoc = () => JSON.parse(build().serialized) as Doc;

const existingUnits = [
  { key: '1st-duty', kind: 'DUTY_COMPLETION' as const, isActive: true },
  { key: 'calls', kind: 'COUNT' as const, isActive: true },
];

describe('work profile .djpkg export', () => {
  it('is deterministic and round-trips through the artifact reader', () => {
    expect(build().serialized).toBe(build().serialized);
    const parsed = components(build().serialized);
    expect(parsed.map((c) => c.key)).toEqual([
      'workUnit:1st-duty',
      'workUnit:calls',
      'workProfile:nurse-ward',
    ]);
    const profile = parsed[2];
    expect(profile.parentKey).toBeNull();
    expect(profile.dependsOn).toEqual(['workUnit:1st-duty', 'workUnit:calls']);
  });

  it('carries no tenant, row id or timestamp inside a component', () => {
    const text = JSON.stringify(components(build().serialized));
    expect(text).not.toMatch(/tenantId|createdAt|updatedAt|"id"/);
  });

  it('exports only the units the profile references', () => {
    const only = build({ workTypes: [definition.workTypes[1]] });
    expect(components(only.serialized).map((c) => c.key)).toEqual([
      'workUnit:calls',
      'workProfile:nurse-ward',
    ]);
    expect(referencedUnitKeys(definition)).toEqual(['1st-duty', 'calls']);
  });

  it('refuses to export when a referenced unit is missing', () => {
    expect(() =>
      buildWorkProfilePackage({
        profile: {
          key: 'x1',
          name: 'X',
          description: null,
          version: 1,
          definition,
          publishedAt: null,
        },
        units: [],
      }),
    ).toThrow(/does not exist/);
  });

  it('builds a package key a reader accepts for any valid profile key', () => {
    expect(workProfilePackageKey('3-shift.nurse')).toBe('wkp_p3shiftnurse');
  });

  it('is refused by the reader when its definition is tampered with', () => {
    const doc = parsedDoc();
    doc.components[2].definition.definition.workTypes[0].unitKey = 'calls';
    const parsed = parsePackageArtifact(JSON.stringify(doc));
    expect(parsed.artifact).toBeNull();
    expect(parsed.problems.length).toBeGreaterThan(0);
  });

  it('is refused by the reader when the definition is structurally invalid', () => {
    const doc = parsedDoc();
    doc.components[2].definition.definition.workTypes[1].standardEffortMinutes =
      -1;
    expect(parsePackageArtifact(JSON.stringify(doc)).artifact).toBeNull();
  });
});

describe('work profile import plan', () => {
  const parsed = () => components(build().serialized);

  it('creates a missing profile and its missing units', () => {
    const plan = planWorkProfileImport({
      components: parsed(),
      existingUnits: [],
      existingProfiles: [],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.items).toEqual([
      { key: 'workUnit:1st-duty', action: 'create' },
      { key: 'workUnit:calls', action: 'create' },
      { key: 'workProfile:nurse-ward', action: 'create' },
    ]);
  });

  it('is idempotent: the same definition changes nothing', () => {
    const plan = planWorkProfileImport({
      components: parsed(),
      existingUnits,
      existingProfiles: [
        {
          key: 'nurse-ward',
          isActive: true,
          hasDraft: false,
          // Stored JSON key order differs from the package: still equal.
          latestPublishedDefinition: JSON.parse(
            JSON.stringify({ workTypes: [...definition.workTypes] }).replace(
              /"key":"ward-round","name":"Ward round"/,
              '"name":"Ward round","key":"ward-round"',
            ),
          ),
        },
      ],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.items.every((item) => item.action === 'unchanged')).toBe(true);
  });

  it('plans a new version only when the definition changed', () => {
    const plan = planWorkProfileImport({
      components: parsed(),
      existingUnits,
      existingProfiles: [
        {
          key: 'nurse-ward',
          isActive: true,
          hasDraft: false,
          latestPublishedDefinition: { workTypes: [definition.workTypes[0]] },
        },
      ],
    });
    expect(plan.items.find((i) => i.key === 'workProfile:nurse-ward')).toEqual({
      key: 'workProfile:nurse-ward',
      action: 'new-version',
    });
  });

  it('refuses a unit whose kind differs from the tenant unit', () => {
    const plan = planWorkProfileImport({
      components: parsed(),
      existingUnits: [
        { key: 'calls', kind: 'CURRENCY', isActive: true },
        existingUnits[0],
      ],
      existingProfiles: [],
    });
    expect(plan.problems.join(' ')).toMatch(/CURRENCY unit/);
  });

  it('refuses an incompatible unit, an inactive unit, an open draft and an inactive profile', () => {
    const plan = planWorkProfileImport({
      components: parsed(),
      existingUnits: [
        { key: '1st-duty', kind: 'DUTY_COMPLETION', isActive: false },
        existingUnits[1],
      ],
      existingProfiles: [
        {
          key: 'nurse-ward',
          isActive: false,
          hasDraft: true,
          latestPublishedDefinition: null,
        },
      ],
    });
    const text = plan.problems.join(' ');
    expect(text).toMatch(/inactive/);
    // Inactive profile is reported before the draft rule.
    expect(text).toMatch(/profile is inactive/);
    const draft = planWorkProfileImport({
      components: parsed(),
      existingUnits,
      existingProfiles: [
        {
          key: 'nurse-ward',
          isActive: true,
          hasDraft: true,
          latestPublishedDefinition: null,
        },
      ],
    });
    expect(draft.problems.join(' ')).toMatch(/open draft/);
  });

  it('refuses a profile that references a unit nobody has', () => {
    const doc = components(build().serialized).filter(
      (c) => c.key !== 'workUnit:calls',
    );
    const plan = planWorkProfileImport({
      components: doc,
      existingUnits: [existingUnits[0]],
      existingProfiles: [],
    });
    expect(plan.problems.join(' ')).toMatch(/unit "calls" does not exist/);
  });

  it('never accepts a tenantId from the package', () => {
    const tampered = parsed().map((component) =>
      component.type === 'workProfile'
        ? {
            ...component,
            definition: {
              ...component.definition,
              tenantId: 'other-tenant',
            },
          }
        : component,
    );
    const plan = planWorkProfileImport({
      components: tampered,
      existingUnits,
      existingProfiles: [],
    });
    expect(plan.problems.join(' ')).toMatch(/tenantId/);
  });

  it('refuses a package with no profile or with non-work components', () => {
    const none = planWorkProfileImport({
      components: parsed().filter((c) => c.type === 'workUnit'),
      existingUnits,
      existingProfiles: [],
    });
    expect(none.problems.join(' ')).toMatch(/no work profile/);
    const foreign = planWorkProfileImport({
      components: [
        ...parsed(),
        { ...parsed()[0], key: 'table:foo', type: 'table' },
      ],
      existingUnits,
      existingProfiles: [],
    });
    expect(foreign.problems.join(' ')).toMatch(/not a work component/);
  });
});
