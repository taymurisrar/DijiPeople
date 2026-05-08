import { PartialType } from '@nestjs/mapped-types';
import { CreateLeavePolicyAssignmentDto } from './create-leave-policy-assignment.dto';

export class UpdateLeavePolicyAssignmentDto extends PartialType(
  CreateLeavePolicyAssignmentDto,
) {}
