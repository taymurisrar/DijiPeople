import { Type } from 'class-transformer';
import { IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/*
 * ITEM-0182. Accepts exactly what the settings runtime list sends
 * (`settingsListApiPath`: `page` and `pageSize`) plus `search`. The global
 * ValidationPipe rejects unknown query parameters, so a field the screen sends
 * and this does not declare is a 400 rather than an ignored extra (BUG-2043).
 */
export class InAppDeliveryLogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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
