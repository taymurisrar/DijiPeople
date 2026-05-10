import { EmailProviderType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmailProviderDto {
  @IsEnum(EmailProviderType)
  providerType!: EmailProviderType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  providerName!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsEmail()
  @MaxLength(320)
  fromEmail!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  replyToEmail?: string | null;

  @IsObject()
  configuration!: Record<string, unknown>;
}

export class UpdateEmailProviderDto {
  @IsOptional()
  @IsEnum(EmailProviderType)
  providerType?: EmailProviderType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  providerName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  replyToEmail?: string | null;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
