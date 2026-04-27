import { Transform } from 'class-transformer';
import {
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

export class CreateDocumentCategoryDto {
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  code!: string;

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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}
