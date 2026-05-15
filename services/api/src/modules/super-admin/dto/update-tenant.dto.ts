import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
