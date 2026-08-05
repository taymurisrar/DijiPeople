import {
  Transform,
} from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AgentDeviceDto {
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  deviceFingerprint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  deviceName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  os!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  platform!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  agentVersion!: string;
}

export class AgentVersionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;
}

const AGENT_DEVICE_PERMISSION_STATUSES = [
  'GRANTED',
  'DENIED',
  'PROMPT',
  'RESTRICTED',
  'UNAVAILABLE',
  'UNKNOWN',
] as const;

export class UpdateAgentDevicePermissionsDto {
  @IsUUID()
  deviceId!: string;

  @IsIn(AGENT_DEVICE_PERMISSION_STATUSES)
  cameraPermission!: string;

  @IsIn(AGENT_DEVICE_PERMISSION_STATUSES)
  microphonePermission!: string;

  @IsIn(AGENT_DEVICE_PERMISSION_STATUSES)
  locationPermission!: string;
}

const AGENT_LOCATION_RESULT_STATUSES = [
  'CAPTURED',
  'DENIED',
  'FAILED',
] as const;

export class CreateAgentLocationRequestDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class CompleteAgentLocationRequestDto {
  @IsUUID()
  deviceId!: string;

  @IsIn(AGENT_LOCATION_RESULT_STATUSES)
  status!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().slice(0, 500) : value,
  )
  errorMessage?: string;

  @IsOptional()
  @IsString()
  capturedAt?: string;
}
