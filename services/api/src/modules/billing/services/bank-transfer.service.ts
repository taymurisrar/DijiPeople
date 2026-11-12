import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BankTransferClaimStatus,
  PaymentEvidenceScanStatus,
  Prisma,
  SubscriptionOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { StorageService } from '../../../common/storage/storage.service';
import { AuditService } from '../../audit/audit.service';
import { PlatformCommunicationsService } from '../../platform-communications/platform-communications.service';
import {
  BANK_INVOICE_TTL_DAYS,
  DECIDABLE_CLAIM_STATUSES,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES_PER_CLAIM,
  OPEN_CLAIM_STATUSES,
  checkReceivedAmount,
  generateBankReference,
  normalizeBankReference,
  sanitizeEvidenceFileName,
  sniffEvidenceKind,
} from '../bank-transfer/bank-transfer.rules';
import { OrderActivationService } from './order-activation.service';
import {
  PaymentMethodRegistryService,
  isUniqueViolation,
} from './payment-method-registry.service';

type Actor = { platformUserId: string | null };

const PAYABLE_ORDER_STATUSES: SubscriptionOrderStatus[] = [
  SubscriptionOrderStatus.DRAFT,
  SubscriptionOrderStatus.PENDING_PAYMENT,
];

export type EvidenceUpload = {
  buffer: Buffer;
  originalName: string;
};

/**
 * Bank-transfer settlement: issue the invoice, take the buyer's *claim*, and let
 * an authorised operator verify the money independently before anything is
 * activated.
 *
 * The invariant this class exists to hold: **a customer assertion never moves an
 * order.** A claim is data. Only {@link approveClaim} — reached through a
 * platform permission, with the operator's own bank-statement reference and a
 * received amount that matches the frozen order total to the minor unit — can
 * hand the order to `OrderActivationService`, and it does so through the same
 * idempotent `confirmPayment` Stripe and Safepay use, so provisioning, outbox
 * and onboarding follow unchanged.
 */
@Injectable()
export class BankTransferService {
  private readonly logger = new Logger(BankTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentMethodRegistryService,
    private readonly secrets: SecretEncryptionService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly orderActivation: OrderActivationService,
    private readonly communications: PlatformCommunicationsService,
  ) {}

  // ---- customer side ----------------------------------------------------------

