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
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import {
  BulkAssignLeadsDto,
  BulkDeleteLeadsDto,
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

  /**
   * Bulk lead delete, restored on 2026-08-28 (BUG-0018).
   *
   * This route was removed earlier the same day on the reasoning that a lead
   * carries partner attribution a commission is calculated from, so a selection
   * should never be deletable at once. The repository owner reversed that later
   * the same day: bulk delete is to be generically available across the admin
   * console, and leads are not an exception to it.
   *
   * The attribution argument was not wrong, and it is not discarded here — it
   * is answered elsewhere. Deletion is audited, the console confirmation names
   * the count and the records it is about to remove, and converted leads are
   * still refused individually by the service. What changed is who decides, and
   * they decided.
   */
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
