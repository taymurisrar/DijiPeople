import { SecurityAccessLevel } from '@prisma/client';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
} from './rbac-matrix';

const GRANULAR_CUSTOMIZATION_KEYS = [
  'customization.tables.read',
  'customization.tables.update',
  'customization.columns.read',
  'customization.columns.create',
  'customization.columns.update',
  'customization.columns.delete',
  'customization.forms.read',
  'customization.forms.create',
  'customization.forms.update',
  'customization.forms.delete',
];

describe('manager privileges', () => {
  const manager = SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.MANAGER];

  it('never grants DELETE on any entity', () => {
    const deleteGrants = Object.entries(manager)
      .filter(
        ([key, level]) =>
          key.endsWith(':DELETE') && level !== SecurityAccessLevel.NONE,
      )
      .map(([key]) => key);

    expect(deleteGrants).toEqual([]);
  });

  it('grants create, read and write across its operational entities', () => {
    for (const entity of [
      'employees',
      'attendance',
      'timesheets',
      'leave-requests',
      'documents',
      'projects',
      'business-trips',
      'custom-records',
    ]) {
      for (const privilege of ['READ', 'CREATE', 'WRITE']) {
        expect({
          entity,
          privilege,
          level: manager[`${entity}:${privilege}`],
        }).toEqual({
          entity,
          privilege,
          level: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
        });
      }
    }
  });

  it('keeps approval privileges a manager needs to action their team', () => {
    expect(manager['leave-requests:APPROVE']).toBe(
      SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    );
    expect(manager['timesheets:APPROVE']).toBe(
      SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    );
  });

  it('stays inside its business unit hierarchy', () => {
    const widerThanHierarchy = Object.entries(manager).filter(
      ([, level]) =>
        level === SecurityAccessLevel.ORGANIZATION ||
        level === SecurityAccessLevel.TENANT,
    );

    expect(widerThanHierarchy).toEqual([]);
  });
});

describe('customization ownership', () => {
  it('grants table, column and form customization to the customizer role', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.SYSTEM_CUSTOMIZER]).toEqual(
      expect.arrayContaining(GRANULAR_CUSTOMIZATION_KEYS),
    );
  });

  it('grants those keys to no other non-administrator role', () => {
    const administrators = new Set<string>([
      ROLE_KEYS.GLOBAL_ADMIN,
      ROLE_KEYS.SYSTEM_ADMIN,
      ROLE_KEYS.SYSTEM_CUSTOMIZER,
    ]);

    for (const [roleKey, permissions] of Object.entries(
      SYSTEM_ROLE_MISC_PERMISSIONS,
    )) {
      if (administrators.has(roleKey)) continue;

      const leaked = permissions.filter((permission) =>
        GRANULAR_CUSTOMIZATION_KEYS.includes(permission),
      );

      expect({ roleKey, leaked }).toEqual({ roleKey, leaked: [] });
    }
  });

  it('does not give the manager customization privileges', () => {
    const manager = SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.MANAGER];
    const customization = Object.entries(manager).filter(
      ([key, level]) =>
        key.startsWith('customization:') && level !== SecurityAccessLevel.NONE,
    );

    expect(customization).toEqual([]);
  });
});
