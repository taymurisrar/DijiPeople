import { SecurityPrivilege } from '@prisma/client';

export type EntityFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export type EntityFieldMetadata = {
  type: EntityFieldType;
  prismaField?: string;
  selectable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  searchable?: boolean;
};

export type EntityExpandMetadata = {
  relation: string;
  maxDepth: number;
  selectableFields: string[];
};

export type EntityOrderByMetadata = {
  field: string;
  direction: 'asc' | 'desc';
};

export type EntityPermissionMetadata = {
  read: string;
  create?: string;
  update?: string;
  delete?: string;
  assign?: string;
  share?: string;
  import?: string;
  export?: string;
};

export type EntityScopeMetadata = {
  tenantIdField?: string;
  businessUnitIdField?: string;
  organizationIdField?: string | null;
  userIdField?: string;
  ownerUserIdField?: string;
  ownerTeamIdField?: string;
  createdByIdField?: string;
};

export type EntityMetadata = {
  logicalName: string;
  prismaModel: string;
  rbacEntityKey: string;
  primaryKey: string;
  permissions: EntityPermissionMetadata;
  tenantScoped: boolean;
  businessUnitScoped: boolean;
  scope: EntityScopeMetadata;
  defaultSelect: string[];
  defaultOrderBy: EntityOrderByMetadata[];
  fields: Record<string, EntityFieldMetadata>;
  expands: Record<string, EntityExpandMetadata>;
};

export type EntityQueryParams = Record<
  string,
  string | string[] | undefined
>;

export type EntityFilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'isnull'
  | 'isnotnull';

export type EntityFilterExpression = {
  field: string;
  operator: EntityFilterOperator;
  value?: string | string[];
};

export type EntityExpandQuery = {
  relation: string;
  select: string[];
};

export type ParsedEntityQuery = {
  select: string[];
  filters: EntityFilterExpression[];
  orderBy: EntityOrderByMetadata[];
  expand: EntityExpandQuery[];
  search?: string;
  page: number;
  pageSize: number;
  count: boolean;
};

export type ValidatedEntityQuery = ParsedEntityQuery;

export type EntityDataRequestContext = {
  user: {
    userId: string;
    tenantId: string;
    permissionKeys: string[];
    rolePrivileges?: Array<{
      entityKey: string;
      privilege: SecurityPrivilege;
      accessLevel: string;
      roleId: string;
    }>;
    accessContext?: {
      businessUnitId: string;
      organizationId: string;
      teamIds: string[];
      accessibleBusinessUnitIds: string[];
      businessUnitSubtreeIds: string[];
    };
  };
};

export type EntityDataResponse<T = Record<string, unknown>> = {
  items: T[];
  meta: {
    entityLogicalName: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    selectedFields: string[];
    expanded: string[];
  };
};
