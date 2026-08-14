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
import { MISC_PERMISSION_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateBusinessUnitDto } from './dto/create-business-unit.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateBusinessUnitDto } from './dto/update-business-unit.dto';
import { OrganizationService } from './organization.service';

/*
 * Business-unit membership is the input to accessContext.accessibleBusinessUnitIds,
 * which buildScopedAccessWhere() uses to decide which rows a BUSINESS_UNIT or
 * PARENT_CHILD_BUSINESS_UNIT scoped role may read. Creating, reparenting or
 * deleting a unit therefore edits the access-control graph itself, not just a
 * label -- which is why these three routes are the sharpest edge of the pair.
 *
 * They carried JwtAuthGuard alone and the service performed no authorization,
 * so any authenticated tenant user could reshape that graph. See the note on
 * OrganizationsController for why organization.manage is the key used and why
 * the read routes are left as they are.
 */
@Controller('business-units')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BusinessUnitsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMasterDataDto,
  ) {
    return this.organizationService.findBusinessUnits(user.tenantId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findBusinessUnitById(user.tenantId, id);
  }

  @Get(':id/children')
  getChildren(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.getChildBusinessUnits(user.tenantId, id);
  }

  @Get(':id/parents')
  getParents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.getParentBusinessUnits(user.tenantId, id);
  }

  @Get(':id/subtree')
  getSubtree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.fetchBusinessUnitSubtree(user.tenantId, id);
  }

  @Post()
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBusinessUnitDto,
  ) {
    return this.organizationService.createBusinessUnit(user, dto);
  }

  // Reparenting happens through this route: UpdateBusinessUnitDto carries
  // parentBusinessUnitId, so a move is an update and needs the same authority.
  @Patch(':id')
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBusinessUnitDto,
  ) {
    return this.organizationService.updateBusinessUnit(user, id, dto);
  }

  @Delete(':id')
  @Permissions(MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.deleteBusinessUnit(user, id);
  }
}
