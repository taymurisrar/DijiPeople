import { Transform } from 'class-transformer';
import {
  IsJWT,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/*
 * ADR-0019 MFA request bodies. The global ValidationPipe rejects unknown
 * fields, so a client can never smuggle a `userId`, `tenantId` or `secret` in
 * beside these: every endpoint acts on the signed-in account or on the account
 * named inside a signed challenge token, never on an id from the body.
 */

/** Spaces are stripped: authenticator apps display codes as `123 456`. */
const stripWhitespace = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '') : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const TOTP_CODE = /^\d{6}$/;
const TOTP_CODE_MESSAGE =
  'code must be the 6-digit code from your authenticator app.';
/** `xxxxx-xxxxx`, case- and hyphen-insensitive; normalised again server-side. */
const RECOVERY_CODE = /^[0-9A-Za-z]{5}[-\s]?[0-9A-Za-z]{5}$/;
const RECOVERY_CODE_MESSAGE = 'recoveryCode must look like xxxxx-xxxxx.';

export class MfaCodeDto {
  @Transform(stripWhitespace)
  @IsString()
  @Matches(TOTP_CODE, { message: TOTP_CODE_MESSAGE })
  code!: string;
}

/** A TOTP code or a recovery code; the service requires exactly one. */
export class MfaSecondFactorDto {
  @IsOptional()
  @Transform(stripWhitespace)
  @IsString()
  @Matches(TOTP_CODE, { message: TOTP_CODE_MESSAGE })
  code?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  @Matches(RECOVERY_CODE, { message: RECOVERY_CODE_MESSAGE })
  recoveryCode?: string;
}

export class MfaDisableDto extends MfaSecondFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

export class MfaChallengeTokenDto {
  @IsString()
  @MaxLength(4096)
  @IsJWT()
  challengeToken!: string;
}

export class MfaChallengeVerifyDto extends MfaSecondFactorDto {
  @IsString()
  @MaxLength(4096)
  @IsJWT()
  challengeToken!: string;
}

export class MfaChallengeSetupConfirmDto {
  @IsString()
  @MaxLength(4096)
  @IsJWT()
  challengeToken!: string;

  @Transform(stripWhitespace)
  @IsString()
  @Matches(TOTP_CODE, { message: TOTP_CODE_MESSAGE })
  code!: string;
}
