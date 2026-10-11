import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/*
 * A grouping label for pickers, not a permission. The column is free text so a
 * new kind needs no migration; the DTO still bounds it to the kinds the
 * console offers so a typo cannot mint a category nobody can filter by.
 */
export const PLATFORM_TEAM_CATEGORIES = [
  'SUPPORT',
  'SALES',
  'BILLING',
  'OPERATIONS',
  'GENERAL',
] as const;
export const PLATFORM_TEAM_MEMBER_ROLES = ['MEMBER', 'LEAD'] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlatformTeamDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(PLATFORM_TEAM_CATEGORIES)
  category?: (typeof PLATFORM_TEAM_CATEGORIES)[number];

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class UpdatePlatformTeamDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(PLATFORM_TEAM_CATEGORIES)
  category?: (typeof PLATFORM_TEAM_CATEGORIES)[number];

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  leadUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PlatformTeamQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(PLATFORM_TEAM_CATEGORIES)
  category?: (typeof PLATFORM_TEAM_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ArchivePlatformTeamDto {
  @IsOptional()
  @IsUUID()
  reassignToTeamId?: string;
}

export class AddPlatformTeamMemberDto {
  @IsUUID()
  platformUserId!: string;

  @IsOptional()
  @IsIn(PLATFORM_TEAM_MEMBER_ROLES)
  role?: (typeof PLATFORM_TEAM_MEMBER_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  receivesAssignments?: boolean;
}

export class UpdatePlatformTeamMemberDto {
  @IsOptional()
  @IsIn(PLATFORM_TEAM_MEMBER_ROLES)
  role?: (typeof PLATFORM_TEAM_MEMBER_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  receivesAssignments?: boolean;
}
