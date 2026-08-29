import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentRecheckService } from '../billing/services/payment-recheck.service';
import { PlatformFxService } from './platform-fx.service';
import type { PlatformRateView } from './platform-fx.service';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreatePlanPriceDto } from './dto/create-plan-price.dto';
import {
  BulkDeleteCustomerOnboardingsDto,
  BulkDeleteCustomersDto,
  CreateCustomerDto,
  CreateCustomerOnboardingRecordDto,
  CreateTenantFromOnboardingDto,
  CustomerOnboardingQueryDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpdateCustomerOnboardingDto,
} from './dto/customer-lifecycle.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateInvoiceFromSubscriptionDto } from './dto/create-invoice-from-subscription.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePlanPriceDto } from './dto/update-plan-price.dto';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { SetExchangeRateDto } from './dto/exchange-rate.dto';
import { UpdatePrimaryOwnerDto } from './dto/update-primary-owner.dto';
import { UpdateTenantCustomerAccountDto } from './dto/update-tenant-customer-account.dto';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { SetAgentAssignmentDto } from './dto/set-agent-assignment.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantSlugDto } from '../tenants/dto/update-tenant-slug.dto';
import { SuperAdminService } from './super-admin.service';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';
import {
  CreateTenantAccessUserDto,
  UpdateTenantAccessUserDto,
} from './dto/tenant-access-user.dto';
import {
  SendPlatformTestEmailDto,
  UpdatePlatformEmailSettingsDto,
  UpdatePlatformEmailTemplateDto,
} from '../platform-communications/dto/platform-email-settings.dto';
import {
  emailPage,
  PlatformCommunicationsService,
} from '../platform-communications/platform-communications.service';
import { PlatformEmailSettingsService } from '../platform-communications/platform-email-settings.service';

