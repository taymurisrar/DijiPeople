import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'tenantSlug must use lowercase letters, numbers, and single hyphens only.',
  })
  tenantSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tenantCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;
}
