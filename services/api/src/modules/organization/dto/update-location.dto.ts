import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  addressLine1?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(20)
  zipCode?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
