import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateUserPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
