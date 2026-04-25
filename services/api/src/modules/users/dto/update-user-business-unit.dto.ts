import { IsUUID } from 'class-validator';

export class UpdateUserBusinessUnitDto {
  @IsUUID()
  businessUnitId!: string;
}
