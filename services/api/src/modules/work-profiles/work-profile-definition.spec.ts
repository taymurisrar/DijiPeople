import {
  validateUnitCompatibility,
  validateWorkProfileDefinition,
  type WorkProfileDefinition,
} from './work-profile-definition';

/*
 * DP-MASTER/WP-35.S1 acceptance: an administrator configures nurse duties, BPO
 * transactions and developer deliverables with no code; incompatible units and
 * invalid standards are rejected.
 */
const nurse = {
  workTypes: [
    {
      key: 'ward-round',
      name: 'Ward round',
      kind: 'DUTY',
      unitKey: 'duty',
      measurementMode: 'COMPLETION',
      standardEffortMinutes: 45,
    },
    {
      key: 'med-admin',
      name: 'Medication administration',
      kind: 'TRANSACTION',
      unitKey: 'each',
      measurementMode: 'QUANTITY',
      standardEffortMinutes: 4,
    },
  ],
};
const bpo = {
  workTypes: [
    {
      key: 'claim-call',
      name: 'Claim call',
      kind: 'TRANSACTION',
      unitKey: 'each',
      measurementMode: 'QUANTITY',
      standardEffortMinutes: 6,
      complexityBands: [
        { key: 'simple', name: 'Simple', multiplier: 1 },
        { key: 'complex', name: 'Complex', multiplier: 2.5 },
      ],
      quality: { samplePercent: 5, requiresVerification: true },
    },
  ],
};
const developer = {
  workTypes: [
    {
      key: 'feature',
      name: 'Feature delivery',
      kind: 'TASK',
      unitKey: 'hours',
      measurementMode: 'TIMED',
    },
  ],
};
const units = [
  { key: 'duty', kind: 'DUTY_COMPLETION' as const, isActive: true },
  { key: 'each', kind: 'COUNT' as const, isActive: true },
  { key: 'hours', kind: 'DURATION' as const, isActive: true },
];

describe('work profile definitions', () => {
  it.each([
    ['nurse', nurse],
    ['BPO', bpo],
    ['developer', developer],
  ])('accepts the %s profile as configuration alone', (_name, def) => {
    expect(validateWorkProfileDefinition(def)).toEqual([]);
    expect(
      validateUnitCompatibility(def as WorkProfileDefinition, units),
    ).toEqual([]);
  });

  it.each([
    ['not an object', 'x', /must be an object/],
    ['no types', { workTypes: [] }, /at least one/],
    [
      'a bad key',
      { workTypes: [{ ...developer.workTypes[0], key: 'Bad Key' }] },
      /key must be/,
    ],
    [
      'an unknown kind',
      { workTypes: [{ ...developer.workTypes[0], kind: 'MEETING' }] },
      /kind must be/,
    ],
    [
      'a bad measurement mode',
      { workTypes: [{ ...developer.workTypes[0], measurementMode: 'VIBES' }] },
      /measurementMode/,
    ],
    [
      'a standard on timed work',
      { workTypes: [{ ...developer.workTypes[0], standardEffortMinutes: 10 }] },
      /timed work has no standard/,
    ],
    [
      'a zero standard',
      { workTypes: [{ ...nurse.workTypes[1], standardEffortMinutes: 0 }] },
      /above 0/,
    ],
    [
      'a negative multiplier',
      {
        workTypes: [
          {
            ...bpo.workTypes[0],
            complexityBands: [{ key: 'a1', name: 'A', multiplier: -1 }],
          },
        ],
      },
      /multiplier/,
    ],
    [
      'a sample over 100',
      {
        workTypes: [{ ...bpo.workTypes[0], quality: { samplePercent: 150 } }],
      },
      /between 0 and 100/,
    ],
  ])('rejects %s', (_name, def, message) => {
    expect(validateWorkProfileDefinition(def).join(' ')).toMatch(message);
  });

  it('rejects duplicate type keys and duplicate band keys', () => {
    const dup = { workTypes: [developer.workTypes[0], developer.workTypes[0]] };
    expect(validateWorkProfileDefinition(dup).join(' ')).toMatch(/used twice/);
    const bands = {
      workTypes: [
        {
          ...bpo.workTypes[0],
          complexityBands: [
            { key: 'aa', name: 'A', multiplier: 1 },
            { key: 'aa', name: 'B', multiplier: 2 },
          ],
        },
      ],
    };
    expect(validateWorkProfileDefinition(bands).join(' ')).toMatch(
      /used twice/,
    );
  });

  it('never converts between units: timed work in a count unit is refused', () => {
    const bad = {
      workTypes: [{ ...developer.workTypes[0], unitKey: 'each' }],
    } as WorkProfileDefinition;
    expect(validateUnitCompatibility(bad, units).join(' ')).toMatch(
      /TIMED work cannot be measured in a COUNT unit/,
    );
    const missing = {
      workTypes: [{ ...developer.workTypes[0], unitKey: 'nope' }],
    } as WorkProfileDefinition;
    expect(validateUnitCompatibility(missing, units).join(' ')).toMatch(
      /does not exist/,
    );
    const inactive = validateUnitCompatibility(
      developer as WorkProfileDefinition,
      [{ key: 'hours', kind: 'DURATION', isActive: false }],
    );
    expect(inactive.join(' ')).toMatch(/inactive/);
  });
});
