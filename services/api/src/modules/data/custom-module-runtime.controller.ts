import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CUSTOM_RECORDS_PERMISSION_KEYS } from './custom-records.metadata';
import { CustomModuleRuntimeService } from './custom-module-runtime.service';

/*
 * The end-user read path for published custom modules (ADR-0016): what the
 * sidebar lists and what the runtime list, form and record screens render.
 * Only published metadata leaves here; drafts are never served.
 */
@Controller('metadata/custom-modules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomModuleRuntimeController {
  constructor(private readonly runtimeService: CustomModuleRuntimeService) {}

  @Get()
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.READ)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'read')
  listModules(@CurrentUser() user: AuthenticatedUser) {
    return this.runtimeService.listModules(user);
  }

  @Get(':moduleKey')
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.READ)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'read')
  getModule(
    @Param('moduleKey') moduleKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.runtimeService.getModule(user, moduleKey);
  }
}
