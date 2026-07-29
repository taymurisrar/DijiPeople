import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

function trimToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class CreateDocumentCategoryDto {
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  appliesTo?: string[];

  @IsOptional()
  @IsBoolean()
  expirable?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresVerification?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultRetentionMonths?: number;

  @IsOptional()
  allowedExtensionsOverride?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maximumUploadSizeOverrideMb?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}
