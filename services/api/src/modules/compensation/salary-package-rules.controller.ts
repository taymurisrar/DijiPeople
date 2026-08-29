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
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateSalaryPackageRuleComponentDto,
  CreateSalaryPackageRuleDto,
  UpdateSalaryPackageRuleComponentDto,
  UpdateSalaryPackageRuleDto,
} from './dto/salary-package-rule.dto';
import { SalaryPackageRulesService } from './salary-package-rules.service';

@Controller('salary-package-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class SalaryPackageRulesController {
  constructor(private readonly service: SalaryPackageRulesService) {}

  @Get()
  @Permissions('settings.read', 'compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(user, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
    });
  }

  @Post()
  @Permissions('settings.update', 'compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalaryPackageRuleDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @Permissions('settings.read', 'compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(user, id);
  }

  @Patch(':id')
  @Permissions('settings.update', 'compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSalaryPackageRuleDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Get(':id/components')
  @Permissions('settings.read', 'compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  async components(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const rule = await this.service.detail(user, id);
    return {
      items: rule.components ?? [],
      total: rule.components?.length ?? 0,
    };
  }

  @Post(':id/components')
  @Permissions('settings.update', 'compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  createComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateSalaryPackageRuleComponentDto,
  ) {
    return this.service.createComponent(user, id, dto);
  }

  @Patch(':id/components/:componentId')
  @Permissions('settings.update', 'compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  updateComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('componentId', new ParseUUIDPipe()) componentId: string,
    @Body() dto: UpdateSalaryPackageRuleComponentDto,
  ) {
    return this.service.updateComponent(user, id, componentId, dto);
  }

  @Delete(':id/components/:componentId')
  @Permissions('settings.update', 'compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  removeComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('componentId', new ParseUUIDPipe()) componentId: string,
  ) {
    return this.service.removeComponent(user, id, componentId);
  }

  @Get(':id/assignments')
  @Permissions('settings.read', 'compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  assignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.assignments(user, id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
