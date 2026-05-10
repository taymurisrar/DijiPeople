import { NotificationChannel } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationPreferenceUpdateItemDto {
  @IsString()
  @MaxLength(120)
  eventCode!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  metadata?: Record<string, unknown> | null;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceUpdateItemDto)
  preferences!: NotificationPreferenceUpdateItemDto[];
}