@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly platformEmailSettings: PlatformEmailSettingsService,
    private readonly platformCommunications: PlatformCommunicationsService,
    private readonly paymentRecheck: PaymentRecheckService,
    private readonly fx: PlatformFxService,
  ) {}

  @Get('dashboard-summary')
  getDashboardSummary(@Query('range') range?: string) {
    return this.superAdminService.getDashboardSummary(range);
  }

  @Get('lifecycle-options')
  getLifecycleOptions() {
    return this.superAdminService.getLifecycleOptions();
  }

  @Get('operators')
  listOperators() {
    return this.superAdminService.listOperators();
  }

  @Post('leads/:leadId/convert')
  convertLeadToCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() dto: ConvertLeadToCustomerDto,
  ) {
    return this.superAdminService.convertLeadToCustomer(user, leadId, dto);
  }

  @Get('customers')
  listCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerQueryDto,
  ) {
    return this.superAdminService.listCustomers(user, query);
  }

  @Get('customers/:customerAccountId')
  getCustomerDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerDetail(user, customerAccountId);
  }

  @Get('customers/:customerAccountId/onboardings')
  getCustomerOnboardings(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerOnboardings(customerAccountId);
  }

  @Get('customers/:customerAccountId/tenants')
  getCustomerTenants(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerTenants(customerAccountId);
  }

  @Get('customers/:customerAccountId/subscriptions')
  getCustomerSubscriptions(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerSubscriptions(customerAccountId);
  }

  @Get('customers/:customerAccountId/invoices')
  getCustomerInvoices(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerInvoices(customerAccountId);
  }

  @Get('customers/:customerAccountId/payments')
  getCustomerPayments(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerPayments(customerAccountId);
  }

  @Post('customers')
  createCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.superAdminService.createCustomer(user, dto);
  }

  @Patch('customers/:customerAccountId')
  updateCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.superAdminService.updateCustomer(user, customerAccountId, dto);
  }

  @Delete('customers')
  bulkDeleteCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteCustomersDto,
  ) {
    return this.superAdminService.bulkDeleteCustomers(user, dto);
  }

  @Get('customer-onboarding')
  listCustomerOnboardings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerOnboardingQueryDto,
  ) {
    return this.superAdminService.listCustomerOnboardings(user, query);
  }

  @Get('customer-onboarding/:onboardingId')
  getCustomerOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.superAdminService.getCustomerOnboarding(user, onboardingId);
  }

  @Post('customer-onboarding')
  createCustomerOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerOnboardingRecordDto,
  ) {
    return this.superAdminService.createCustomerOnboarding(user, dto);
  }

  @Patch('customer-onboarding/:onboardingId')
  updateCustomerOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
    @Body() dto: UpdateCustomerOnboardingDto,
  ) {
    return this.superAdminService.updateCustomerOnboarding(
      user,
      onboardingId,
      dto,
    );
  }

  @Delete('customer-onboarding')
  bulkDeleteCustomerOnboardings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteCustomerOnboardingsDto,
  ) {
    return this.superAdminService.bulkDeleteCustomerOnboardings(user, dto);
  }

  @Post('customer-onboarding/:onboardingId/create-tenant')
  createTenantFromOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
    @Body() dto: CreateTenantFromOnboardingDto,
  ) {
    return this.superAdminService.createTenantFromOnboarding(
      user,
      onboardingId,
      dto,
    );
  }

  @Get('tenants')
  listTenants() {
    return this.superAdminService.listTenants();
  }

  @Get('tenant-slug/availability')
  checkTenantSlugAvailability(
    @Query('slug') slug: string,
    @Query('excludeTenantId') excludeTenantId?: string,
  ) {
    return this.superAdminService.checkTenantSlugAvailability(
      slug,
      excludeTenantId,
    );
  }

  @Get('tenants/:tenantId')
  getTenantDetail(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.superAdminService.getTenantDetail(tenantId);
  }

  @Patch('tenants/:tenantId')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)
  updateTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.superAdminService.updateTenant(user, tenantId, dto);
  }

  @Patch('tenants/:tenantId/slug')
  updateTenantSlug(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantSlugDto,
  ) {
    return this.superAdminService.updateTenantSlug(user, tenantId, dto);
  }

  @Patch('tenants/:tenantId/customer-account')
  updateTenantCustomerAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantCustomerAccountDto,
  ) {
    return this.superAdminService.updateTenantCustomerAccount(
      user,
      tenantId,
      dto,
    );
  }

  @Patch('tenants/:tenantId/status')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  updateTenantStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.superAdminService.updateTenantStatus(user, tenantId, dto);
  }

  // Desktop-agent rollout (TASK-0027): which tenants receive a release, and on
  // which channel. Platform-guarded like the rest of this controller.
  @Get('agent-assignments')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  listAgentAssignments() {
    return this.superAdminService.listAgentAssignments();
  }

  @Patch('tenants/:tenantId/agent-assignment')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  setAgentAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: SetAgentAssignmentDto,
  ) {
    return this.superAdminService.setAgentAssignment(user, tenantId, dto);
  }

  @Get('tenants/:tenantId/audit-logs')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  listTenantAuditLogs(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.superAdminService.listTenantAuditLogs(tenantId);
  }

  @Get('tenants/:tenantId/access-users')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  listTenantAccessUsers(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.superAdminService.listTenantAccessUsers(tenantId);
  }

  @Post('tenants/:tenantId/access-users')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  createTenantAccessUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: CreateTenantAccessUserDto,
  ) {
    return this.superAdminService.createTenantAccessUser(user, tenantId, dto);
  }

  @Patch('tenants/:tenantId/access-users/:userId')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  updateTenantAccessUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateTenantAccessUserDto,
  ) {
    return this.superAdminService.updateTenantAccessUser(
      user,
      tenantId,
      userId,
      dto,
    );
  }

  @Post('tenants/:tenantId/access-users/:userId/reset-activation')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  resetTenantAccessUserActivation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.superAdminService.resetTenantAccessUserActivation(
      user,
      tenantId,
      userId,
    );
  }

  @Post('tenants/:tenantId/access-users/:userId/reset-password')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  resetTenantAccessUserPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.superAdminService.resetTenantAccessUserPassword(
      user,
      tenantId,
      userId,
    );
  }

  @Get('tenants/:tenantId/invoices')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  listTenantInvoices(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.superAdminService.listTenantInvoices(tenantId);
  }

  @Patch('tenants/:tenantId/subscription')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  updateTenantSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.superAdminService.updateTenantSubscription(user, tenantId, dto);
  }

  @Get('subscriptions')
  listSubscriptions() {
    return this.superAdminService.listSubscriptions();
  }

  @Get('invoices')
  listInvoices() {
    return this.superAdminService.listInvoices();
  }

  @Get('invoices/:invoiceId')
  getInvoiceDetail(@Param('invoiceId', new ParseUUIDPipe()) invoiceId: string) {
    return this.superAdminService.getInvoiceDetail(invoiceId);
  }

  @Get('invoices/:invoiceId/pdf')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  async downloadInvoicePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.superAdminService.downloadInvoicePdf(
      user,
      invoiceId,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.fileName.replaceAll('"', '')}"`,
    );
    response.setHeader('Content-Length', String(pdf.buffer.length));
    return new StreamableFile(pdf.buffer);
  }

  @Post('invoices/:invoiceId/email')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  emailInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ) {
    return this.superAdminService.emailInvoice(user, invoiceId);
  }

  @Patch('invoices/:invoiceId/status')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  updateInvoiceStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.superAdminService.updateInvoiceStatus(user, invoiceId, dto);
  }

  @Post('subscriptions/:subscriptionId/invoices')
  @RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
  createInvoiceFromSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
    @Body() dto: CreateInvoiceFromSubscriptionDto,
  ) {
    return this.superAdminService.createInvoiceFromSubscription(
      user,
      subscriptionId,
      dto,
    );
  }

  @Get('payments')
  listPayments() {
    return this.superAdminService.listPayments();
  }

  @Post('payments')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.superAdminService.recordPayment(user, dto);
  }

  @Get('tenants/:tenantId/features')
  getEnabledFeatures(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.superAdminService.getEnabledFeatures(tenantId);
  }

  @Patch('tenants/:tenantId/features')
  updateTenantFeatures(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantFeaturesDto,
  ) {
    return this.superAdminService.updateTenantFeatures(user, tenantId, dto);
  }

  @Patch('tenants/:tenantId/primary-owner')
  updatePrimaryOwner(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdatePrimaryOwnerDto,
  ) {
    return this.superAdminService.updatePrimaryOwner(tenantId, dto);
  }

  @Get('tenants/:tenantId/owner-summary')
  getTenantOwnerSummary(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.superAdminService.getTenantOwnerSummary(tenantId);
  }

  @Post('tenants/:tenantId/owner/reset-password')
  resetTenantOwnerPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.superAdminService.resetTenantOwnerPassword(user, tenantId);
  }

  @Post('tenants/:tenantId/owner/resend-activation')
  resendTenantOwnerActivation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.superAdminService.resendTenantOwnerActivation(user, tenantId);
  }

  @Get('plans')
  listPlans(@Query('sellable') sellable?: string) {
    // `?sellable=true` narrows to plans a customer could be put on — see
    // `listPlans`. Absent, the full catalogue, which is what the Plans screen
    // itself needs (BUG-1555).
    return this.superAdminService.listPlans(sellable === 'true');
  }

  @Get('feature-catalog')
  getFeatureCatalog() {
    return this.superAdminService.getFeatureCatalog();
  }

  @Get('plans/:planId')
  getPlanDetail(@Param('planId', new ParseUUIDPipe()) planId: string) {
    return this.superAdminService.getPlanDetail(planId);
  }

  @Post('plans')
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlanDto,
  ) {
    return this.superAdminService.createPlan(user, dto);
  }

  @Patch('plans/:planId')
  updatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.superAdminService.updatePlan(user, planId, dto);
  }

  /*
   * There was no way to remove a plan at all.
   *
   * A plan created through the console was born active with no `PlanPrice`
   * rows, so it advertised itself and could not be bought — and with no delete
   * route it could not be removed either. Two are stuck in production in
   * exactly that state (BUG-1749).
   *
   * Refused once a plan has subscriptions or prices: see `deletePlan`.
   */
  @Delete('plans/:planId')
  deletePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId', new ParseUUIDPipe()) planId: string,
  ) {
    return this.superAdminService.deletePlan(user, planId);
  }

  @Get('plans/:planId/prices')
  listPlanPrices(@Param('planId', new ParseUUIDPipe()) planId: string) {
    return this.superAdminService.listPlanPrices(planId);
  }

  @Post('plans/:planId/prices')
  createPlanPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() dto: CreatePlanPriceDto,
  ) {
    return this.superAdminService.createPlanPrice(user, planId, dto);
  }

  @Patch('plans/:planId/prices/:priceId')
  updatePlanPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
    @Body() dto: UpdatePlanPriceDto,
  ) {
    return this.superAdminService.updatePlanPrice(user, planId, priceId, dto);
  }

  /*
   * Two outcomes behind one verb, and the default is the safe one.
   *
   * Bare DELETE deactivates: the price leaves checkout and the billing record
   * survives, which is what you want for anything a customer has ever bought.
   * `?mode=permanent` removes the row, for the price that was a typo. The
   * service refuses that whenever anything references the row, so the flag
   * widens what is *offered*, never what is *allowed*.
   */
  @Delete('plans/:planId/prices/:priceId')
  deactivatePlanPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
    @Query('mode') mode?: string,
  ) {
    return mode === 'permanent'
      ? this.superAdminService.deletePlanPrice(user, planId, priceId)
      : this.superAdminService.deactivatePlanPrice(user, planId, priceId);
  }

  @Get('promotions')
  listPromotions() {
    return this.superAdminService.listPromotions();
  }

  @Get('promotions/targets')
  listPromotionTargets(@Query('scope') scope?: string) {
    return this.superAdminService.listPromotionTargets(scope);
  }

  @Post('promotions')
  createPromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.superAdminService.createPromotion(user, dto);
  }

  @Patch('promotions/:promotionId')
  updatePromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promotionId', new ParseUUIDPipe()) promotionId: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.superAdminService.updatePromotion(user, promotionId, dto);
  }

  /*
   * `DELETE` removes the promotion. It used to call `deactivatePromotion`,
   * answering 200 with the record body while the row stayed put — the verb said
   * one thing and the handler did another, and with only Deactivate in the UI a
   * mistyped promotion was permanent (BUG-1757).
   *
   * A redeemed promotion is refused: see `deletePromotion` for where the line
   * is drawn and why it is redemption rather than existence.
   */
  @Delete('promotions/:promotionId')
  deletePromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promotionId', new ParseUUIDPipe()) promotionId: string,
  ) {
    return this.superAdminService.deletePromotion(user, promotionId);
  }

  /** Stop a promotion applying further, keeping the record and its history. */
  @Post('promotions/:promotionId/deactivate')
  deactivatePromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promotionId', new ParseUUIDPipe()) promotionId: string,
  ) {
    return this.superAdminService.deactivatePromotion(user, promotionId);
  }

  @Post('customers/:customerAccountId/stripe-customer')
  createStripeCustomer(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.createStripeCustomer(customerAccountId);
  }

  /**
   * Ask Stripe what happened to this customer's payment, and advance the order
   * if Stripe says it was paid.
   *
   * A POST because it may change state — but only ever through the same
   * `confirmPayment` path a webhook uses, so nothing here can mark an order
   * paid that Stripe does not agree was paid. The response carries a diagnosis
   * the operator can relay to the customer; see `payment-diagnosis.ts`.
   */
  /**
   * Read-only: what the payment on this customer is doing.
   *
   * Resolves to `customers.read` through the same path rule the record page
   * already needed to render, so the screen that shows a customer can always
   * ask this about them.
   */
  @Get('customers/:customerAccountId/payment-state')
  getCustomerPaymentState(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.paymentRecheck.getCustomerPaymentState(customerAccountId);
  }

  @Post('customers/:customerAccountId/recheck-payment')
  recheckCustomerPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.paymentRecheck.recheckCustomerPayment(user, customerAccountId);
  }

  @Post('subscriptions/:subscriptionId/stripe-subscription')
  createStripeSubscription(
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
  ) {
    return this.superAdminService.createStripeSubscription(subscriptionId);
  }

  @Post('billing/stripe/webhook')
  handleStripeWebhook() {
    return this.superAdminService.handleStripeWebhook();
  }

  @Get('billing/diagnostics')
  getBillingDiagnostics() {
    return this.superAdminService.getBillingDiagnostics();
  }

  @Post('billing/test-stripe-connection')
  testStripeConnection() {
    return this.superAdminService.testStripeConnection();
  }

  @Get('billing/stripe-webhook-events')
  listStripeWebhookEvents(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.superAdminService.listStripeWebhookEvents({
      page,
      pageSize,
      status,
      type,
    });
  }

  @Post('billing/stripe-webhook-events/:id/retry')
  retryStripeWebhookEvent(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.superAdminService.retryStripeWebhookEvent(id);
  }

  @Get('platform-settings')
  getPlatformSettings() {
    return this.superAdminService.getPlatformSettings();
  }

  @Patch('platform-settings')
  updatePlatformSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlatformSettingsDto,
  ) {
    return this.superAdminService.updatePlatformSettings(user, dto);
  }

  /*
   * Exchange rates live under `platform-settings/` deliberately.
   *
   * `resolvePlatformPermission` maps by route path: anything containing
   * `platform-settings` is `settings.read` on a GET and `settings.manage`
   * otherwise. Mounting here means these four routes are governed by the rule
   * that already governs every other platform setting, rather than by a new
   * permission key that someone would have to remember to grant.
   */
  @Get('platform-settings/exchange-rates')
  async getExchangeRates() {
    const base = await this.fx.resolveReportingCurrency();
    const rates = await this.fx.listRates(base);
    return { base, rates, ratesAsOf: newestFetch(rates) };
  }

  @Post('platform-settings/exchange-rates/refresh')
  async refreshExchangeRates(@CurrentUser() user: AuthenticatedUser) {
    const base = await this.fx.resolveReportingCurrency();
    const rates = await this.fx.refreshFromProvider(base, user);
    return { base, rates, ratesAsOf: newestFetch(rates) };
  }

  @Put('platform-settings/exchange-rates/:quoteCurrency')
  async setExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteCurrency') quoteCurrency: string,
    @Body() dto: SetExchangeRateDto,
  ) {
    const base = await this.fx.resolveReportingCurrency();
    return this.fx.setManualRate(
      base,
      quoteCurrency.toUpperCase(),
      dto.rate,
      dto.reason,
      user,
    );
  }

  @Delete('platform-settings/exchange-rates/:quoteCurrency')
  async clearExchangeRateOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteCurrency') quoteCurrency: string,
  ) {
    const base = await this.fx.resolveReportingCurrency();
    return this.fx.clearManualOverride(base, quoteCurrency.toUpperCase(), user);
  }

  @Get('platform-email')
  getPlatformEmailSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.platformEmailSettings.getSettings(user);
  }

  @Patch('platform-email')
  updatePlatformEmailSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlatformEmailSettingsDto,
  ) {
    return this.platformEmailSettings.updateSettings(user, dto);
  }

  @Post('platform-email/test-connection')
  testPlatformEmailConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.platformEmailSettings.testConnection(user);
  }

  @Post('platform-email/test-email')
  async sendPlatformTestEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendPlatformTestEmailDto,
  ) {
    this.platformEmailSettings.assertCanSendTest(user);
    const subject =
      dto.subject?.trim() || 'DijiPeople email configuration test';
    const message =
      dto.message?.trim() ||
      'This message confirms that Platform Admin outbound email is configured correctly.';
    const delivery = await this.platformCommunications.sendEmail({
      eventCode: 'PLATFORM_EMAIL_TEST',
      recipient: dto.recipient,
      subject,
      html: emailPage(subject, message),
      text: message,
      requestedById: user.userId,
      metadata: { test: true, correlationId: `test_${Date.now()}` },
      idempotencyKey: `platform-email-test:${user.userId}:${Date.now()}`,
    });
    return {
      success: delivery.status === 'SENT',
      deliveryId: delivery.id,
      status: delivery.status,
      providerType: delivery.providerType,
      sentAt: delivery.sentAt,
      message:
        delivery.status === 'SENT'
          ? 'Test email accepted by the configured provider.'
          : delivery.errorMessage || 'The test email was not delivered.',
    };
  }

  @Get('platform-email/deliveries')
  listPlatformEmailDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.platformEmailSettings.listRecentDeliveries(
      user,
      Number(limit ?? 25),
    );
  }

  @Get('platform-email/templates')
  listPlatformEmailTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.platformEmailSettings.listTemplates(user);
  }

  @Patch('platform-email/templates/:templateId')
  updatePlatformEmailTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
    @Body() dto: UpdatePlatformEmailTemplateDto,
  ) {
    return this.platformEmailSettings.updateTemplate(user, templateId, dto);
  }
}

/** The most recent time any of these rates was fetched, for the "as of" line. */
function newestFetch(rates: PlatformRateView[]): string | null {
  const stamps = rates
    .map((rate) => rate.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}
