import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RuntimeDbPageArgs } from '../platform-runtime/runtime-db-query';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from './billing.service';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  private static readonly LIST_INCLUDE = {
    tenant: {
      select: {
        id: true,
        name: true,
        slug: true,
        customerAccount: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
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
  } satisfies Prisma.PaymentInclude;

  listPayments() {
    return this.prisma.payment.findMany({
      include: PaymentsService.LIST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /** One database-filtered page of payments plus the filtered total (BUG-3175). */
  async listPaymentsPage(args: RuntimeDbPageArgs) {
    const where = args.where as Prisma.PaymentWhereInput;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: PaymentsService.LIST_INCLUDE,
        orderBy: args.orderBy as Prisma.PaymentOrderByWithRelationInput[],
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total };
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
