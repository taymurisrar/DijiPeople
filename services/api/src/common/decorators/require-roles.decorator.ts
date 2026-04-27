import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLES_KEY = 'required_roles';
export const RequireRoles = (...roleKeys: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roleKeys);
