import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MISC_PERMISSION_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

/*
 * Mutations here reshape the organization hierarchy, and business-unit
 * membership underneath it is what accessContext.accessibleBusinessUnitIds and
 * buildScopedAccessWhere() derive row-level access from. This controller
 * carried JwtAuthGuard alone and the service performed no authorization at all,
 * so any authenticated tenant user could create, rename or delete a legal
 * entity, and thereby influence the scope other people's queries run under.
 *
 * organization.manage already existed for exactly this -- "Manage organizations
 * and business units", "Maintain organization and business-unit hierarchy" --
 * and had no call sites anywhere. It is wired up here rather than replaced.
 *
 * Reads are deliberately left alone. business-units.read exists but is granted
 * to no seeded role, and these lists feed the user-administration, timesheet
 * and payroll-settings screens, so gating them is a separate decision rather
 * than part of this fix.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.findOrganizations(user.tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findOrganizationById(user.tenantId, id);
  }

  @Get(':id/children')
  getChildren(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.getChildOrganizations(user.tenantId, id);
  }

  @Get(':id/parents')
  getParents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.getParentOrganizations(user.tenantId, id);
  }

  @Get(':id/subtree')
  getSubtree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.fetchOrganizationSubtree(user.tenantId, id);
  }

  @Post()
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationService.createOrganization(user, dto);
  }

  @Patch(':id')
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.updateOrganization(user, id, dto);
  }

  @Delete(':id')
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.deleteOrganization(user, id);
  }
}
