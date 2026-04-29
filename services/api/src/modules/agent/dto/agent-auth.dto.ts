import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AgentDeviceDto } from './agent-device.dto';

export class AgentLoginDto extends AgentDeviceDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class AgentRefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  deviceFingerprint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  agentVersion!: string;
}

export class AgentLogoutDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
