import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
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

  @IsOptional()
  @IsBoolean()
  startNewSession?: boolean;
}

export class AgentLogoutDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;

  /**
   * BUG-0035. The desktop agent has always sent this, and this DTO never
   * declared it, so the global `ValidationPipe` — `forbidNonWhitelisted: true` —
   * rejected **every** logout with a 400. The agent swallowed the failure and
   * showed a successful sign-out while the refresh token stayed live for its
   * full remaining TTL.
   *
   * The server is the side that changes. Deployed agents already send this
   * field, so tightening the client instead would leave every installed copy
   * unable to sign out until it updated — and BUG-0034 records that the agent's
   * update feed does not exist, so many never would.
   *
   * Optional rather than required, because the device is read from the refresh
   * token payload and revocation does not depend on this value. Sign-out must
   * not fail over a field it does not need.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  deviceFingerprint?: string;
}
