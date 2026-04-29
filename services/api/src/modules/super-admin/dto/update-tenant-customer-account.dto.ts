import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateTenantCustomerAccountDto {
  @IsUUID()
  customerAccountId!: string;

  @IsOptional()
  @IsBoolean()
  forceReassignWithActiveBilling?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  reason?: string;
}
