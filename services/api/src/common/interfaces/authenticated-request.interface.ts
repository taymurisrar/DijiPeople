import { Request } from 'express';
import { RoleAccessLevel } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  tenantName?: string;
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  roleKeys: string[];
  permissionKeys: string[];
}

export interface AuthTokenPayload extends AuthenticatedUser {
  sub: string;
}

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
