import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WORK_KEY_PATTERN, WORK_UNIT_KINDS } from '../work-profile-definition';

const KEY_MESSAGE =
  'key must be 2-64 characters of a-z, 0-9, ".", "_" or "-", starting with a letter or digit';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateWorkUnitDto {
  @IsString()
  @Matches(WORK_KEY_PATTERN, { message: KEY_MESSAGE })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(WORK_UNIT_KINDS as unknown as string[])
  kind!: (typeof WORK_UNIT_KINDS)[number];
}

/** Key and kind are immutable: changing either would change what published versions mean. */
export class UpdateWorkUnitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWorkProfilesDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateWorkProfileDto {
  @IsString()
  @Matches(WORK_KEY_PATTERN, { message: KEY_MESSAGE })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Validated by work-profile-definition.ts; becomes draft version 1. */
  @IsObject()
  definition!: Record<string, unknown>;
}

export class UpdateWorkProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorkProfileVersionDto {
  @IsObject()
  definition!: Record<string, unknown>;
}

export class PublishWorkProfileVersionDto {
  /** Defaults to now. Must be after the previous version's start. */
  @IsOptional()
  @Type(() => String)
  @IsDateString()
  effectiveFrom?: string;
}

export class ListAssignmentsDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;
}

export class CreateAssignmentDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  profileId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class EndAssignmentDto {
  @IsDateString()
  effectiveTo!: string;
}

export class ImportWorkProfilePackageDto {
  /** The `.djpkg` document text. The request body limit (1 MB) bounds it. */
  @IsString()
  @MinLength(2)
  @MaxLength(900_000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
