import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  MISC_PERMISSION_KEYS,
  ENTITY_KEYS,
} from '../../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { CreateCheckoutSessionDto } from '../dto/create-checkout-session.dto';
import { BillingService } from '../services/billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getPlans() {
    return this.billingService.getPublicPlans();
  }

  @Get('health')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getBillingHealth(user.tenantId);
  }

  @Get('subscription')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getCurrentSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getCurrentSubscription(user.tenantId);
  }

  @Get('invoices')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getInvoices(user.tenantId);
  }

  @Get('invoices/:invoiceId')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getInvoiceDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.billingService.getInvoiceDetail(user.tenantId, invoiceId);
  }

  @Post('checkout-sessions')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_MANAGE)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')
  createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession({
      tenantId: user.tenantId,
      userId: user.userId,
      planPriceId: dto.planPriceId,
      seatQuantity: dto.seatQuantity,
      promotionCode: dto.promotionCode,
    });
  }

  @Post('portal-sessions')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_MANAGE)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')
  createPortalSession(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createPortalSession({
      tenantId: user.tenantId,
    });
  }

  @Post('subscription/reconcile')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_MANAGE)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')
  reconcileSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.reconcileSubscriptionSeats(user.tenantId);
  }
}
