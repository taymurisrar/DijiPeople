import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from './billing.service';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  listPayments() {
    return this.prisma.payment.findMany({
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        subscription: {
          include: {
            plan: {
              select: { id: true, key: true, name: true },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  recordManualPayment(actorUserId: string, dto: RecordPaymentDto) {
    return this.billingService.recordPayment({
      tenantId: dto.tenantId,
      subscriptionId: dto.subscriptionId,
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: dto.paymentMethod,
      status: dto.status,
      stripePaymentIntentId: dto.stripePaymentIntentId,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      actorUserId,
    });
  }
}
