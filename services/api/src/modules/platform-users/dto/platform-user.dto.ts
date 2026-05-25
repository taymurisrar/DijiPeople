import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePlatformUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(PlatformUserRole)
  role!: PlatformUserRole;

  @IsOptional()
  @IsEnum(PlatformUserStatus)
  status?: PlatformUserStatus;
}

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(PlatformUserRole)
  role?: PlatformUserRole;

  @IsOptional()
  @IsEnum(PlatformUserStatus)
  status?: PlatformUserStatus;
}
