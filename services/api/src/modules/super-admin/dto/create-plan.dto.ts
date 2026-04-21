import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyBasePrice!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annualBasePrice!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  featureKeys!: string[];
}
