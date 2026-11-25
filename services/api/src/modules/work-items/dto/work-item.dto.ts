import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WORK_ITEM_STATUSES } from '../work-item-lifecycle';

export const WORK_ITEM_KINDS = ['TASK', 'SERVICE_JOB', 'DUTY_OCCURRENCE'];
export const WORK_ITEM_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateWorkItemDto {
  @IsIn(WORK_ITEM_KINDS)
  kind!: 'TASK' | 'SERVICE_JOB' | 'DUTY_OCCURRENCE';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(WORK_ITEM_PRIORITIES)
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Subtask of. Fixed at creation. */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,63}$/)
  workTypeKey?: string;

  @IsOptional()
  @IsUUID()
  workProfileVersionId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRef?: string;
}

export class UpdateWorkItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(WORK_ITEM_PRIORITIES)
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRef?: string;
}

export class TransitionWorkItemDto {
  @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  to!: (typeof WORK_ITEM_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReassignWorkItemDto {
  /** Null clears the owner. */
  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetContributorDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  estimateMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  actualMinutes?: number;
}

export class AddDependencyDto {
  @IsUUID()
  dependsOnId!: string;
}

export class ListWorkItemsDto {
  @IsOptional()
  @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsIn(WORK_ITEM_KINDS)
  kind?: string;

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
