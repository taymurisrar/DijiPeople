import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ModuleViewsService } from './module-views.service';
import { CreateModuleViewDto } from './dto/create-module-view.dto';
import { UpdateModuleViewDto } from './dto/update-module-view.dto';

@Controller('module-views')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModuleViewsController {
  constructor(private readonly moduleViewsService: ModuleViewsService) {}

  @Get()
  @Permissions('customization.views.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('moduleKey') moduleKey?: string,
  ) {
    return this.moduleViewsService.listForCurrentTenant(user, moduleKey);
  }

  @Post()
  @Permissions('customization.views.create')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateModuleViewDto,
  ) {
    return this.moduleViewsService.createForCurrentTenant(user, dto);
  }

  @Patch(':id')
  @Permissions('customization.views.update')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'write')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModuleViewDto,
  ) {
    return this.moduleViewsService.updateForCurrentTenant(user, id, dto);
  }

  @Delete(':id')
  @Permissions('customization.views.delete')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.moduleViewsService.removeForCurrentTenant(user, id);
  }
}
