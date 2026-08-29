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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RequirePermission } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreatePayComponentDto } from './dto/create-pay-component.dto';
import { ListPayComponentsDto } from './dto/list-pay-components.dto';
import { UpdatePayComponentDto } from './dto/update-pay-component.dto';
import { PayComponentsService } from './pay-components.service';

@Controller('pay-components')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class PayComponentsController {
  constructor(private readonly payComponentsService: PayComponentsService) {}

  @Get()
  @Permissions('pay-components.read')
  @RequirePermission(ENTITY_KEYS.PAY_COMPONENTS, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPayComponentsDto,
  ) {
    return this.payComponentsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('pay-components.read')
  @RequirePermission(ENTITY_KEYS.PAY_COMPONENTS, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payComponentsService.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('pay-components.manage')
  @RequirePermission(ENTITY_KEYS.PAY_COMPONENTS, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayComponentDto,
  ) {
    return this.payComponentsService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('pay-components.manage')
  @RequirePermission(ENTITY_KEYS.PAY_COMPONENTS, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayComponentDto,
  ) {
    return this.payComponentsService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('pay-components.manage')
  @RequirePermission(ENTITY_KEYS.PAY_COMPONENTS, 'manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payComponentsService.deactivate(user, id);
  }
}
