import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { SeatQuoteQueryDto } from '../dto/seat-quote-query.dto';
import { PlanChangePreviewQueryDto } from '../dto/plan-change-preview-query.dto';
import { RequestPlanChangeDto } from '../dto/request-plan-change.dto';
import { BillingService } from '../services/billing.service';
import { PlanChangeService } from '../services/plan-change.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly planChangeService: PlanChangeService,
  ) {}

  @Get('plans')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getPlans(@CurrentUser() user: AuthenticatedUser) {
    // BUG-3334/BUG-3333 — scoped to the tenant's own market, unlike the
    // anonymous `/public/plans`, which has no tenant to scope to.
    return this.billingService.getPublicPlans({ tenantId: user.tenantId });
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

  /**
   * BUG-3330 — seats, unit price, billable seats and total for a price and a
   * seat count, so the plans screen never reimplements
   * `calculateSeatPricing`'s arithmetic in the browser.
   *
   * Route: `GET /billing/plan-prices/:planPriceId/seat-quote?seats=<n>`
   * Response: `{ planPriceId, planId, billingModel, billingInterval,
   * currency, seats, minimumSeats, maximumSeats, includedSeats,
   * billableSeats, unitPrice, total }`
   */
  @Get('plan-prices/:planPriceId/seat-quote')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getSeatQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planPriceId', new ParseUUIDPipe({ version: '4' }))
    planPriceId: string,
    @Query() query: SeatQuoteQueryDto,
  ) {
    return this.billingService.getSeatQuote(
      user.tenantId,
      planPriceId,
      query.seats,
    );
  }

  /**
   * EXECPLAN-0037 / BUG-3331 — the money quote for a plan change, before the
   * tenant confirms it.
   */
  @Get('plan-changes/preview')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  previewPlanChange(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PlanChangePreviewQueryDto,
  ) {
    return this.planChangeService.preview(
      user.tenantId,
      query.toPlanId,
      query.toPlanPriceId,
    );
  }

  /**
   * EXECPLAN-0037 / BUG-3331 — the plan-change path that does not 409. An
   * UPGRADE (including a same-plan cycle change that costs more) applies
   * immediately; a DOWNGRADE is scheduled for renewal by
   * `PlanChangeService`, same as it always has been.
   */
  @Post('plan-changes')
  @Permissions(MISC_PERMISSION_KEYS.BILLING_MANAGE)
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')
  requestPlanChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPlanChangeDto,
  ) {
    return this.planChangeService.requestChange({
      tenantId: user.tenantId,
      toPlanId: dto.toPlanId,
      toPlanPriceId: dto.toPlanPriceId,
      requestedByUserId: user.userId,
      reason: dto.reason,
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
