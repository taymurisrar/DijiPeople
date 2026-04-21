import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CheckOutDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  workSummary?: string;

  @IsOptional()
  @IsNumber()
  remoteLatitude?: number;

  @IsOptional()
  @IsNumber()
  remoteLongitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remoteAddressText?: string;
}
