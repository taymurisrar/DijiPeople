import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/*
 * Only the operators that mean something for a navigation entry are accepted.
 *
 * The runtime rule engine also has field- and record-scoped operators, but a
 * sidebar entry has no record behind it, so accepting those would let an
 * administrator save a rule that can never evaluate to anything useful. The
 * union is narrowed here rather than in the UI so the API is the boundary.
 */
export const SIDEBAR_VISIBILITY_OPERATORS = [
  'has-permission',
  'has-any-permission',
  'has-all-permissions',
  'has-role',
  'has-any-role',
  'not-has-role',
  'in-team',
  'in-department',
  'in-business-unit',
  'in-organization',
  'has-designation',
  'not-in-team',
  'not-in-department',
  'not-in-business-unit',
  'not-in-organization',
  'not-has-designation',
] as const;

export type SidebarVisibilityOperator =
  (typeof SIDEBAR_VISIBILITY_OPERATORS)[number];

export class SidebarVisibilityRuleDto {
  @IsIn(SIDEBAR_VISIBILITY_OPERATORS)
  operator!: SidebarVisibilityOperator;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissionKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  roleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  teamIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  businessUnitIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  organizationIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  designationIds?: string[];
}

export class SidebarNavigationOverrideDto {
  /* The code item's href, which is its stable identity across releases. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  itemKey!: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  /* Null clears the override and restores the code label. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SidebarVisibilityRuleDto)
  visibilityRules?: SidebarVisibilityRuleDto[] | null;
}

export class UpdateSidebarNavigationDto {
  /*
   * The complete override set. Sending the whole set rather than a patch keeps
   * "remove this override" expressible without a separate delete endpoint, and
   * matches how the designer works: load, edit, save.
   */
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SidebarNavigationOverrideDto)
  items!: SidebarNavigationOverrideDto[];
}
