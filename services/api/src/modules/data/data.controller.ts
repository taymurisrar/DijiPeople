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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { DataService } from './data.service';
import { CustomDataService } from './custom-data.service';
import { CUSTOM_RECORDS_PERMISSION_KEYS } from './custom-records.metadata';
import { EntityQueryParams } from './entity-query.types';

/*
 * `PermissionsGuard` is applied per handler, not on the class, because of the
 * list handler below. Every other handler serves custom tables only and runs
 * the guard with both permission systems declared (BUG-3494).
 */
@Controller('data')
@UseGuards(JwtAuthGuard)
export class DataController {
  constructor(
    private readonly dataService: DataService,
    private readonly customDataService: CustomDataService,
  ) {}

  /*
   * The one handler without endpoint decorators, on purpose. It dispatches
   * between the static entity registry (`employees`, authorized by
   * `employees.read`) and custom tables (`custom-records.read`), so no single
   * static declaration is correct for both. Each branch asserts both permission
   * systems itself through `EntityPermissionResolver` before any query runs —
   * which is why `DataController` stays on the reviewed service-authorized list
   * in `wiring-invariants.spec.ts`.
   */
  @Get(':entityLogicalName')
  async findMany(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      await this.customDataService.isCustomTable(
        entityLogicalName,
        user.tenantId,
      )
    ) {
      return this.customDataService.findMany(entityLogicalName, query, user);
    }
    return this.dataService.findMany(entityLogicalName, query, user);
  }

  @Get(':entityLogicalName/:recordId')
  @UseGuards(PermissionsGuard)
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.READ)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'read')
  findOne(
    @Param('entityLogicalName') entityLogicalName: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.findOne(entityLogicalName, recordId, user);
  }

  @Post(':entityLogicalName')
  @UseGuards(PermissionsGuard)
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.CREATE)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'create')
  create(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.create(entityLogicalName, query, body, user);
  }

  @Patch(':entityLogicalName/:recordId')
  @UseGuards(PermissionsGuard)
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.WRITE)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'write')
  update(
    @Param('entityLogicalName') entityLogicalName: string,
    @Param('recordId') recordId: string,
    @Query() query: EntityQueryParams,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.update(
      entityLogicalName,
      recordId,
      query,
      body,
      user,
    );
  }

  @Delete(':entityLogicalName/:recordId')
  @UseGuards(PermissionsGuard)
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.DELETE)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'delete')
  deleteOne(
    @Param('entityLogicalName') entityLogicalName: string,
    @Param('recordId') recordId: string,
    @Query() query: EntityQueryParams,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.softDelete(
      entityLogicalName,
      [recordId],
      query,
      user,
    );
  }

  @Delete(':entityLogicalName')
  @UseGuards(PermissionsGuard)
  @Permissions(CUSTOM_RECORDS_PERMISSION_KEYS.DELETE)
  @RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'delete')
  deleteMany(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @Body() body: { recordIds?: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.softDelete(
      entityLogicalName,
      body.recordIds ?? [],
      query,
      user,
    );
  }
}