  /**
   * Turn a verified, priced order into a bank invoice: a unique reference, the
   * frozen receiving account and a due date. Idempotent — a refresh or a second
   * click returns the same invoice rather than minting another reference.
   */
  async issueInvoice(orderId: string, now = new Date()) {
    const order = await this.loadOrder(orderId);

    if (!order.ownerEmailVerifiedAt) {
      throw new ConflictException({
        code: 'OWNER_EMAIL_NOT_VERIFIED',
        message:
          'Verify the administrator email before choosing a payment method.',
      });
    }
    if (order.bankReference) {
      return this.view(orderId);
    }
    if (!PAYABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This order can no longer be paid.',
      });
    }
    // One payment channel per order: a card checkout that can still be paid and
    // a bank invoice that can still be paid would be two ways to charge once.
    if (order.providerPaymentId || order.stripeCheckoutSessionId) {
      throw new ConflictException({
        code: 'PAYMENT_PROVIDER_LOCKED',
        message:
          'A card checkout is already open for this order. Complete it there, or contact support to change the payment method.',
      });
    }

    const ready = await this.registry.findReadyBankTransfer({
      marketId: order.marketId,
      currency: order.currency,
    });
    if (!ready) {
      throw new ConflictException({
        code: 'BANK_TRANSFER_UNAVAILABLE',
        message: 'Bank transfer is not available for this order.',
      });
    }

    const dueAt = new Date(now.getTime() + BANK_INVOICE_TTL_DAYS * 86_400_000);
    // The reference is random, so a collision is astronomically unlikely; the
    // unique index is still what decides, and we simply try again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const claimed = await this.prisma.subscriptionOrder.updateMany({
          where: {
            id: orderId,
            bankReference: null,
            status: { in: PAYABLE_ORDER_STATUSES },
            providerPaymentId: null,
            stripeCheckoutSessionId: null,
          },
          data: {
            bankReference: generateBankReference(),
            paymentMethodConfigId: ready.config.id,
            receivingAccountId: ready.account.id,
            bankInvoiceIssuedAt: now,
            status: SubscriptionOrderStatus.PENDING_PAYMENT,
            expiresAt: dueAt,
          },
        });
        if (claimed.count === 0) {
          // Lost a race with ourselves: somebody else issued it first.
          return this.view(orderId);
        }
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }

    await this.audit.log({
      tenantId: 'platform',
      action: 'BANK_INVOICE_ISSUED',
      entityType: 'SubscriptionOrder',
      entityId: orderId,
      sourceModule: 'billing',
      afterSnapshot: {
        orderNumber: order.orderNumber,
        amount: order.totalAmount.toString(),
        currency: order.currency,
        receivingAccountId: ready.account.id,
      },
    });

    const issued = await this.view(orderId);
    await this.mail(order.customer, {
      eventCode: 'BANK_TRANSFER_INVOICE_ISSUED',
      entityId: orderId,
      subject: `Your DijiPeople invoice ${order.orderNumber}`,
      lines: [
        `Please transfer ${issued.amount} ${issued.currency} and quote the reference ${issued.reference}.`,
        `The invoice is payable until ${issued.dueAt?.toISOString().slice(0, 10)}.`,
        'Your subscription is activated only after we have verified the funds in our bank account — a transfer receipt or screenshot alone does not activate it.',
      ],
      key: `bank-invoice:${orderId}`,
    });
    return issued;
  }

  /**
   * What the buyer's status page shows. Bank details are decrypted here and only
   * here, and only for an order that already carries an issued invoice — the
   * order id is the capability, as for the onboarding status endpoint.
   */
  async view(orderId: string) {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        bankReference: true,
        expiresAt: true,
        bankInvoiceIssuedAt: true,
        receivingAccount: true,
        bankTransferClaims: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            clarificationRequest: true,
            decisionReason: true,
          },
        },
      },
    });
    if (!order || !order.bankReference || !order.receivingAccount) {
      throw new NotFoundException({
        code: 'BANK_INVOICE_NOT_FOUND',
        message: 'No bank-transfer invoice exists for this order.',
      });
    }
    const claim = order.bankTransferClaims[0] ?? null;
    const expired =
      order.status === SubscriptionOrderStatus.ABANDONED ||
      (order.status === SubscriptionOrderStatus.PENDING_PAYMENT &&
        !!order.expiresAt &&
        order.expiresAt.getTime() < Date.now() &&
        !(claim && OPEN_CLAIM_STATUSES.includes(claim.status)));
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: `INV-${order.orderNumber}`,
      reference: order.bankReference,
      amount: order.totalAmount.toFixed(2),
      subtotal: order.subtotalAmount.toFixed(2),
      discount: order.discountAmount.toFixed(2),
      tax: order.taxAmount.toFixed(2),
      currency: order.currency,
      issuedAt: order.bankInvoiceIssuedAt,
      dueAt: order.expiresAt,
      state: this.customerState(order.status, claim?.status ?? null, expired),
      claim,
      instructions: this.registry.instructionsFor(order.receivingAccount),
    };
  }

  /**
   * The buyer withdraws an invoice they have not yet claimed to have paid, so
   * they can start again with another method. Refused once any claim exists:
   * from then on funds may be in flight and only an operator can decide.
   */
  async cancelInvoice(orderId: string) {
    const order = await this.loadOrder(orderId);
    if (!order.bankReference) {
      throw new NotFoundException({
        code: 'BANK_INVOICE_NOT_FOUND',
        message: 'No bank-transfer invoice exists for this order.',
      });
    }
    const claims = await this.prisma.bankTransferClaim.count({
      where: { subscriptionOrderId: orderId },
    });
    if (claims > 0) {
      throw new ConflictException({
        code: 'CLAIM_EXISTS',
        message:
          'A payment has been reported for this invoice and can only be resolved by our team. Contact support.',
      });
    }
    const moved = await this.prisma.subscriptionOrder.updateMany({
      where: {
        id: orderId,
        status: SubscriptionOrderStatus.PENDING_PAYMENT,
        bankTransferClaims: { none: {} },
      },
      data: {
        status: SubscriptionOrderStatus.CANCELLED,
        // Released like an abandoned order: the buyer may start over.
        submissionHash: null,
        requestedSlug: null,
      },
    });
    if (moved.count === 0) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This invoice can no longer be cancelled.',
      });
    }
    await this.audit.log({
      tenantId: 'platform',
      action: 'BANK_INVOICE_CANCELLED',
      entityType: 'SubscriptionOrder',
      entityId: orderId,
      sourceModule: 'billing',
      afterSnapshot: { reference: order.bankReference },
    });
    return { cancelled: true };
  }

  /** The buyer submits what they say they did. Never activates anything. */
  async submitClaim(
    orderId: string,
    input: {
      transactionReference?: string;
      transferredAt?: Date;
      amount?: string;
      note?: string;
    },
    evidence: EvidenceUpload[] = [],
  ) {
    const order = await this.loadOrder(orderId);
    if (
      !order.bankReference ||
      !order.receivingAccountId ||
      !order.paymentMethodConfigId
    ) {
      throw new ConflictException({
        code: 'BANK_INVOICE_NOT_ISSUED',
        message: 'Choose bank transfer to receive an invoice first.',
      });
    }
    if (order.status !== SubscriptionOrderStatus.PENDING_PAYMENT) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This invoice is no longer payable.',
      });
    }
    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      throw new ConflictException({
        code: 'INVOICE_EXPIRED',
        message: 'This invoice has expired. Start a new order to pay.',
      });
    }
    if (evidence.length > EVIDENCE_MAX_FILES_PER_CLAIM) {
      throw new BadRequestException({
        code: 'TOO_MANY_EVIDENCE_FILES',
        message: `Attach at most ${EVIDENCE_MAX_FILES_PER_CLAIM} files.`,
      });
    }
    const validated = evidence.map((file) => this.validateEvidence(file));

    const reference = input.transactionReference
      ? normalizeBankReference(input.transactionReference)
      : null;
    const now = new Date();
    if (
      input.transferredAt &&
      input.transferredAt.getTime() > now.getTime() + 86_400_000
    ) {
      throw new BadRequestException({
        code: 'TRANSFER_DATE_IN_FUTURE',
        message: 'The transfer date cannot be in the future.',
      });
    }

    // One open claim per order. The conditional create is the database's answer
    // to a double click; the pre-check only gives a friendlier message.
    const claim = await this.prisma.$transaction(async (tx) => {
      const open = await tx.bankTransferClaim.findFirst({
        where: {
          subscriptionOrderId: orderId,
          status: { in: [...OPEN_CLAIM_STATUSES] },
        },
        select: { id: true, status: true },
      });
      if (open?.status === BankTransferClaimStatus.PENDING_VERIFICATION) {
        throw new ConflictException({
          code: 'CLAIM_ALREADY_PENDING',
          message: 'Your payment is already awaiting verification.',
        });
      }
      if (open) {
        // A clarification was requested: the new submission answers it.
        await tx.bankTransferClaim.update({
          where: { id: open.id },
          data: { status: BankTransferClaimStatus.CANCELLED },
        });
      }
      return tx.bankTransferClaim.create({
        data: {
          subscriptionOrderId: orderId,
          paymentMethodConfigId: order.paymentMethodConfigId!,
          receivingAccountId: order.receivingAccountId!,
          claimedAmount: input.amount ?? order.totalAmount,
          currency: order.currency,
          transferredAt: input.transferredAt ?? null,
          customerReferenceEncrypted: reference
            ? this.encrypt(reference)
            : null,
          customerReferenceHash: reference ? this.hash(reference) : null,
          customerNote: input.note?.trim() || null,
        },
      });
    });

    for (const file of validated) {
      const stored = await this.storage.saveFile({
        buffer: file.buffer,
        originalFileName: file.name,
        contentType: file.kind,
        scope: { kind: 'platform' },
        domain: 'payment-evidence',
        segments: [claim.id],
      });
      await this.prisma.bankTransferEvidence.create({
        data: {
          claimId: claim.id,
          storageKey: stored.storageKey,
          originalFileName: file.name,
          mimeType: file.kind,
          sizeBytes: stored.size,
          checksumSha256: stored.checksumSha256,
          // No malware scanner exists in this deployment. CLEAN is therefore
          // never set here; the file stays QUARANTINED and is only ever served
          // to an operator as a forced download (see EVIDENCE notes in docs).
          scanStatus: PaymentEvidenceScanStatus.QUARANTINED,
        },
      });
    }

    await this.audit.log({
      tenantId: 'platform',
      action: 'BANK_TRANSFER_CLAIM_SUBMITTED',
      entityType: 'BankTransferClaim',
      entityId: claim.id,
      sourceModule: 'billing',
      afterSnapshot: {
        orderId,
        claimedAmount: claim.claimedAmount.toString(),
        evidenceFiles: validated.length,
      },
    });
    return { claimId: claim.id, status: claim.status };
  }

  // ---- operator side ----------------------------------------------------------

  async listClaims(query: {
    status?: BankTransferClaimStatus;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const search = query.search?.trim();
    const where: Prisma.BankTransferClaimWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              {
                subscriptionOrder: {
                  OR: [
                    { orderNumber: { contains: search, mode: 'insensitive' } },
                    { bankReference: { contains: search.toUpperCase() } },
                    {
                      customer: {
                        companyName: { contains: search, mode: 'insensitive' },
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.bankTransferClaim.count({ where }),
      this.prisma.bankTransferClaim.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          subscriptionOrder: {
            select: {
              id: true,
              orderNumber: true,
              bankReference: true,
              totalAmount: true,
              currency: true,
              status: true,
              expiresAt: true,
              customer: { select: { companyName: true } },
            },
          },
          _count: { select: { evidence: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        submittedAt: row.submittedAt,
        claimedAmount: row.claimedAmount.toFixed(2),
        currency: row.currency,
        orderId: row.subscriptionOrder.id,
        orderNumber: row.subscriptionOrder.orderNumber,
        reference: row.subscriptionOrder.bankReference,
        expectedAmount: row.subscriptionOrder.totalAmount.toFixed(2),
        orderStatus: row.subscriptionOrder.status,
        orderExpiresAt: row.subscriptionOrder.expiresAt,
        company: row.subscriptionOrder.customer?.companyName ?? null,
        evidenceCount: row._count.evidence,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /** Dashboard counters: what needs an operator, how old it is, what was settled. */
  async summary(now = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [pending, clarification, oldest, approvedToday, rejectedToday] =
      await Promise.all([
        this.prisma.bankTransferClaim.count({
          where: { status: BankTransferClaimStatus.PENDING_VERIFICATION },
        }),
        this.prisma.bankTransferClaim.count({
          where: { status: BankTransferClaimStatus.CLARIFICATION_REQUESTED },
        }),
        this.prisma.bankTransferClaim.findFirst({
          where: { status: BankTransferClaimStatus.PENDING_VERIFICATION },
          orderBy: { submittedAt: 'asc' },
          select: { submittedAt: true },
        }),
        this.prisma.bankTransferClaim.findMany({
          where: {
            status: BankTransferClaimStatus.APPROVED,
            reviewedAt: { gte: startOfDay },
          },
          select: { verifiedAmount: true, currency: true },
        }),
        this.prisma.bankTransferClaim.count({
          where: {
            status: BankTransferClaimStatus.REJECTED,
            reviewedAt: { gte: startOfDay },
          },
        }),
      ]);
    const settledToday: Record<string, string> = {};
    for (const row of approvedToday) {
      const prev = new Prisma.Decimal(settledToday[row.currency] ?? 0);
      settledToday[row.currency] = prev
        .plus(row.verifiedAmount ?? 0)
        .toFixed(2);
    }
    return {
      awaitingVerification: pending,
      awaitingCustomer: clarification,
      oldestPendingAgeHours: oldest
        ? Math.floor((now.getTime() - oldest.submittedAt.getTime()) / 3_600_000)
        : 0,
      approvedToday: approvedToday.length,
      rejectedToday,
      settledToday,
    };
  }

  async getClaim(claimId: string) {
    const claim = await this.prisma.bankTransferClaim.findUnique({
      where: { id: claimId },
      include: {
        evidence: {
          select: {
            id: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            checksumSha256: true,
            scanStatus: true,
            uploadedAt: true,
          },
        },
        receivingAccount: {
          select: {
            bankName: true,
            maskedAccountTitle: true,
            maskedAccountNumber: true,
            maskedIban: true,
            maskedRaastId: true,
          },
        },
        subscriptionOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            bankReference: true,
            totalAmount: true,
            subtotalAmount: true,
            discountAmount: true,
            taxAmount: true,
            currency: true,
            requestedSeats: true,
            billingCycle: true,
            expiresAt: true,
            paidAt: true,
            tenantId: true,
            customer: { select: { companyName: true, contactEmail: true } },
            plan: { select: { name: true } },
          },
        },
      },
    });
    if (!claim) throw new NotFoundException('Claim not found.');

    // Duplicate detection: the same customer transaction reference on any other
    // live claim, or a different claim already approved for this order.
    const duplicates = claim.customerReferenceHash
      ? await this.prisma.bankTransferClaim.findMany({
          where: {
            customerReferenceHash: claim.customerReferenceHash,
            id: { not: claim.id },
            status: { not: BankTransferClaimStatus.CANCELLED },
          },
          select: { id: true, status: true, subscriptionOrderId: true },
        })
      : [];

    const history = await this.prisma.platformAuditLog.findMany({
      where: { entityType: 'BankTransferClaim', entityId: claim.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, createdAt: true, platformActorUserId: true },
    });

    return {
      id: claim.id,
      status: claim.status,
      claimedAmount: claim.claimedAmount.toFixed(2),
      currency: claim.currency,
      transferredAt: claim.transferredAt,
      // Decrypted for the operator holding the platform permission only.
      customerReference: claim.customerReferenceEncrypted
        ? this.secrets.decrypt(claim.customerReferenceEncrypted)
        : null,
      customerNote: claim.customerNote,
      clarificationRequest: claim.clarificationRequest,
      decisionReason: claim.decisionReason,
      verifiedAmount: claim.verifiedAmount?.toFixed(2) ?? null,
      submittedAt: claim.submittedAt,
      reviewedAt: claim.reviewedAt,
      reviewedById: claim.reviewedById,
      evidence: claim.evidence,
      receivingAccount: claim.receivingAccount,
      order: {
        ...claim.subscriptionOrder,
        totalAmount: claim.subscriptionOrder.totalAmount.toFixed(2),
        subtotalAmount: claim.subscriptionOrder.subtotalAmount.toFixed(2),
        discountAmount: claim.subscriptionOrder.discountAmount.toFixed(2),
        taxAmount: claim.subscriptionOrder.taxAmount.toFixed(2),
      },
      duplicates,
      history,
    };
  }

  async openEvidence(claimId: string, evidenceId: string, actor: Actor) {
    const evidence = await this.prisma.bankTransferEvidence.findFirst({
      where: { id: evidenceId, claimId },
    });
    if (!evidence) throw new NotFoundException('Evidence not found.');
    if (evidence.scanStatus === PaymentEvidenceScanStatus.REJECTED) {
      throw new ForbiddenException({
        code: 'EVIDENCE_REJECTED',
        message: 'This file was rejected and cannot be opened.',
      });
    }
    const opened = await this.storage.openFile(evidence.storageKey, {
      kind: 'platform',
    });
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.platformUserId,
      action: 'BANK_TRANSFER_EVIDENCE_VIEWED',
      entityType: 'BankTransferClaim',
      entityId: claimId,
      sourceModule: 'billing',
      afterSnapshot: { evidenceId },
    });
    return { opened, evidence };
  }

  /**
   * Approve after the operator has independently confirmed the credit in the
   * bank account. Idempotent: approving an already-approved claim re-attempts
   * only the confirmation, which is itself idempotent, so a request that died
   * after the claim moved cannot leave a paid order unactivated forever.
   */
  async approveClaim(
    claimId: string,
    input: {
      bankStatementReference: string;
      receivedAmount: string;
      currency: string;
      note?: string;
    },
    actor: Actor,
  ) {
    const claim = await this.prisma.bankTransferClaim.findUnique({
      where: { id: claimId },
      include: { subscriptionOrder: true },
    });
    if (!claim) throw new NotFoundException('Claim not found.');
    const order = claim.subscriptionOrder;

    if (claim.status === BankTransferClaimStatus.APPROVED) {
      await this.confirm(order.id, claim.id);
      return { claimId, status: claim.status, alreadyApproved: true };
    }
    if (!DECIDABLE_CLAIM_STATUSES.includes(claim.status)) {
      throw new ConflictException({
        code: 'CLAIM_NOT_DECIDABLE',
        message: `A ${claim.status} claim cannot be approved.`,
      });
    }
    if (order.status !== SubscriptionOrderStatus.PENDING_PAYMENT) {
      // Expired, cancelled, failed or already paid by another route. Money that
      // arrived for such an order is a reconciliation case, never an activation.
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: `The order is ${order.status}; this payment cannot activate it. Reject the claim and arrange a refund.`,
      });
    }

    const amount = checkReceivedAmount(
      { amount: order.totalAmount.toString(), currency: order.currency },
      { amount: input.receivedAmount, currency: input.currency },
    );
    if (!amount.ok) {
      throw new ConflictException({
        code: `PAYMENT_${amount.reason}`,
        message:
          'The received amount does not match the invoice. Reject the claim or ask the customer for clarification; a part or excess payment is never activated automatically.',
      });
    }

    const statementRef = normalizeBankReference(input.bankStatementReference);
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        // Exactly one reviewer moves the claim; a concurrent approval or
        // rejection finds nothing to update.
        const moved = await tx.bankTransferClaim.updateMany({
          where: {
            id: claimId,
            status: { in: [...DECIDABLE_CLAIM_STATUSES] },
          },
          data: {
            status: BankTransferClaimStatus.APPROVED,
            reviewedAt: now,
            reviewedById: actor.platformUserId,
            decisionReason: input.note?.trim() || null,
            verifiedAmount: input.receivedAmount,
            // Unique: one bank credit can settle one order, ever.
            bankStatementReferenceHash: this.hash(statementRef),
            bankStatementReferenceEncrypted: this.encrypt(statementRef),
          },
        });
        if (moved.count === 0) {
          throw new ConflictException({
            code: 'CLAIM_ALREADY_DECIDED',
            message: 'Another operator has already decided this claim.',
          });
        }
        await this.audit.log(
          {
            tenantId: 'platform',
            actorUserId: actor.platformUserId,
            action: 'BANK_TRANSFER_APPROVED',
            entityType: 'BankTransferClaim',
            entityId: claimId,
            sourceModule: 'billing',
            beforeSnapshot: { status: claim.status },
            afterSnapshot: {
              status: BankTransferClaimStatus.APPROVED,
              orderId: order.id,
              verifiedAmount: input.receivedAmount,
              currency: input.currency,
              bankStatementReference: statementRef,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DUPLICATE_BANK_REFERENCE',
          message:
            'This bank statement reference has already been used to settle another payment.',
        });
      }
      throw error;
    }

    await this.confirm(order.id, claimId);
    return {
      claimId,
      status: BankTransferClaimStatus.APPROVED,
      alreadyApproved: false,
    };
  }

  async rejectClaim(claimId: string, reason: string, actor: Actor) {
    return this.decide(
      claimId,
      BankTransferClaimStatus.REJECTED,
      reason,
      actor,
      {
        mailSubject: 'We could not verify your bank transfer',
      },
    );
  }

  async requestClarification(claimId: string, message: string, actor: Actor) {
    const claim = await this.decide(
      claimId,
      BankTransferClaimStatus.CLARIFICATION_REQUESTED,
      message,
      actor,
      { mailSubject: 'We need more information about your bank transfer' },
    );
    await this.prisma.bankTransferClaim.update({
      where: { id: claimId },
      data: { clarificationRequest: message.trim() },
    });
    return claim;
  }

  async markDuplicate(claimId: string, reason: string, actor: Actor) {
    return this.decide(
      claimId,
      BankTransferClaimStatus.DUPLICATE,
      reason,
      actor,
    );
  }

  /**
   * Age out claims whose invoice lapsed with nobody deciding them. An approved
   * claim is untouched; a pending one is expired only after a grace period past
   * the invoice's due date, so funds already in flight are not orphaned silently.
   */
  async expireStaleClaims(now = new Date(), graceDays = 7): Promise<number> {
    const cutoff = new Date(now.getTime() - graceDays * 86_400_000);
    const stale = await this.prisma.bankTransferClaim.updateMany({
      where: {
        status: { in: [...OPEN_CLAIM_STATUSES] },
        subscriptionOrder: { expiresAt: { lt: cutoff } },
      },
      data: { status: BankTransferClaimStatus.EXPIRED, reviewedAt: now },
    });
    return stale.count;
  }

  // ---- internals --------------------------------------------------------------

  private async decide(
    claimId: string,
    status: BankTransferClaimStatus,
    reason: string,
    actor: Actor,
    mail?: { mailSubject: string },
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A reason is required.',
      });
    }
    const claim = await this.prisma.bankTransferClaim.findUnique({
      where: { id: claimId },
      select: {
        status: true,
        subscriptionOrderId: true,
        subscriptionOrder: {
          select: {
            orderNumber: true,
            customer: {
              select: { primaryContactEmail: true, contactEmail: true },
            },
          },
        },
      },
    });
    if (!claim) throw new NotFoundException('Claim not found.');
    const moved = await this.prisma.bankTransferClaim.updateMany({
      where: { id: claimId, status: { in: [...DECIDABLE_CLAIM_STATUSES] } },
      data: {
        status,
        decisionReason: reason.trim(),
        reviewedAt: new Date(),
        reviewedById: actor.platformUserId,
      },
    });
    if (moved.count === 0) {
      throw new ConflictException({
        code: 'CLAIM_NOT_DECIDABLE',
        message: `A ${claim.status} claim cannot be changed.`,
      });
    }
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.platformUserId,
      action: `BANK_TRANSFER_${status}`,
      entityType: 'BankTransferClaim',
      entityId: claimId,
      sourceModule: 'billing',
      beforeSnapshot: { status: claim.status },
      afterSnapshot: { status, reason: reason.trim() },
    });
    if (mail) {
      await this.mail(claim.subscriptionOrder.customer, {
        eventCode: `BANK_TRANSFER_${status}`,
        entityId: claim.subscriptionOrderId,
        subject: `${mail.mailSubject} (${claim.subscriptionOrder.orderNumber})`,
        lines: [reason.trim()],
        key: `bank-claim:${claimId}:${status}`,
      });
    }
    return { claimId, status };
  }

  private async confirm(orderId: string, claimId: string) {
    await this.orderActivation.confirmPayment({
      orderId,
      correlationId: `bank-transfer:${claimId}`,
    });
  }

  private validateEvidence(file: EvidenceUpload) {
    if (file.buffer.length === 0 || file.buffer.length > EVIDENCE_MAX_BYTES) {
      throw new BadRequestException({
        code: 'EVIDENCE_SIZE_INVALID',
        message: 'Each file must be between 1 byte and 5 MB.',
      });
    }
    const kind = sniffEvidenceKind(file.buffer);
    if (!kind) {
      throw new BadRequestException({
        code: 'EVIDENCE_TYPE_INVALID',
        message: 'Evidence must be a PDF, PNG or JPEG file.',
      });
    }
    return {
      buffer: file.buffer,
      kind,
      name: sanitizeEvidenceFileName(file.originalName),
    };
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        marketId: true,
        currency: true,
        totalAmount: true,
        ownerEmailVerifiedAt: true,
        providerPaymentId: true,
        stripeCheckoutSessionId: true,
        bankReference: true,
        receivingAccountId: true,
        paymentMethodConfigId: true,
        expiresAt: true,
        customer: {
          select: { primaryContactEmail: true, contactEmail: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ONBOARDING_SESSION_NOT_FOUND',
        message: 'This onboarding session is no longer active.',
      });
    }
    return order;
  }

  private customerState(
    orderStatus: SubscriptionOrderStatus,
    claimStatus: BankTransferClaimStatus | null,
    expired: boolean,
  ) {
    if (
      orderStatus === SubscriptionOrderStatus.PAID ||
      orderStatus === SubscriptionOrderStatus.ACTIVATED
    ) {
      return 'PAID' as const;
    }
    if (orderStatus === SubscriptionOrderStatus.CANCELLED)
      return 'CANCELLED' as const;
    if (expired) return 'EXPIRED' as const;
    if (claimStatus === BankTransferClaimStatus.PENDING_VERIFICATION)
      return 'PENDING_VERIFICATION' as const;
    if (claimStatus === BankTransferClaimStatus.CLARIFICATION_REQUESTED)
      return 'CLARIFICATION_REQUESTED' as const;
    if (claimStatus === BankTransferClaimStatus.REJECTED)
      return 'REJECTED' as const;
    return 'AWAITING_PAYMENT' as const;
  }

  private encrypt(value: string): string {
    if (!this.secrets.isEnabled) {
      throw new ConflictException({
        code: 'SECRET_ENCRYPTION_UNAVAILABLE',
        message:
          'Payment references cannot be stored until encryption is configured.',
      });
    }
    return this.secrets.encrypt(value);
  }

  private hash(value: string): string {
    return this.secrets.hmac(value);
  }

  private async mail(
    customer: {
      primaryContactEmail: string | null;
      contactEmail: string | null;
    } | null,
    input: {
      eventCode: string;
      entityId: string;
      subject: string;
      lines: string[];
      key: string;
    },
  ) {
    const recipient = customer?.primaryContactEmail ?? customer?.contactEmail;
    if (!recipient) return;
    const escape = (s: string) =>
      s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    try {
      await this.communications.sendEmail({
        eventCode: input.eventCode,
        recipient,
        subject: input.subject,
        html: input.lines.map((l) => `<p>${escape(l)}</p>`).join(''),
        text: input.lines.join('\n\n'),
        entityType: 'SubscriptionOrder',
        entityId: input.entityId,
        idempotencyKey: input.key,
      });
    } catch (error) {
      // A mail failure must never undo a financial decision already recorded.
      this.logger.warn(
        `Could not send ${input.eventCode} for order ${input.entityId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
