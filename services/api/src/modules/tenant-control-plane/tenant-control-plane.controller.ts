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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantAccessService } from './tenant-access.service';
import { TenantAppsService } from './tenant-apps.service';
import { TenantControlPlaneService } from './tenant-control-plane.service';
import { TenantErasureService } from './tenant-erasure.service';
import { TenantModulesService } from './tenant-modules.service';
import { TenantOperationsService } from './tenant-operations.service';
import {
  CancelTenantSubscriptionDto,
  ChangeTenantStatusDto,
  CreateTenantIdentityDto,
  DeleteTenantIdentityDto,
  EraseTenantDto,
  RetryTenantProvisioningDto,
  TransferTenantOwnershipDto,
  UpdateTenantAppDto,
  UpdateTenantIdentityDto,
  UpdateTenantModulesDto,
} from './dto/tenant-control-plane.dto';

/**
 * The Platform Admin tenant control plane.
 *
 * Every handler is authenticated by `JwtAuthGuard` and then authorised inside
 * its service, where the platform identity, the platform permission and the
 * tenant id are checked together. Authorisation is not delegated to a route
 * decorator alone, because these endpoints legitimately read across tenants and
 * the tenant being addressed is part of the decision.
 */
@UseGuards(JwtAuthGuard)
@Controller('platform/tenants')
export class TenantControlPlaneController {
  constructor(
    private readonly controlPlane: TenantControlPlaneService,
    private readonly access: TenantAccessService,
    private readonly modules: TenantModulesService,
    private readonly apps: TenantAppsService,
    private readonly operations: TenantOperationsService,
    private readonly erasure: TenantErasureService,
  ) {}

  @Get(':tenantId/overview')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.overview(user, tenantId);
  }

  @Get(':tenantId/readiness')
  readiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.readiness(user, tenantId);
  }

  @Get(':tenantId/configuration')
  configuration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.configuration(user, tenantId);
  }

  @Get(':tenantId/commercial')
  commercial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.commercial(user, tenantId);
  }

  @Get(':tenantId/timeline')
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.timeline(user, tenantId);
  }

  @Get(':tenantId/system')
  system(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.controlPlane.system(user, tenantId);
  }

  @Post(':tenantId/status')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: ChangeTenantStatusDto,
  ) {
    return this.controlPlane.changeStatus(user, tenantId, dto);
  }

  @Post(':tenantId/subscription/cancel')
  cancelSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: CancelTenantSubscriptionDto,
  ) {
    return this.controlPlane.cancelSubscription(user, tenantId, dto);
  }

  @Get(':tenantId/access')
  listAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.access.list(user, tenantId);
  }

  @Post(':tenantId/access')
  createIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: CreateTenantIdentityDto,
  ) {
    return this.access.create(user, tenantId, dto);
  }

  @Patch(':tenantId/access/:userId')
  updateIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateTenantIdentityDto,
  ) {
    return this.access.update(user, tenantId, userId, dto);
  }

  @Post(':tenantId/access/:userId/password-reset')
  sendPasswordReset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.access.sendPasswordReset(user, tenantId, userId);
  }

  @Post(':tenantId/access/:userId/resend-invitation')
  resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.access.resendInvitation(user, tenantId, userId);
  }

  @Post(':tenantId/access/:userId/rotate-credential')
  rotateCredential(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.access.rotateServiceAccountCredential(user, tenantId, userId);
  }

  @Post(':tenantId/access/transfer-ownership')
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: TransferTenantOwnershipDto,
  ) {
    return this.access.transferOwnership(user, tenantId, dto);
  }

  @Delete(':tenantId/access/:userId')
  removeIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: DeleteTenantIdentityDto,
  ) {
    return this.access.remove(user, tenantId, userId, dto);
  }

  @Get(':tenantId/modules')
  listModules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.modules.list(user, tenantId);
  }

  @Patch(':tenantId/modules')
  updateModules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantModulesDto,
  ) {
    return this.modules.update(user, tenantId, dto);
  }

  @Get(':tenantId/apps')
  listApps(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.apps.list(user, tenantId);
  }

  @Get(':tenantId/apps/:appKey/installations')
  listInstallations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appKey') appKey: string,
  ) {
    return this.apps.installations(user, tenantId, appKey);
  }

  @Get(':tenantId/apps/:appKey/releases')
  listReleases(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appKey') appKey: string,
  ) {
    return this.apps.releases(user, tenantId, appKey);
  }

  @Patch(':tenantId/apps/:appKey')
  updateApp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appKey') appKey: string,
    @Body() dto: UpdateTenantAppDto,
  ) {
    return this.apps.update(user, tenantId, appKey, dto);
  }

  @Get(':tenantId/operations')
  operationsOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.operations.overview(user, tenantId);
  }

  @Post(':tenantId/operations/retry-provisioning')
  retryProvisioning(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: RetryTenantProvisioningDto,
  ) {
    return this.operations.retryProvisioning(user, tenantId, dto);
  }

  @Get(':tenantId/erasure-preflight')
  erasurePreflight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.erasure.preflight(user, tenantId);
  }

  @Post(':tenantId/erase')
  erase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: EraseTenantDto,
  ) {
    return this.erasure.erase(user, tenantId, dto);
  }

  @Get('erasure-receipts')
  listReceipts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.erasure.listReceipts(user, tenantId);
  }
}
