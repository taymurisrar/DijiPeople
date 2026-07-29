import { PartialType } from '@nestjs/mapped-types';
import { CreateEmploymentTypeDto } from './create-employment-type.dto';

export class UpdateEmploymentTypeDto extends PartialType(
  CreateEmploymentTypeDto,
) {}
