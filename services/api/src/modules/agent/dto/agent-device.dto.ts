import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
