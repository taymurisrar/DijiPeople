import { AgentActivityState } from '@prisma/client';
import {
  ArrayMaxSize,
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

  /**
   * The server's own bound on a heartbeat batch.
   *
   * `apps/agent-desktop` caps its batches at 1000 and refuses to send more, but
   * that cap lived only in the client — the server accepted an array of any
   * length and processed it one event at a time, each with several writes. A
   * caller holding a valid agent token could post an arbitrarily large batch and
   * hold a connection open indefinitely.
   *
   * 1000 matches `MAX_HEARTBEAT_BATCH_SIZE` in `apps/agent-desktop/src/main/
   * api-client.ts` deliberately: a legitimate agent is never refused, and the
   * limit stops being a client-side courtesy. If that constant moves, this must
   * move with it.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatEventDto)
  events?: HeartbeatEventDto[];
}
