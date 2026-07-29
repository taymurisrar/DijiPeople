import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { AuditService } from '../audit/audit.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions('customers.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(user.tenantId, search);
  }

  @Get(':customerId')
  @Permissions('customers.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ) {
    return this.customersService.findOne(user.tenantId, customerId);
  }

  @Get(':customerId/timeline')
  @Permissions('customers.read', 'timeline.read')
  async getTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ) {
    await this.customersService.findOne(user.tenantId, customerId);
    return this.auditService.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: 'Customer',
      entityId: customerId,
      recordHref: `/customers/${customerId}`,
    });
  }

  @Post()
  @Permissions('customers.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, dto);
  }

  @Patch(':customerId')
  @Permissions('customers.write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, customerId, dto);
  }
}
