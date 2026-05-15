export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "INVITED";

export type UserListItem = {
  id: string;
  userId?: string;

  tenantId?: string;
  businessUnitId: string;
  businessUnit?: {
    id: string;
    name: string;
    code?: string | null;
    organizationName?: string | null;
    organization?: {
      id: string;
      name: string;
    } | null;
  } | null;

  firstName: string;
  lastName: string;
  fullName: string;
  email: string;

  status: UserStatus | string;
  isServiceAccount: boolean;

  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  userRoles?: Array<{
    id: string;
    roleId: string;
    role?: {
      id: string;
      name: string;
      key?: string | null;
      isSystem?: boolean;
      description?: string | null;
    } | null;
  }>;

  roles?: Array<{
    id: string;
    name: string;
    key?: string | null;
    isSystem?: boolean;
    description?: string | null;
  }>;

  employee?: {
    id: string;
    employeeCode: string;
    fullName: string;
    email?: string | null;
    departmentName?: string | null;
    employmentStatus?: string | null;
  } | null;

  linkedEmployee?: {
    id: string;
    employeeCode: string;
    fullName: string;
    email?: string | null;
    departmentName?: string | null;
    employmentStatus?: string | null;
  } | null;

  ownership?: {
    isTenantOwner: boolean;
    designation: string;
  };

  counts?: {
    roles?: number;
    activeSessions?: number;
    devices?: number;
  };
};

export type UserListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type UserListFilters = {
  search: string | null;
  status: UserStatus | string | null;
  businessUnitId: string | null;
};

export type UserListResponse = {
  items: UserListItem[];
  meta?: UserListMeta;
  filters?: UserListFilters;
};

export type UserFormatting = {
  dateFormat: string;
  locale: string;
  timezone: string;
};

export type UserRoleSummary = {
  id: string;
  name: string;
  key?: string | null;
  isSystem?: boolean;
  description?: string | null;
};

export type UserPrivilegeSummary = {
  entityKey: string;
  privilege: string;
  accessLevel: string;
};

export type UserTeamSummary = {
  id: string;
  name: string;
  key?: string | null;
  teamType?: string | null;
  isActive?: boolean;
  roles?: UserRoleSummary[];
};

export type UserLinkedEmployeeSummary = {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  departmentName?: string | null;
  employmentStatus?: string | null;
};

export type UserDetailProfile = {
  id: string;
  userId?: string;
  tenantId?: string;
  businessUnitId: string;

  firstName: string;
  lastName: string;
  fullName: string;
  email: string;

  status: UserStatus | string;
  isServiceAccount: boolean;

  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  businessUnit?: {
    id: string;
    name: string;
    code?: string | null;
    organizationName?: string | null;
    organization?: {
      id: string;
      name: string;
    } | null;
  } | null;

  ownership?: {
    isTenantOwner: boolean;
    designation: string;
  };

  roles: UserRoleSummary[];
  teamRoles?: UserRoleSummary[];
  effectiveRoles?: UserRoleSummary[];
  effectivePermissionKeys?: string[];
  effectivePrivileges?: UserPrivilegeSummary[];

  linkedEmployee?: UserLinkedEmployeeSummary | null;
  employee?: UserLinkedEmployeeSummary | null;

  teams?: UserTeamSummary[];
  teamMemberships?: UserTeamSummary[];
};