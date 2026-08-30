import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListDepartmentsDto } from './dto/list-departments.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { OrganizationService } from './organization.service';

@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Permissions('departments.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDepartmentsDto,
  ) {
    return this.organizationService.listDepartmentsForUser(user, query);
  }

  @Get(':id')
  @Permissions('departments.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findDepartmentForUser(user, id);
  }

  @Post()
  @Permissions('departments.create')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.organizationService.createDepartment(user, dto);
  }

  @Patch(':id')
  @Permissions('departments.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.organizationService.updateDepartment(user, id, dto);
  }

  @Delete(':id')
  @Permissions('departments.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.deleteDepartment(user, id);
  }
}
