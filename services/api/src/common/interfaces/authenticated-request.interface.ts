import { Request } from 'express';

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
}
