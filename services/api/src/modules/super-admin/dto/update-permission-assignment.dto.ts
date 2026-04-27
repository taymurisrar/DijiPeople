import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdatePermissionAssignmentDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  permissionIds!: string[];
}
