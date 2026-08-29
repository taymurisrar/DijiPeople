import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ListMasterDataDto } from './list-master-data.dto';

/**
 * The departments list, plus the pagination the employees list already accepts.
 *
 * `page` and `pageSize` are deliberately optional and deliberately have no
 * default. The master-data endpoints answer with a bare array and several
 * consumers — the settings runtime lookups, the employee lookup hooks, the
 * holiday calendar manager — read that array directly, so defaulting the two
 * fields would switch every existing caller onto the `{items, meta}` envelope
 * without asking. Absent, the response shape is exactly what it was; present,
 * the caller has asked for a page and gets the envelope with the totals a
 * footer needs.
 *
 * The bound on `pageSize` matches `EmployeeQueryDto`: an unbounded page size is
 * a way to ask for the whole table.
 */
export class ListDepartmentsDto extends ListMasterDataDto {
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
