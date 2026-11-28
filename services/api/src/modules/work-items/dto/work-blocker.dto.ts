import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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

export const BLOCKER_CATEGORIES = [
  'WAITING_ON_PERSON',
  'WAITING_ON_APPROVAL',
  'EQUIPMENT_OR_SYSTEM_DOWNTIME',
  'EXTERNAL_PARTY',
  'MATERIAL_OR_STOCK',
  'DECISION_NEEDED',
  'ACCESS_OR_TOOLING',
  'OTHER',
] as const;
export const BLOCKER_CAUSES = [
  'UNDETERMINED',
  'WORKER_CONTROLLABLE',
  'TEAM_CONTROLLABLE',
  'MANAGEMENT',
  'EXTERNAL',
] as const;

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
import { Transform } from 'class-transformer';

export class RaiseBlockerDto {
  @IsIn(BLOCKER_CATEGORIES as unknown as string[])
  category!: (typeof BLOCKER_CATEGORIES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** Who must act to clear it. */
  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** The reporter's own view of the cause. Optional, and open to review. */
  @IsOptional()
  @IsIn(BLOCKER_CAUSES as unknown as string[])
  cause?: (typeof BLOCKER_CAUSES)[number];
}

export class UpdateBlockerDto {
  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(BLOCKER_CATEGORIES as unknown as string[])
  category?: (typeof BLOCKER_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;
}

export class SetCauseDto {
  @IsIn(BLOCKER_CAUSES as unknown as string[])
  cause!: (typeof BLOCKER_CAUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class EscalateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CloseBlockerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  resolution!: string;
}

export class ListBlockersDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'CANCELLED'])
  status?: 'OPEN' | 'RESOLVED' | 'CANCELLED';

  /** Blockers that wait on me. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

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

export class BlockerSummaryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
