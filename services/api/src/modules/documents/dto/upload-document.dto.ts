import { Transform } from 'class-transformer';
import { DocumentEntityType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UploadDocumentDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  documentCategoryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(DocumentEntityType)
  entityType!: DocumentEntityType;

  @IsString()
  @MaxLength(120)
  entityId!: string;
}
