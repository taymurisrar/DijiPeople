import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ListMasterDataDto } from './list-master-data.dto';

/**
 * BUG-3800 — the business units list, with the opt-in paging the generic
 * lookups send (`pageSize`, and `search`, which ListMasterDataDto whitelisted
 * but the query never applied). Same contract as ListDepartmentsDto: absent,
 * the response is the bare array every existing caller reads; present, the
 * caller asked for a page and gets the `{items, meta}` envelope.
 */
export class ListBusinessUnitsDto extends ListMasterDataDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
