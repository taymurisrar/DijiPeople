import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES_PER_CLAIM,
} from '../bank-transfer/bank-transfer.rules';
import { SubmitBankTransferClaimDto } from '../dto/bank-transfer.dto';
import { BankTransferService } from '../services/bank-transfer.service';
import { BillingService } from '../services/billing.service';

/**
 * The buyer's side of a bank transfer.
 *
 * Every route is bound to an onboarding order id — a v4 uuid, the same
 * capability the wizard already holds. Nothing here accepts a tenant id, an
 * amount to charge, a price, or a status: the server owns all of them. Bank
 * details come back only for an order that has an issued invoice.
 */
@UseGuards(PublicRateLimitGuard)
@Controller('public')
export class PublicBankTransferController {
  constructor(
    private readonly bankTransfer: BankTransferService,
    private readonly billing: BillingService,
  ) {}

  /** Which payment methods this price can be bought with, decided server-side. */
  @Public()
  @Get('payment-methods')
  @Header('Cache-Control', 'no-store')
  paymentMethods(
    @Query('planPriceId', new ParseUUIDPipe({ version: '4' }))
    planPriceId: string,
  ) {
    return this.billing.getPublicPaymentOptions(planPriceId);
  }

  /** Issue (or return) the bank invoice for a verified order. Idempotent. */
  @Public()
  @Post('onboarding/:onboardingId/bank-transfer')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  issueInvoice(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
  ) {
    return this.bankTransfer.issueInvoice(onboardingId);
  }

  /** The invoice, instructions and verification state — refreshable. */
  @Public()
  @Get('onboarding/:onboardingId/bank-transfer')
  @Header('Cache-Control', 'no-store')
  view(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
  ) {
    return this.bankTransfer.view(onboardingId);
  }

  /**
   * "I have paid." An untrusted claim with optional evidence — it can never
   * activate a subscription, only queue the order for an operator.
   */
  @Public()
  @Post('onboarding/:onboardingId/bank-transfer/claims')
  @HttpCode(201)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'evidence', maxCount: EVIDENCE_MAX_FILES_PER_CLAIM }],
      {
        // Enforced at the stream boundary, before a byte is held in the heap.
        limits: {
          fileSize: EVIDENCE_MAX_BYTES,
          files: EVIDENCE_MAX_FILES_PER_CLAIM,
          fields: 8,
        },
      },
    ),
  )
  submitClaim(
    @Param('onboardingId', new ParseUUIDPipe({ version: '4' }))
    onboardingId: string,
    @Body() dto: SubmitBankTransferClaimDto,
    @UploadedFiles()
    files?: { evidence?: Array<{ buffer: Buffer; originalname: string }> },
  ) {
    return this.bankTransfer.submitClaim(
      onboardingId,
      dto,
      (files?.evidence ?? []).map((file) => ({
        buffer: file.buffer,
        originalName: file.originalname,
      })),
    );
  }
}
