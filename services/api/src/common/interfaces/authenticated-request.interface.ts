import { Request } from 'express';
import {
  PlatformUserRole,
  PlatformUserStatus,
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  sessionId?: string;
  appClientId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tenantName?: string;
  roleIds: string[];
  roleKeys: string[];
  permissionKeys: string[];
  rolePrivileges?: Array<{
    entityKey: string;
    privilege: SecurityPrivilege;
    accessLevel: SecurityAccessLevel;
    roleId: string;
  }>;
  miscPermissions?: string[];
  accessContext?: {
    isSystemAdministrator: boolean;
    isSystemCustomizer: boolean;
    isTenantOwner: boolean;
    businessUnitId: string;
    organizationId: string;
    teamIds: string[];
    accessibleBusinessUnitIds: string[];
    businessUnitSubtreeIds: string[];
    canAccessAllBusinessUnits: boolean;
  };
  platform?: {
    id: string;
    role: PlatformUserRole;
    status: PlatformUserStatus;
  };
}

export type AuthTokenPayload = {
  sub: string;
  tenantId: string;
  email?: string;
  sessionId: string;
  tokenVersion: number;
  type?: 'access' | 'refresh' | 'agent-refresh';
  tokenUse?: 'access' | 'refresh';
  appClientId?: string;
  aud?: string;
  deviceId?: string;
  authSubjectType?: 'tenant-user' | 'platform-user';
  rememberMe?: boolean;
  platformRole?: PlatformUserRole;
};

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  buAccess?: {
    userId: string;
    tenantId: string;
    businessUnitId: string;
    organizationId: string;
    accessibleBusinessUnitIds: string[];
    accessibleUserIds: string[];
    effectiveAccessLevel: RoleAccessLevel;
    requiresSelfScope: boolean;
  } | null;
}
