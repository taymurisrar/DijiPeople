import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAgentSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(3600)
  heartbeatIntervalSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  idleThresholdSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  awayThresholdSeconds?: number;

  @IsOptional()
  @IsBoolean()
  captureActiveApp?: boolean;

  @IsOptional()
  @IsBoolean()
  captureWindowTitle?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineQueueEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  heartbeatBatchSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  minimumSupportedVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  latestVersion?: string;

  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  updateMessage?: string | null;

  @IsOptional()
  @IsBoolean()
  autoUpdateEnabled?: boolean;
}
