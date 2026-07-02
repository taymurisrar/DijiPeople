import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantCode?: string;
}
