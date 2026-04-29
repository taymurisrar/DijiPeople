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
import { CreatePlanDto } from './dto/create-plan.dto';
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
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { UpdatePrimaryOwnerDto } from './dto/update-primary-owner.dto';
import { UpdateTenantCustomerAccountDto } from './dto/update-tenant-customer-account.dto';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { SuperAdminService } from './super-admin.service';
import { ConvertLeadToCustomerDto } from '../leads/dto/admin-lead.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('dashboard-summary')
  getDashboardSummary() {
    return this.superAdminService.getDashboardSummary();
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
  listCustomers(@Query() query: CustomerQueryDto) {
    return this.superAdminService.listCustomers(query);
  }

  @Get('customers/:customerAccountId')
  getCustomerDetail(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.getCustomerDetail(customerAccountId);
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
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.superAdminService.updateCustomer(customerAccountId, dto);
  }

  @Delete('customers')
  bulkDeleteCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteCustomersDto,
  ) {
    return this.superAdminService.bulkDeleteCustomers(user, dto);
  }

  @Post('customers/:customerAccountId/start-onboarding')
  startCustomerOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
    @Body() dto?: Partial<CreateCustomerOnboardingRecordDto>,
  ) {
    return this.superAdminService.startCustomerOnboarding(
      user,
      customerAccountId,
      dto,
    );
  }

  @Get('customer-onboarding')
  listCustomerOnboardings(@Query() query: CustomerOnboardingQueryDto) {
    return this.superAdminService.listCustomerOnboardings(query);
  }

  @Get('customer-onboarding/:onboardingId')
  getCustomerOnboarding(
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.superAdminService.getCustomerOnboarding(onboardingId);
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

  @Get('tenants/:tenantId')
  getTenantDetail(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.superAdminService.getTenantDetail(tenantId);
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
  updateTenantStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.superAdminService.updateTenantStatus(user, tenantId, dto);
  }

  @Patch('tenants/:tenantId/subscription')
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

  @Patch('invoices/:invoiceId/status')
  updateInvoiceStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.superAdminService.updateInvoiceStatus(user, invoiceId, dto);
  }

  @Post('subscriptions/:subscriptionId/invoices')
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
  listPlans() {
    return this.superAdminService.listPlans();
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

  @Post('customers/:customerAccountId/stripe-customer')
  createStripeCustomer(
    @Param('customerAccountId', new ParseUUIDPipe()) customerAccountId: string,
  ) {
    return this.superAdminService.createStripeCustomer(customerAccountId);
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
}
