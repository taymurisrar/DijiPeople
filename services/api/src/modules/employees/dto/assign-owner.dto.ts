import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AssignOwnerDto {
  @IsUUID('4')
  ownerUserId!: string;
}

export class BulkAssignOwnerDto extends AssignOwnerDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
}
