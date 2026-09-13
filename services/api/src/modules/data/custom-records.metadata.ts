import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { EntityMetadata } from './entity-query.types';

/*
 * The one permission and row-scope definition every custom module shares.
 *
 * Custom modules are authorized as a family through the existing
 * `custom-records` entity (ExecPlan EXECPLAN-0046, "Permission / RBAC
 * impact"): the legacy keys below are not catalog entries but are derived per
 * role privilege as `${entityKey}.${privilege}` in `auth-access.service.ts`, so
 * holding the matrix privilege and holding the key are the same grant. Kept in
 * its own file so the record service and the runtime metadata service can both
 * import it without importing each other.
 */
export const CUSTOM_RECORDS_METADATA: EntityMetadata = {
  logicalName: 'custom-records',
  prismaModel: 'customDataRecord',
  rbacEntityKey: ENTITY_KEYS.CUSTOM_RECORDS,
  primaryKey: 'id',
  permissions: {
    read: 'custom-records.read',
    create: 'custom-records.create',
    update: 'custom-records.write',
    delete: 'custom-records.delete',
  },
  tenantScoped: true,
  businessUnitScoped: true,
  scope: {
    tenantIdField: 'tenantId',
    businessUnitIdField: 'businessUnitId',
    organizationIdField: 'organizationId',
    ownerUserIdField: 'ownerUserId',
    ownerTeamIdField: 'ownerTeamId',
    createdByIdField: 'createdById',
  },
  defaultSelect: ['id'],
  defaultOrderBy: [{ field: 'createdAt', direction: 'desc' }],
  fields: {},
  expands: {},
};

export const CUSTOM_RECORDS_PERMISSION_KEYS = {
  READ: 'custom-records.read',
  CREATE: 'custom-records.create',
  WRITE: 'custom-records.write',
  DELETE: 'custom-records.delete',
} as const;
