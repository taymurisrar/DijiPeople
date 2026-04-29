import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { EntityMetadata } from './entity-query.types';

export const ENTITY_REGISTRY = {
  employees: {
    logicalName: 'employees',
    prismaModel: 'employee',
    rbacEntityKey: ENTITY_KEYS.EMPLOYEES,
    primaryKey: 'id',
    permissions: {
      read: 'employees.read',
      create: 'employees.create',
      update: 'employees.update',
      delete: 'employees.delete',
      assign: 'employees.assign',
      share: 'employees.share',
      import: 'employees.import',
      export: 'employees.export',
    },
    tenantScoped: true,
    businessUnitScoped: true,
    scope: {
      tenantIdField: 'tenantId',
      businessUnitIdField: 'businessUnitId',
      organizationIdField: null,
      userIdField: 'userId',
    },
    defaultSelect: [
      'id',
      'firstName',
      'lastName',
      'email',
      'employeeCode',
      'employmentStatus',
    ],
    defaultOrderBy: [{ field: 'firstName', direction: 'asc' }],
    fields: {
      id: { type: 'string', selectable: true, filterable: true },
      firstName: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
        searchable: true,
      },
      lastName: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
        searchable: true,
      },
      email: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
        searchable: true,
      },
      phone: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
        searchable: true,
      },
      employeeCode: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
        searchable: true,
      },
      employmentStatus: {
        type: 'enum',
        selectable: true,
        filterable: true,
        sortable: true,
      },
      hireDate: {
        type: 'date',
        selectable: true,
        filterable: true,
        sortable: true,
      },
      managerEmployeeId: {
        type: 'string',
        selectable: true,
        filterable: true,
        sortable: true,
      },
      taxIdentifier: {
        type: 'string',
        selectable: false,
        filterable: false,
        sortable: false,
        searchable: false,
      },
    },
    expands: {
      manager: {
        relation: 'manager',
        maxDepth: 1,
        selectableFields: [
          'id',
          'firstName',
          'lastName',
          'employeeCode',
          'email',
        ],
      },
    },
  },
} as const satisfies Record<string, EntityMetadata>;

export type EntityLogicalName = keyof typeof ENTITY_REGISTRY;

export function getEntityMetadata(logicalName: string) {
  return ENTITY_REGISTRY[logicalName as EntityLogicalName] ?? null;
}

export function listEntityMetadata() {
  return Object.values(ENTITY_REGISTRY);
}
