import { PartialType } from '@nestjs/mapped-types';
import { CreateLeavePolicyRuleDto } from './create-leave-policy-rule.dto';

export class UpdateLeavePolicyRuleDto extends PartialType(
  CreateLeavePolicyRuleDto,
) {}
