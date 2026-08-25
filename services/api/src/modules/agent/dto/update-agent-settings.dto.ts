import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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
  @IsBoolean()
  mandatory?: boolean;

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
  allowCameraAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMicrophoneAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  allowLocationAccess?: boolean;

  // DLP capture (TASK-0020). All default off; enabling clipboard or screenshot
  // capture is a deliberate tenant decision. `dlpConsentRequired` gates capture
  // behind an acknowledged monitoring policy when true.
  @IsOptional()
  @IsBoolean()
  allowClipboardCapture?: boolean;

  @IsOptional()
  @IsBoolean()
  allowScreenshotCapture?: boolean;

  @IsOptional()
  @IsBoolean()
  clipboardFullContent?: boolean;

  @IsOptional()
  @IsBoolean()
  dlpConsentRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  screenshotRetentionDays?: number;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  historyRetentionDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  installerUrl?: string | null;

  @IsOptional()
  @IsDateString()
  releaseDate?: string | null;
}
