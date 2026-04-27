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
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  BulkAssignLeadsDto,
  BulkDeleteLeadsDto,
  CreateAdminLeadDto,
  LeadQueryDto,
  UpdateAdminLeadDto,
} from './dto/admin-lead.dto';
import { LeadsService } from './leads.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('system-admin')
@Controller('super-admin/leads')
export class AdminLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeadQueryDto,
  ) {
    return this.leadsService.listLeads(user, query);
  }

  @Get(':leadId')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
  ) {
    return this.leadsService.getLead(user, leadId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminLeadDto,
  ) {
    return this.leadsService.createLead(user, dto);
  }

  @Patch(':leadId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() dto: UpdateAdminLeadDto,
  ) {
    return this.leadsService.updateLead(user, leadId, dto);
  }

  @Delete()
  bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteLeadsDto,
  ) {
    return this.leadsService.bulkDeleteLeads(user, dto.ids);
  }

  @Patch('bulk/assign')
  bulkAssign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAssignLeadsDto,
  ) {
    return this.leadsService.bulkAssignLeads(user, dto);
  }
}

