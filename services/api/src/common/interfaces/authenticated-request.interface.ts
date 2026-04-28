import { Request } from 'express';
import {
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
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
    canAccessAllBusinessUnits: boolean;
  };
}

export type AuthTokenPayload =
  | {
      sub: string;
      tenantId: string;
      email: string;
      sessionId: string;
      tokenVersion: number;
      type: 'access';
    }
  | {
      sub: string;
      tenantId: string;
      sessionId: string;
      tokenVersion: number;
      type: 'refresh';
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
