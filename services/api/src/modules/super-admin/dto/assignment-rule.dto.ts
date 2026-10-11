import { RecordAssignmentStrategy } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ASSIGNMENT_MODULE_KEYS } from '../record-assignment.constants';

/*
 * Cross-field rules (strategy needs its target, condition keys belong to the
 * module) live in AssignmentRulesService, because they need the database and
 * the module key together. These decorators only bound the shapes.
 */
export class CreateAssignmentRuleDto {
  @IsIn([...ASSIGNMENT_MODULE_KEYS])
  moduleKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priority?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsEnum(RecordAssignmentStrategy)
  strategy!: RecordAssignmentStrategy;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  targetTeamId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  candidateUserIds?: string[];
}

/** moduleKey is fixed at creation: moving a rule between modules would change what its conditions mean. */
export class UpdateAssignmentRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priority?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(RecordAssignmentStrategy)
  strategy?: RecordAssignmentStrategy;

  @IsOptional()
  @IsUUID()
  targetUserId?: string | null;

  @IsOptional()
  @IsUUID()
  targetTeamId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  candidateUserIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestAssignmentRuleDto {
  @IsIn([...ASSIGNMENT_MODULE_KEYS])
  moduleKey!: string;

  @IsObject()
  record!: Record<string, unknown>;
}

export class AssignmentRuleQueryDto {
  @IsOptional()
  @IsIn([...ASSIGNMENT_MODULE_KEYS])
  moduleKey?: string;
}
