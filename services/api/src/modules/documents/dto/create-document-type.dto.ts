import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function trimToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class CreateDocumentTypeDto {
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  key!: string;

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
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  allowedMimeTypes?: string[];

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
