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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CloneEmailTemplateDto,
  CreateEmailProviderDto,
  CreateEmailTemplateDto,
  EmailDeliveryLogQueryDto,
  InAppNotificationQueryDto,
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailProviderDto,
  UpdateEmailTemplateDto,
  UpdateNotificationEventChannelDto,
  UpdateNotificationPreferencesDto,
  UpdateNotificationRuleDto,
} from './dto';
import { PROVIDER_SCHEMAS } from './email/provider-field-schema';
import { InAppNotificationsService } from './in-app-notifications.service';
import { NotificationDiagnosticsService } from './notification-diagnostics.service';
import { NOTIFICATION_PERMISSION_KEYS } from './notifications.constants';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly inAppNotificationsService: InAppNotificationsService,
    private readonly diagnosticsService: NotificationDiagnosticsService,
  ) {}

  @Get('events')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listEvents() {
    return this.notificationsService.listEvents();
  }

  @Get('events/:code')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  getEvent(@Param('code') code: string) {
    return this.notificationsService.getEvent(code);
  }

  @Get('preferences')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listPreferences(user);
  }

  @Patch('preferences')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_MANAGE)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user, dto);
  }

  /*
   * BUG-3375. `NotificationRule` — the model that actually decides whether an
   * event notifies anyone — had no controller at all before this. Registered
   * before `email-templates/:id`-style routes are not at risk here since the
   * path segment differs, but kept grouped with `preferences` because the two
   * are shown on the same screen.
   */
  @Get('rules')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listRules(user);
  }

  @Patch('rules/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_MANAGE_RULES)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') ruleId: string,
    @Body() dto: UpdateNotificationRuleDto,
  ) {
    return this.notificationsService.updateRule(user, ruleId, dto);
  }

  /*
   * ITEM-0180 — the notification events page. `event-settings` rather than a
   * sub-path of `events/:code`, so it cannot collide with that parameterised
   * route.
   *
   * The write declares BOTH legacy keys because it writes both models: the
   * channel preference (`notifications.manage`) and, when the first channel
   * comes back on or the last one goes off, the event's rule
   * (`notifications.manageRules`). PermissionsGuard requires every declared
   * legacy key, so holding only one of them is not enough to change either.
   */
  @Get('event-settings')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listEventSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listEventSettings(user);
  }

  @Patch('event-settings/:code')
  @Permissions(
    NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_MANAGE,
    NOTIFICATION_PERMISSION_KEYS.NOTIFICATIONS_MANAGE_RULES,
  )
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  updateEventChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') eventCode: string,
    @Body() dto: UpdateNotificationEventChannelDto,
  ) {
    return this.notificationsService.updateEventChannel(user, eventCode, dto);
  }

  @Get('email-templates')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listTemplates(user);
  }

  /*
   * The placements and modules a template may be limited to, for the authoring
   * screen. Registered before the :id route so it is not read as a template id.
   */
  @Get('email-templates/scope-options')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listScopeOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listTemplateScopeOptions(user);
  }

  @Get('email-templates/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  getTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.getTemplate(user, templateId);
  }

  @Post('email-templates')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    return this.notificationsService.createTemplate(user, dto);
  }

  @Patch('email-templates/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.notificationsService.updateTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/clone')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  cloneTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: CloneEmailTemplateDto,
  ) {
    return this.notificationsService.cloneTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/activate')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  activateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.activateTemplate(user, templateId);
  }

  @Post('email-templates/:id/archive')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  archiveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.archiveTemplate(user, templateId);
  }

  @Post('email-templates/:id/preview')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  previewTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return this.notificationsService.previewTemplate(user, templateId, dto);
  }

  @Post('email-templates/:id/test-send')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  testSendTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') templateId: string,
    @Body() dto: TestSendEmailTemplateDto,
  ) {
    return this.notificationsService.testSendTemplate(user, templateId, dto);
  }

  /*
   * What each provider type needs configured, so the screen can render the
   * right fields instead of asking for raw JSON. Registered before :id.
   */
  @Get('email-providers/field-schema')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listProviderFieldSchema() {
    return { items: PROVIDER_SCHEMAS };
  }

  @Get('email-providers')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listProviderSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listProviderSettings(user);
  }

  /*
   * ITEM-0129 — which provider will actually carry this tenant's mail.
   *
   * Declared BEFORE `email-providers/:id` on purpose. Nest matches in
   * declaration order, so the parameterised route would otherwise swallow
   * `effective` and try to load a provider whose id is the literal string.
   */
  @Get('email-providers/effective')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  getEffectiveProvider(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.describeEffectiveProvider(user);
  }

  @Get('email-providers/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  getProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.getProvider(user, providerId);
  }

  @Post('email-providers')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  createProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmailProviderDto,
  ) {
    return this.notificationsService.createProvider(user, dto);
  }

  @Patch('email-providers/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  updateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
    @Body() dto: UpdateEmailProviderDto,
  ) {
    return this.notificationsService.updateProvider(user, providerId, dto);
  }

  @Post('email-providers/:id/set-default')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  setDefaultProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.setDefaultProvider(user, providerId);
  }

  @Post('email-providers/:id/disable')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  disableProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.disableProvider(user, providerId);
  }

  @Post('email-providers/:id/validate')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  validateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') providerId: string,
  ) {
    return this.notificationsService.validateProvider(user, providerId);
  }

  @Get('email-delivery-logs')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listDeliveryLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmailDeliveryLogQueryDto,
  ) {
    return this.notificationsService.listDeliveryLogs(user, query);
  }

  @Get('email-delivery-logs/:id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getDeliveryLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deliveryLogId: string,
  ) {
    return this.notificationsService.getDeliveryLog(user, deliveryLogId);
  }

  /*
   * ITEM-0168. A distinct permission from NOTIFICATION_LOGS_READ on purpose —
   * being able to read a log is not authority to make the system send mail
   * again. Tenant-scoped inside the service via findFirst({ id, tenantId }).
   */
  @Post('email-delivery-logs/:id/retry')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_RETRY)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  retryDeliveryLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deliveryLogId: string,
  ) {
    return this.notificationsService.retryDeliveryLog(user, deliveryLogId);
  }

  @Get('in-app')
  @Permissions('inbox.read')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listInAppNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InAppNotificationQueryDto,
  ) {
    return this.inAppNotificationsService.listForUser(user, query);
  }

  @Get('in-app/unread-count')
  @Permissions('inbox.read')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  getInAppUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.inAppNotificationsService.getUnreadCount(user);
  }

  @Post('in-app/:id/read')
  @Permissions('inbox.markRead')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  markInAppNotificationRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') recipientId: string,
  ) {
    return this.inAppNotificationsService.markRead(user, recipientId);
  }

  @Post('in-app/:id/archive')
  @Permissions('inbox.markRead')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  archiveInAppNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') recipientId: string,
  ) {
    return this.inAppNotificationsService.archive(user, recipientId);
  }

  @Post('in-app/:id/popup-shown')
  @Permissions('inbox.markRead')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  markInAppNotificationPopupShown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') recipientId: string,
  ) {
    return this.inAppNotificationsService.markPopupShown(user, recipientId);
  }

  @Get('diagnostics')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_DIAGNOSTICS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getDiagnostics(@CurrentUser() user: AuthenticatedUser) {
    return this.diagnosticsService.getTenantDiagnostics(user.tenantId);
  }
}
