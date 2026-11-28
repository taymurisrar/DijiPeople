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
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CheckNoteDto,
  CreateDutyHandoverDto,
  CreateDutyTemplateDto,
  GenerateDutiesDto,
  ListDutyHandoversDto,
  ListDutyOccurrencesDto,
  ListDutyTemplatesDto,
  UpdateDutyTemplateDto,
} from './dto/work-duty.dto';
import { WorkDutiesService } from './work-duties.service';

/*
 * Duties, checklists and handovers (WP-36.S1). They reuse the work-items
 * permissions: an occurrence is a work item, and who reaches which one is decided
 * in the service by the same employee-scope rule. Nothing is deleted: a template is
 * deactivated and a handover is acknowledged, and both stay in history.
 */
@Controller('work-duties')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkDutiesController {
  constructor(private readonly service: WorkDutiesService) {}

  @Get('templates')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyTemplatesDto,
  ) {
    return this.service.listTemplates(user, query);
  }

  @Post('templates')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyTemplateDto,
  ) {
    return this.service.createTemplate(user, dto);
  }

  @Get('templates/:id')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getTemplate(user, id);
  }

  @Patch('templates/:id')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDutyTemplateDto,
  ) {
    return this.service.updateTemplate(user, id, dto);
  }

  @Post('templates/:id/deactivate')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  deactivateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setTemplateActive(user, id, false);
  }

  @Post('templates/:id/activate')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  activateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setTemplateActive(user, id, true);
  }

  @Post('generate')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateDutiesDto,
  ) {
    return this.service.generate(user, dto);
  }

  @Get('occurrences')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listOccurrences(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyOccurrencesDto,
  ) {
    return this.service.listOccurrences(user, query);
  }

  @Get('occurrences/:id')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getOccurrence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getOccurrence(user, id);
  }

  @Post('occurrences/:id/complete')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  completeOccurrence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.completeOccurrence(user, id);
  }

  @Post('checks/:id/complete')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  completeCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CheckNoteDto,
  ) {
    return this.service.setCheck(user, id, true, dto.note);
  }

  @Post('checks/:id/uncomplete')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  uncompleteCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setCheck(user, id, false);
  }

  @Get('handovers')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listHandovers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyHandoversDto,
  ) {
    return this.service.listHandovers(user, query);
  }

  @Post('handovers')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createHandover(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyHandoverDto,
  ) {
    return this.service.createHandover(user, dto);
  }

  @Post('handovers/:id/acknowledge')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  acknowledgeHandover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.acknowledgeHandover(user, id);
  }
}
