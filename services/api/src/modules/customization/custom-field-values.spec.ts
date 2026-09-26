import {
  customFieldDefinitions,
  secureCustomFieldValues,
  validateCustomFieldInput,
  validateCustomFieldValue,
  type CustomFieldColumn,
} from './custom-field-values';

/*
 * TASK-0034 / BUG-3697 — the one set of value rules custom modules and system
 * modules' custom fields both use.
 */

const column = (overrides: Partial<CustomFieldColumn> = {}): CustomFieldColumn => ({
  columnKey: 'mis_grade',
  displayName: 'Grade',
  dataType: 'text',
  isActive: true,
  isVisible: true,
  isReadOnly: false,
  isRequired: false,
  isPrimaryName: false,
  maxLength: null,
  defaultValue: null,
  optionSetJson: null,
  validationJson: null,
  lookupTargetTableKey: null,
  minValue: null,
  maxValue: null,
  ...overrides,
});

describe('validateCustomFieldValue', () => {
  it('accepts empty values, which clear the field', () => {
    for (const value of [null, undefined, '']) {
      expect(validateCustomFieldValue(column({ dataType: 'number' }), value)).toBeNull();
    }
  });

  it('checks numbers, whole numbers and bounds', () => {
    const grade = column({ dataType: 'number', minValue: '1', maxValue: '10' });
    expect(validateCustomFieldValue(grade, '5')).toBe('Must be a number.');
    expect(validateCustomFieldValue(grade, 2.5)).toBe('Must be a whole number.');
    expect(validateCustomFieldValue(grade, 0)).toBe('Must be at least 1.');
    expect(validateCustomFieldValue(grade, 11)).toBe('Must be at most 10.');
    expect(validateCustomFieldValue(grade, 7)).toBeNull();
    expect(validateCustomFieldValue(column({ dataType: 'decimal' }), 2.5)).toBeNull();
  });

  it('keeps a choice to its options', () => {
    const level = column({ dataType: 'select', optionSetJson: [{ value: 'A', label: 'Senior' }, 'B'] });
    expect(validateCustomFieldValue(level, 'A')).toBeNull();
    expect(validateCustomFieldValue(level, 'B')).toBeNull();
    expect(validateCustomFieldValue(level, 'Z')).toBe('Not a choice for this field.');
    const tags = column({ dataType: 'multiselect', optionSetJson: { options: ['x', 'y'] } });
    expect(validateCustomFieldValue(tags, ['x', 'y'])).toBeNull();
    expect(validateCustomFieldValue(tags, ['x', 'q'])).toBe('Not a choice for this field: q.');
    expect(validateCustomFieldValue(tags, 'x')).toBe('Must be a list of choices.');
  });

  it('checks booleans, dates, email, URL and length', () => {
    expect(validateCustomFieldValue(column({ dataType: 'boolean' }), 'yes')).toBe('Must be yes or no.');
    expect(validateCustomFieldValue(column({ dataType: 'date' }), 'not a date')).toBe('Must be a valid date.');
    expect(validateCustomFieldValue(column({ dataType: 'email' }), 'a@b')).toBe('Must be an email address.');
    expect(validateCustomFieldValue(column({ dataType: 'email' }), 'a@b.co')).toBeNull();
    expect(validateCustomFieldValue(column({ dataType: 'url' }), 'ftp://x')).toBe('Must be an http or https URL.');
    expect(validateCustomFieldValue(column({ maxLength: 3 }), 'abcd')).toBe('Must not exceed 3 characters.');
    expect(validateCustomFieldValue(column(), 42)).toBe('Must be text.');
  });
});

describe('validateCustomFieldInput', () => {
  it('ignores unknown and hidden fields rather than failing on them', () => {
    const result = validateCustomFieldInput({
      columns: [column(), column({ columnKey: 'mis_hidden', isVisible: false })],
      values: { mis_grade: 'A', mis_hidden: 'x', nope: 1 },
      permissionKeys: [],
      mode: 'update',
    });
    expect(result).toEqual({ values: { mis_grade: 'A' }, errors: {} });
  });

  it('refuses read-only fields and fields whose write permission the user lacks', () => {
    const result = validateCustomFieldInput({
      columns: [
        column({ isReadOnly: true }),
        column({ columnKey: 'mis_salaryBand', validationJson: { writePermission: 'payroll.manage' } }),
      ],
      values: { mis_grade: 'A', mis_salaryBand: 'B2' },
      permissionKeys: ['employees.update'],
      mode: 'update',
    });
    expect(result.errors).toEqual({ mis_grade: ['Field is read-only.'], mis_salaryBand: ['Field is read-only.'] });
  });

  it('enforces required fields and applies defaults on create only', () => {
    const columns = [column({ isRequired: true }), column({ columnKey: 'mis_band', defaultValue: 'B' })];
    expect(validateCustomFieldInput({ columns, values: {}, permissionKeys: [], mode: 'create' })).toEqual({
      values: { mis_band: 'B' },
      errors: { mis_grade: ['Field is required.'] },
    });
    expect(validateCustomFieldInput({ columns, values: {}, permissionKeys: [], mode: 'update' })).toEqual({
      values: {},
      errors: {},
    });
  });
});

describe('secureCustomFieldValues and definitions', () => {
  const columns = [
    column(),
    column({ columnKey: 'mis_nationalId', validationJson: { mask: true } }),
    column({ columnKey: 'mis_salaryBand', validationJson: { readPermission: 'payroll.read', writePermission: 'payroll.manage' } }),
  ];

  it('hides fields the user may not read, masks masked ones, and fills unset ones with null', () => {
    expect(
      secureCustomFieldValues({ columns, values: { mis_nationalId: '4210112345671', mis_salaryBand: 'B2' }, permissionKeys: [] }),
    ).toEqual({ mis_grade: null, mis_nationalId: '********5671' });
  });

  it('describes fields as the custom-module form does, read-only where write is not allowed', () => {
    const definitions = customFieldDefinitions({ columns, permissionKeys: ['payroll.read'] });
    expect(definitions.map((entry) => [entry.logicalName, entry.readOnly])).toEqual([
      ['mis_grade', false],
      ['mis_nationalId', false],
      ['mis_salaryBand', true],
    ]);
  });
});
