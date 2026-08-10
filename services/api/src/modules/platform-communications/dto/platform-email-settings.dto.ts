import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const PLATFORM_EMAIL_PROVIDER_TYPES = ['CONSOLE', 'SMTP'] as const;
export type PlatformEmailProviderType =
  (typeof PLATFORM_EMAIL_PROVIDER_TYPES)[number];

export const SMTP_SECURITY_MODES = ['NONE', 'STARTTLS', 'TLS'] as const;
export type SmtpSecurityMode = (typeof SMTP_SECURITY_MODES)[number];

export class UpdatePlatformEmailSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PLATFORM_EMAIL_PROVIDER_TYPES)
  providerType!: PlatformEmailProviderType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fromName!: string;

  @IsEmail()
  @MaxLength(320)
  fromEmail!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  replyToEmail?: string | null;

  @ValidateIf((value: UpdatePlatformEmailSettingsDto) =>
    Boolean(value.enabled && value.providerType === 'SMTP'),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpAuthEnabled?: boolean;

  @ValidateIf((value: UpdatePlatformEmailSettingsDto) =>
    Boolean(
      value.enabled && value.providerType === 'SMTP' && value.smtpAuthEnabled,
    ),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  smtpUsername?: string;

  /** Write-only. Omit to retain the currently configured secret. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  smtpPassword?: string;

  @IsOptional()
  @IsBoolean()
  clearSmtpPassword?: boolean;

  @IsOptional()
  @IsIn(SMTP_SECURITY_MODES)
  smtpSecurity?: SmtpSecurityMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  connectionTimeoutMs?: number;
}

export class SendPlatformTestEmailDto {
  @IsEmail()
  @MaxLength(320)
  recipient!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;
}

export class UpdatePlatformEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subjectTemplate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  htmlTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  textTemplate?: string | null;

  @IsBoolean()
  enabled!: boolean;
}
