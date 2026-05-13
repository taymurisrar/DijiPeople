import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TenantStatus } from '@prisma/client';

function trimString({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

export class UpdateTenantDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must use lowercase letters, numbers, and single hyphens, and cannot start or end with a hyphen.',
  })
  slug?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
