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
import { constrainReferenceListQuery } from '../../common/security/reference-data-access';
import { CreateEmploymentTypeDto } from './dto/create-employment-type.dto';
import { ListEmploymentTypesDto } from './dto/list-employment-types.dto';
import { UpdateEmploymentTypeDto } from './dto/update-employment-type.dto';
import { EmploymentTypesService } from './employment-types.service';

@Controller('employment-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmploymentTypesController {
  constructor(
    private readonly employmentTypesService: EmploymentTypesService,
  ) {}

  @Get()
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEmploymentTypesDto,
  ) {
    return this.employmentTypesService.findAll(
      user.tenantId,
      constrainReferenceListQuery(user, query, 'employment-types.read'),
    );
  }

  @Get(':id')
  @Permissions('employment-types.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employmentTypesService.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('employment-types.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmploymentTypeDto,
  ) {
    return this.employmentTypesService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('employment-types.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmploymentTypeDto,
  ) {
    return this.employmentTypesService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('employment-types.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employmentTypesService.deactivate(user, id);
  }
}
