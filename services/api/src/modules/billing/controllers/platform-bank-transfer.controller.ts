import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  PlatformPermissionsGuard,
  RequirePlatformPermission,
} from '../../platform-auth/platform-permissions';
import {
  ApproveBankTransferDto,
  BankTransferClaimQueryDto,
  BankTransferDecisionDto,
  CreatePaymentMethodDto,
  CreateReceivingAccountDto,
  ReceivingAccountDecisionDto,
  SetPaymentMethodApprovalDto,
  SetPaymentMethodEnabledDto,
} from '../dto/bank-transfer.dto';
import { BankTransferService } from '../services/bank-transfer.service';
import { PaymentMethodRegistryService } from '../services/payment-method-registry.service';

const actorOf = (user: AuthenticatedUser) => ({
  platformUserId: user.platform?.id ?? null,
});

/**
 * Platform Admin payment operations.
 *
 * Reading the queue and configuration uses the ordinary payments/billing read
 * permissions. Deciding a transfer needs `payments.verify`, granted by name to
 * finance roles. **Changing where money is sent** — approving or activating a
 * receiving account, approving or enabling a method — is bound to
 * `platform.billing.administer` (ADR-0018), which no domain wildcard satisfies.
 */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@Controller('super-admin')
export class PlatformBankTransferController {
  constructor(
    private readonly bankTransfer: BankTransferService,
    private readonly registry: PaymentMethodRegistryService,
  ) {}

  // ---- verification queue -------------------------------------------------------

  @Get('payments/bank-transfers/summary')
  @RequirePlatformPermission('payments.read')
  summary() {
    return this.bankTransfer.summary();
  }

  @Get('payments/bank-transfers')
  @RequirePlatformPermission('payments.read')
  list(@Query() query: BankTransferClaimQueryDto) {
    return this.bankTransfer.listClaims(query);
  }

  /** Open renewal invoices of bank-transfer subscriptions awaiting a payment. */
  @Get('payments/bank-transfers/renewal-invoices')
  @RequirePlatformPermission('payments.read')
  renewalInvoices(@Query('search') search?: string) {
    return this.bankTransfer.listOpenRenewalInvoices(search);
  }

  /**
   * Record a transfer found in the receiving account against a renewal
   * invoice. Same discipline as an order approval: exact amount, a unique bank
   * statement reference, one idempotent credit.
   */
  @Post('payments/bank-transfers/invoices/:invoiceId/record')
  @RequirePlatformPermission('payments.verify')
  recordInvoicePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: ApproveBankTransferDto,
  ) {
    return this.bankTransfer.recordInvoicePayment(
      invoiceId,
      dto,
      actorOf(user),
    );
  }

  @Get('payments/bank-transfers/:claimId')
  @RequirePlatformPermission('payments.read')
  detail(@Param('claimId', new ParseUUIDPipe()) claimId: string) {
    return this.bankTransfer.getClaim(claimId);
  }

  /** Forced download, never inline: the bytes are customer-supplied and unscanned. */
  @Get('payments/bank-transfers/:claimId/evidence/:evidenceId')
  @RequirePlatformPermission('payments.read')
  async evidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { opened, evidence } = await this.bankTransfer.openEvidence(
      claimId,
      evidenceId,
      actorOf(user),
    );
    res.set({
      'Content-Type': evidence.mimeType,
      'Content-Disposition': `attachment; filename="evidence-${evidence.id}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(opened.stream);
  }

  @Post('payments/bank-transfers/:claimId/approve')
  @RequirePlatformPermission('payments.verify')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() dto: ApproveBankTransferDto,
  ) {
    return this.bankTransfer.approveClaim(claimId, dto, actorOf(user));
  }

  @Post('payments/bank-transfers/:claimId/reject')
  @RequirePlatformPermission('payments.verify')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() dto: BankTransferDecisionDto,
  ) {
    return this.bankTransfer.rejectClaim(claimId, dto.reason, actorOf(user));
  }

  @Post('payments/bank-transfers/:claimId/request-clarification')
  @RequirePlatformPermission('payments.verify')
  clarify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() dto: BankTransferDecisionDto,
  ) {
    return this.bankTransfer.requestClarification(
      claimId,
      dto.reason,
      actorOf(user),
    );
  }

  @Post('payments/bank-transfers/:claimId/mark-duplicate')
  @RequirePlatformPermission('payments.verify')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() dto: BankTransferDecisionDto,
  ) {
    return this.bankTransfer.markDuplicate(claimId, dto.reason, actorOf(user));
  }

  // ---- payment method configuration ---------------------------------------------

  @Get('billing/payment-methods')
  @RequirePlatformPermission('billing.read')
  async methods() {
    const [items, markets] = await Promise.all([
      this.registry.listConfigurations(),
      this.registry.listMarkets(),
    ]);
    return { items, markets };
  }

  @Post('billing/payment-methods')
  @RequirePlatformPermission('billing.manage')
  createMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentMethodDto,
  ) {
    return this.registry.createConfiguration(dto, actorOf(user));
  }

  @Patch('billing/payment-methods/:id/approval')
  @RequirePlatformPermission('platform.billing.administer')
  setApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPaymentMethodApprovalDto,
  ) {
    return this.registry.setApproval(id, dto.status, actorOf(user));
  }

  @Patch('billing/payment-methods/:id/enabled')
  @RequirePlatformPermission('platform.billing.administer')
  setEnabled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPaymentMethodEnabledDto,
  ) {
    return this.registry.setEnabled(id, dto.enabled, actorOf(user));
  }

  @Get('billing/payment-methods/:id/accounts')
  @RequirePlatformPermission('billing.read')
  accounts(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.registry.listAccounts(id);
  }

  @Post('billing/payment-methods/:id/accounts')
  @RequirePlatformPermission('billing.manage')
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateReceivingAccountDto,
  ) {
    return this.registry.createAccount(id, dto, actorOf(user));
  }

  @Post('billing/receiving-accounts/:accountId/approve')
  @RequirePlatformPermission('platform.billing.administer')
  approveAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ) {
    return this.registry.decideAccount(
      accountId,
      'APPROVE',
      undefined,
      actorOf(user),
    );
  }

  @Post('billing/receiving-accounts/:accountId/reject')
  @RequirePlatformPermission('platform.billing.administer')
  rejectAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: ReceivingAccountDecisionDto,
  ) {
    return this.registry.decideAccount(
      accountId,
      'REJECT',
      dto.reason,
      actorOf(user),
    );
  }

  @Post('billing/receiving-accounts/:accountId/suspend')
  @RequirePlatformPermission('platform.billing.administer')
  suspendAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: ReceivingAccountDecisionDto,
  ) {
    return this.registry.decideAccount(
      accountId,
      'SUSPEND',
      dto.reason,
      actorOf(user),
    );
  }

  @Post('billing/receiving-accounts/:accountId/activate')
  @RequirePlatformPermission('platform.billing.administer')
  activateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ) {
    return this.registry.activateAccount(accountId, actorOf(user));
  }
}
