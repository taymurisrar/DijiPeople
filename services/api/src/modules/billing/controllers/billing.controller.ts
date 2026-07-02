import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireRoles } from '../../../common/decorators/require-roles.decorator';
import { ROLE_KEYS } from '../../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { CreateCheckoutSessionDto } from '../dto/create-checkout-session.dto';
import { BillingService } from '../services/billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getPublicPlans();
  }

  @Get('health')
  getHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getBillingHealth(user.tenantId);
  }

  @Get('subscription')
  getCurrentSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getCurrentSubscription(user.tenantId);
  }

  @Get('invoices')
  getInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getInvoices(user.tenantId);
  }

  @Get('invoices/:invoiceId')
  getInvoiceDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.billingService.getInvoiceDetail(user.tenantId, invoiceId);
  }

  @Post('checkout-sessions')
  createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession({
      tenantId: user.tenantId,
      userId: user.userId,
      planPriceId: dto.planPriceId,
      promotionCode: dto.promotionCode,
    });
  }

  @Post('portal-sessions')
  createPortalSession(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createPortalSession({
      tenantId: user.tenantId,
    });
  }
}
