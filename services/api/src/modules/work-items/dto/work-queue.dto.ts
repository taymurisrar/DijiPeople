import {
  IsBoolean,
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

const MAX_SLA_MINUTES = 525_600; // a year

export class CreateWorkQueueDto {
  /** Stable lowercase key; what packages and integrations name. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,63}$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** The team the queue belongs to. A team queue is visible to that team. */
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  /** Minutes to a first response. Stamped onto each item when it is queued. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SLA_MINUTES)
  responseSlaMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SLA_MINUTES)
  resolutionSlaMinutes?: number;
}

export class UpdateWorkQueueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SLA_MINUTES)
  responseSlaMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SLA_MINUTES)
  resolutionSlaMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
