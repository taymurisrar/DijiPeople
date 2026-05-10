import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  CloneEmailTemplateDto,
  CreateEmailProviderDto,
  CreateEmailTemplateDto,
  EmailDeliveryLogQueryDto,
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailProviderDto,
  UpdateEmailTemplateDto,
  UpdateNotificationPreferencesDto,
} from './dto';
import { NOTIFICATION_PERMISSION_KEYS } from './notifications.constants';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('events')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  listEvents() {
    return this.notificationsService.listEvents();
  }

  @Get('events/:code')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  getEvent(@Param('code') code: string) {
    return this.notificationsService.getEvent(code);
  }

  @Get('preferences')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  listPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listPreferences(user);
  }

  @Patch('preferences')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_MANAGE)
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user, dto);
  }

  @Get('email-templates')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listTemplates(user);
  }

  @Get('email-templates/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  getTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.getTemplate(user, templateId);
  }

  @Post('email-templates')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    return this.notificationsService.createTemplate(user, dto);
  }

  @Patch('email-templates/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.notificationsService.updateTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/clone')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  cloneTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: CloneEmailTemplateDto,
  ) {
    return this.notificationsService.cloneTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/activate')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  activateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.activateTemplate(user, templateId);
  }

  @Post('email-templates/:id/archive')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  archiveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.archiveTemplate(user, templateId);
  }

  @Post('email-templates/:id/preview')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  previewTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return this.notificationsService.previewTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/test-send')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  testSendTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: TestSendEmailTemplateDto,
  ) {
    return this.notificationsService.testSendTemplate(user, templateId, dto);
  }

  @Get('email-providers')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  listProviderSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listProviderSettings(user);
  }

  @Get('email-providers/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  getProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.getProvider(user, providerId);
  }

  @Post('email-providers')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  createProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmailProviderDto,
  ) {
    return this.notificationsService.createProvider(user, dto);
  }

  @Patch('email-providers/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  updateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
    @Body() dto: UpdateEmailProviderDto,
  ) {
    return this.notificationsService.updateProvider(user, providerId, dto);
  }

  @Post('email-providers/:id/set-default')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  setDefaultProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.setDefaultProvider(user, providerId);
  }

  @Post('email-providers/:id/disable')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  disableProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.disableProvider(user, providerId);
  }

  @Post('email-providers/:id/validate')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  validateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.validateProvider(user, providerId);
  }

  @Get('email-delivery-logs')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)
  listDeliveryLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmailDeliveryLogQueryDto,
  ) {
    return this.notificationsService.listDeliveryLogs(user, query);
  }

  @Get('email-delivery-logs/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)
  getDeliveryLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deliveryLogId: string,
  ) {
    return this.notificationsService.getDeliveryLog(user, deliveryLogId);
  }
}
