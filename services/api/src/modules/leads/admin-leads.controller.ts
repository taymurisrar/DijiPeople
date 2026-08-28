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
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import {
  BulkAssignLeadsDto,
  CreateAdminLeadDto,
  CorrectLeadAttributionDto,
  LeadQueryDto,
  UpdateAdminLeadDto,
} from './dto/admin-lead.dto';
import { LeadsService } from './leads.service';

@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)
@Controller('super-admin/leads')
export class AdminLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: LeadQueryDto) {
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

  @Patch(':leadId/attribution')
  correctAttribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() dto: CorrectLeadAttributionDto,
  ) {
    return this.leadsService.correctAttribution(user, leadId, dto);
  }

  /*
   * Bulk lead delete is deliberately absent (BUG-0018).
   *
   * A lead carries commercial attribution — which partner referred whom, and
   * when — and that history outlives the lead's own usefulness: it is what a
   * commission is calculated from and what a partner dispute is settled with.
   * Deleting leads in bulk destroys it for an unbounded number of records at
   * once, and the record made "should this exist at all?" the first question
   * rather than the last.
   *
   * Answered on 2026-08-28: no. Converted leads were already refused; the rest
   * are withdrawn from sale rather than removed, the same stance this platform
   * takes on plans, promotions and invoices.
   *
   * `DELETE /:leadId` for a single lead is unaffected and still exists.
   */

  @Patch('bulk/assign')
  bulkAssign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAssignLeadsDto,
  ) {
    return this.leadsService.bulkAssignLeads(user, dto);
  }
}
