import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DlpRuleAction } from '@prisma/client';

/**
 * DTOs for the desktop agent's DLP capture path and the tenant/investigator
 * surfaces (TASK-0020).
 *
 * The global `ValidationPipe` runs `forbidNonWhitelisted: true`, so a field the
 * agent sends that is not declared here is a 400, not an ignored extra. Any
 * change to a request body in `apps/agent-desktop/src/main/api-client.ts` must
 * change here too, and is checked by `agent-client-contract.spec.ts`.
 */

/** The largest clipboard text we accept in full-content mode: 1 MB of UTF-8. */
const MAX_CLIPBOARD_TEXT_LENGTH = 1_048_576;
/**
 * The largest base64 screenshot we accept (~9 MB of image). Screenshots are
 * triggered, not periodic, so this bounds a hostile client without constraining
 * a legitimate one. NOTE: the Nest JSON body limit must be at least this large
 * for screenshot ingest to succeed; see DlpController.
 */
const MAX_SCREENSHOT_BASE64_LENGTH = 8_000_000;

export class ClipboardCaptureEventDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  deviceId!: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceApp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceAppPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationApp?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  contentBytes!: number;

  @IsString()
  @MaxLength(128)
  contentSha256!: string;

  /**
   * The clipboard text, present only in full-content mode and only within the
   * byte cap. Encrypted at rest by the server; never logged.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CLIPBOARD_TEXT_LENGTH)
  text?: string | null;

  @IsOptional()
  @IsBoolean()
  overCap?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firedRuleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string | null;
}

export class ClipboardCaptureBatchDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ClipboardCaptureEventDto)
  events!: ClipboardCaptureEventDto[];
}

export class ScreenCaptureEventDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  deviceId!: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @MaxLength(64)
  firedRuleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  capturedReason?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  contentBytes!: number;

  @IsString()
  @MaxLength(128)
  contentSha256!: string;

  /** The PNG bytes, base64-encoded. Stored via StorageService, never inline. */
  @IsString()
  @MaxLength(MAX_SCREENSHOT_BASE64_LENGTH)
  imageBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string | null;
}

export class ScreenCaptureBatchDto {
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ScreenCaptureEventDto)
  events!: ScreenCaptureEventDto[];
}

/** Tenant-side rule configuration (agent.settings.manage). */
export class UpsertDlpRuleDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  sourceAppPatterns!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  channelAppPatterns!: string[];

  @IsOptional()
  @IsEnum(DlpRuleAction)
  action?: DlpRuleAction;
}

/** Investigator alert listing (dlp.review). */
export class DlpAlertQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
