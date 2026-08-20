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
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { constrainReferenceListQuery } from '../../common/security/reference-data-access';
import { CreateEmployeeLevelDto } from './dto/create-employee-level.dto';
import { ListEmployeeLevelsDto } from './dto/list-employee-levels.dto';
import { UpdateEmployeeLevelDto } from './dto/update-employee-level.dto';
import { EmployeeLevelsService } from './employee-levels.service';

@Controller('employee-levels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeLevelsController {
  constructor(private readonly employeeLevelsService: EmployeeLevelsService) {}

  @Get()
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEmployeeLevelsDto,
  ) {
    return this.employeeLevelsService.findAll(
      user.tenantId,
      constrainReferenceListQuery(user, query, 'employee-levels.read'),
    );
  }

  @Get(':id')
  @Permissions('employee-levels.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_LEVELS, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employeeLevelsService.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('employee-levels.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'create' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'write' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'delete' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'manage' },
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeLevelDto,
  ) {
    return this.employeeLevelsService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('employee-levels.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'create' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'write' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'delete' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'manage' },
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeLevelDto,
  ) {
    return this.employeeLevelsService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('employee-levels.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'create' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'write' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'delete' },
    { entityKey: ENTITY_KEYS.EMPLOYEE_LEVELS, action: 'manage' },
  )
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employeeLevelsService.deactivate(user, id);
  }
}
