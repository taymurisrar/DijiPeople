import { Type } from 'class-transformer';
import { DocumentEntityType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DocumentQueryDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsUUID()
  documentCategoryId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  uploadedByUserId?: string;

  @IsOptional()
  @IsEnum(DocumentEntityType)
  entityType?: DocumentEntityType;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  uploadedFrom?: string;

  @IsOptional()
  @IsString()
  uploadedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 25;
}
