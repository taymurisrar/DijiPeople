import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TenantStatus } from '@prisma/client';

function trimString({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Like `trimString`, but a blank name stays blank instead of becoming
 * `undefined`. Undefined means "not being changed", so a cleared name used to
 * be dropped silently and the save reported success while nothing was written.
 */
function trimRequiredString({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim().replace(/\s+/g, ' ');
}

export class UpdateTenantDto {
  @IsOptional()
  @Transform(trimRequiredString)
  @IsString()
  @IsNotEmpty({ message: 'Tenant name cannot be blank.' })
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;
}
