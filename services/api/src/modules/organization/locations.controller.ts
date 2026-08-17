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
import { CreateLocationDto } from './dto/create-location.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { OrganizationService } from './organization.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Permissions('locations.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMasterDataDto,
  ) {
    return this.organizationService.findLocations(
      user.tenantId,
      constrainReferenceListQuery(user, query, 'locations.read'),
    );
  }

  @Get(':id')
  @Permissions('locations.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findLocationById(user.tenantId, id);
  }

  @Post()
  @Permissions('locations.create')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLocationDto,
  ) {
    return this.organizationService.createLocation(user, dto);
  }

  @Patch(':id')
  @Permissions('locations.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.organizationService.updateLocation(user, id, dto);
  }

  @Delete(':id')
  @Permissions('locations.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.updateLocation(user, id, {
      isActive: false,
    });
  }
}
