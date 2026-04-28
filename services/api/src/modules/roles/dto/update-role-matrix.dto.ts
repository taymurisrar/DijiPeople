import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';

export class RolePrivilegeMatrixItemDto {
  @IsString()
  @MaxLength(80)
  entityKey!: string;

  @IsEnum(SecurityPrivilege)
  privilege!: SecurityPrivilege;

  @IsEnum(SecurityAccessLevel)
  accessLevel!: SecurityAccessLevel;
}

export class RoleMiscPermissionItemDto {
  @IsString()
  @MaxLength(120)
  permissionKey!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateRoleMatrixDto {
  @IsArray()
  @ArrayUnique((item: RolePrivilegeMatrixItemDto) => `${item.entityKey}:${item.privilege}`)
  @ValidateNested({ each: true })
  @Type(() => RolePrivilegeMatrixItemDto)
  privileges!: RolePrivilegeMatrixItemDto[];

  @IsArray()
  @ArrayUnique((item: RoleMiscPermissionItemDto) => item.permissionKey)
  @ValidateNested({ each: true })
  @Type(() => RoleMiscPermissionItemDto)
  miscPermissions!: RoleMiscPermissionItemDto[];
}
