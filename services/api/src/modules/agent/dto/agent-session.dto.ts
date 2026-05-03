import { AgentActivityState } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartAgentSessionDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;
}

export class EndAgentSessionDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;
}

export class HeartbeatEventDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  deviceId!: string;

  @IsEnum(AgentActivityState)
  state!: AgentActivityState;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  idleSeconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activeApp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  windowTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  activeAppPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  browserTabTitle?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  activeProcessId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string | null;

  @IsDateString()
  occurredAt!: string;
}

export class HeartbeatDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @IsEnum(AgentActivityState)
  state?: AgentActivityState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  idleSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activeApp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  windowTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  activeAppPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  browserTabTitle?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  activeProcessId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string | null;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeartbeatEventDto)
  events?: HeartbeatEventDto[];
}
