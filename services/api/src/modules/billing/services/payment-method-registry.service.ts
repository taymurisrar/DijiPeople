import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BankReceivingAccount,
  BillingPaymentMethodKey,
  PaymentMethodApprovalStatus,
  PaymentMethodConfiguration,
  PaymentMethodEnvironment,
  PaymentProvider,
  Prisma,
  ReceivingAccountStatus,
} from '@prisma/client';
import { isProductionLike } from './stripe-billing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { AuditService } from '../../audit/audit.service';
import {
  isValidIban,
  maskAccountTitle,
  maskIdentifier,
} from '../bank-transfer/bank-transfer.rules';

export type ReadinessCheck = { key: string; ok: boolean; detail: string };

export type PublicPaymentOption = {
  key: BillingPaymentMethodKey;
  label: string;
  kind: 'card' | 'bank_transfer';
  /** The gateway that executes it; null for a bank transfer. */
  provider: PaymentProvider | null;
};

/** The facts a bank-transfer checkout is built from — never reaches a response whole. */
export type ReadyBankTransfer = {
  config: PaymentMethodConfiguration;
  account: BankReceivingAccount;
};

export type BankInstructions = {
  bankName: string;
  accountTitle: string;
  accountNumber: string | null;
  iban: string | null;
  raastId: string | null;
  currency: string;
  paymentInstructions: string | null;
};

type Actor = { platformUserId: string | null };

const CARD_METHOD_BY_PROVIDER: Record<
  PaymentProvider,
  BillingPaymentMethodKey
> = {
  [PaymentProvider.STRIPE]: BillingPaymentMethodKey.STRIPE_CARD,
  [PaymentProvider.SAFEPAY]: BillingPaymentMethodKey.SAFEPAY_CARD,
};

export const CARD_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  [PaymentProvider.STRIPE]: 'Card (Stripe)',
  [PaymentProvider.SAFEPAY]: 'Card (Safepay)',
};

/**
 * The one place that decides which payment methods a market may be offered.
 *
 * A method is public only when **every** gate holds: a configuration row for
 * this market and currency, enabled by an operator, approved, in an environment
 * that matches the running deployment, and — for a bank transfer — backed by an
 * approved, active receiving account whose identifiers can be stored encrypted.
 * Nothing here reads a request: the market and currency come from the priced
 * order, so a buyer cannot ask for another market's methods.
 *
 * Card gateways keep their own credential and production guards in
 * `PaymentGateways` / `BillingService`; the registry only adds an operator's
 * veto on top, so an unconfigured registry behaves exactly as before.
 */
@Injectable()
export class PaymentMethodRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secrets: SecretEncryptionService,
    private readonly audit: AuditService,
  ) {}

  /** SANDBOX rows are never public in a production-like runtime; PRODUCTION rows only there. */
  environmentAllowed(environment: PaymentMethodEnvironment): boolean {
    if (environment === PaymentMethodEnvironment.MANUAL) return true;
    const production = isProductionLike(this.config);
    return environment === PaymentMethodEnvironment.PRODUCTION
      ? production
      : !production;
  }

  // ---- public availability --------------------------------------------------

  /** The bank transfer a buyer in this market/currency may use right now, or null. */
  async findReadyBankTransfer(input: {
    marketId: string | null;
    currency: string;
  }): Promise<ReadyBankTransfer | null> {
    if (!input.marketId || !this.secrets.isEnabled) return null;
    const config = await this.prisma.paymentMethodConfiguration.findFirst({
      where: {
        marketId: input.marketId,
        currency: input.currency.toUpperCase(),
        methodKey: BillingPaymentMethodKey.BANK_TRANSFER,
        environment: PaymentMethodEnvironment.MANUAL,
        enabled: true,
        approvalStatus: PaymentMethodApprovalStatus.APPROVED,
      },
    });
    if (!config) return null;
    const account = await this.prisma.bankReceivingAccount.findFirst({
      where: {
        paymentMethodConfigId: config.id,
        currency: input.currency.toUpperCase(),
        status: ReceivingAccountStatus.APPROVED,
        isActive: true,
      },
    });
    return account ? { config, account } : null;
  }

  /**
   * An operator's veto over a card gateway. `true` when no row exists for the
   * market (the registry has no opinion, so today's behaviour is preserved);
   * once a row exists the method is permitted only if it is enabled, approved
   * and in the right environment.
   */
  async isCardMethodPermitted(input: {
    provider: PaymentProvider;
    marketId: string | null;
    currency: string;
  }): Promise<boolean> {
    if (!input.marketId) return true;
    const rows = await this.prisma.paymentMethodConfiguration.findMany({
      where: {
        marketId: input.marketId,
        currency: input.currency.toUpperCase(),
        methodKey: CARD_METHOD_BY_PROVIDER[input.provider],
      },
      select: { enabled: true, approvalStatus: true, environment: true },
    });
    if (rows.length === 0) return true;
    return rows.some(
      (row) =>
        row.enabled &&
        row.approvalStatus === PaymentMethodApprovalStatus.APPROVED &&
        this.environmentAllowed(row.environment),
    );
  }

  /**
   * What the checkout may show for a priced selection. `cardProviders` is what
   * the existing gateway resolution already judged payable; the registry can
   * only remove from it, never add to it.
   */
  async listPublicOptions(input: {
    marketId: string | null;
    currency: string;
    cardProviders: readonly PaymentProvider[];
  }): Promise<{
    options: PublicPaymentOption[];
    /** No approved receiving account: the honest assisted-invoice fallback applies. */
    assistedInvoiceFallback: boolean;
  }> {
    const options: PublicPaymentOption[] = [];

    const bank = await this.findReadyBankTransfer(input);
    if (bank) {
      options.push({
        key: BillingPaymentMethodKey.BANK_TRANSFER,
        label: bank.config.displayName,
        kind: 'bank_transfer',
        provider: null,
      });
    }

    for (const provider of input.cardProviders) {
      if (
        await this.isCardMethodPermitted({
          provider,
          marketId: input.marketId,
          currency: input.currency,
        })
      ) {
        options.push({
          key: CARD_METHOD_BY_PROVIDER[provider],
          label: CARD_PROVIDER_LABELS[provider],
          kind: 'card',
          provider,
        });
      }
    }

    return { options, assistedInvoiceFallback: !bank };
  }

  /** Decrypts for the one buyer holding this order — never for a list. */
  instructionsFor(account: BankReceivingAccount): BankInstructions {
    const plain = (value: string | null) =>
      value ? this.secrets.decrypt(value) : null;
    return {
      bankName: account.bankName,
      accountTitle: this.secrets.decrypt(account.accountTitleEncrypted),
      accountNumber: plain(account.accountNumberEncrypted),
      iban: plain(account.ibanEncrypted),
      raastId: plain(account.raastIdEncrypted),
      currency: account.currency,
      paymentInstructions: account.paymentInstructions,
    };
  }

  // ---- readiness ------------------------------------------------------------

  async readiness(configId: string): Promise<ReadinessCheck[]> {
    const config = await this.prisma.paymentMethodConfiguration.findUnique({
      where: { id: configId },
      include: { receivingAccounts: true },
    });
    if (!config) throw new NotFoundException('Payment method not found.');

    const checks: ReadinessCheck[] = [
      {
        key: 'APPROVED',
        ok: config.approvalStatus === PaymentMethodApprovalStatus.APPROVED,
        detail: `Approval status is ${config.approvalStatus}.`,
      },
      {
        key: 'ENVIRONMENT',
        ok: this.environmentAllowed(config.environment),
        detail: `Environment ${config.environment} is ${this.environmentAllowed(config.environment) ? 'valid' : 'not valid'} for this deployment.`,
      },
    ];
    if (config.methodKey === BillingPaymentMethodKey.BANK_TRANSFER) {
      const active = config.receivingAccounts.find(
        (a) => a.isActive && a.status === ReceivingAccountStatus.APPROVED,
      );
      checks.push(
        {
          key: 'RECEIVING_ACCOUNT',
          ok: Boolean(active),
          detail: active
            ? 'An approved receiving account is active.'
            : 'No approved, active receiving account is configured.',
        },
        {
          key: 'ENCRYPTION',
          ok: this.secrets.isEnabled,
          detail: this.secrets.isEnabled
            ? 'Secret encryption is configured.'
            : 'SECRET_ENCRYPTION_KEY is not set; bank details cannot be stored.',
        },
      );
    }
    return checks;
  }

  // ---- administration -------------------------------------------------------

  /** Markets a method can be configured for — the picker in the console. */
  listMarkets() {
    return this.prisma.market.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        defaultCurrency: true,
        supportedCurrencies: true,
      },
    });
  }

  async listConfigurations() {
    const rows = await this.prisma.paymentMethodConfiguration.findMany({
      orderBy: [{ marketId: 'asc' }, { currency: 'asc' }, { methodKey: 'asc' }],
      include: {
        market: { select: { id: true, code: true, name: true } },
        receivingAccounts: {
          select: { id: true, status: true, isActive: true },
        },
      },
    });
    return Promise.all(
      rows.map(async (row) => {
        const checks = await this.readiness(row.id);
        return {
          ...row,
          publicAvailable:
            row.enabled &&
            row.approvalStatus === 'APPROVED' &&
            checks.every((c) => c.ok),
          readiness: checks,
        };
      }),
    );
  }

  async createConfiguration(
    input: {
      marketId: string;
      currency: string;
      methodKey: BillingPaymentMethodKey;
      environment?: PaymentMethodEnvironment;
      displayName: string;
    },
    actor: Actor,
  ) {
    const environment =
      input.methodKey === BillingPaymentMethodKey.BANK_TRANSFER
        ? PaymentMethodEnvironment.MANUAL
        : (input.environment ?? PaymentMethodEnvironment.SANDBOX);
    if (
      input.methodKey === BillingPaymentMethodKey.BANK_TRANSFER &&
      input.environment &&
      input.environment !== PaymentMethodEnvironment.MANUAL
    ) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_ENVIRONMENT_INVALID',
        message: 'A bank transfer has no sandbox or gateway environment.',
      });
    }
    const market = await this.prisma.market.findUnique({
      where: { id: input.marketId },
      select: { id: true },
    });
    if (!market) throw new NotFoundException('Market not found.');

    try {
      const created = await this.prisma.paymentMethodConfiguration.create({
        data: {
          marketId: input.marketId,
          currency: input.currency.trim().toUpperCase(),
          methodKey: input.methodKey,
          environment,
          displayName: input.displayName.trim(),
          // Never public on creation: approval and enabling are separate acts.
          enabled: false,
          approvalStatus: PaymentMethodApprovalStatus.PENDING,
          createdById: actor.platformUserId,
        },
      });
      await this.record(
        'PAYMENT_METHOD_CREATED',
        created.id,
        actor,
        null,
        created,
      );
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PAYMENT_METHOD_EXISTS',
          message:
            'This payment method is already configured for the market, currency and environment.',
        });
      }
      throw error;
    }
  }

  async setApproval(
    id: string,
    status: PaymentMethodApprovalStatus,
    actor: Actor,
  ) {
    const before = await this.requireConfig(id);
    const approved = status === PaymentMethodApprovalStatus.APPROVED;
    const updated = await this.prisma.paymentMethodConfiguration.update({
      where: { id },
      data: {
        approvalStatus: status,
        approvedAt: approved ? new Date() : null,
        approvedById: approved ? actor.platformUserId : null,
        // A method that stops being approved can no longer be public.
        ...(approved ? {} : { enabled: false }),
        updatedById: actor.platformUserId,
      },
    });
    await this.record(
      'PAYMENT_METHOD_APPROVAL_CHANGED',
      id,
      actor,
      before,
      updated,
    );
    return updated;
  }

  async setEnabled(id: string, enabled: boolean, actor: Actor) {
    const before = await this.requireConfig(id);
    if (enabled) {
      const failing = (await this.readiness(id)).filter((c) => !c.ok);
      if (failing.length > 0) {
        throw new ConflictException({
          code: 'PAYMENT_METHOD_NOT_READY',
          message: `This payment method cannot be enabled: ${failing
            .map((c) => c.detail)
            .join(' ')}`,
        });
      }
    }
    const updated = await this.prisma.paymentMethodConfiguration.update({
      where: { id },
      data: { enabled, updatedById: actor.platformUserId },
    });
    await this.record(
      'PAYMENT_METHOD_ENABLED_CHANGED',
      id,
      actor,
      before,
      updated,
    );
    return updated;
  }

  /** Masked projection only — the encrypted columns never leave this service. */
  async listAccounts(configId: string) {
    const rows = await this.prisma.bankReceivingAccount.findMany({
      where: { paymentMethodConfigId: configId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toMaskedAccount);
  }

  async createAccount(
    configId: string,
    input: {
      bankName: string;
      accountTitle: string;
      accountNumber?: string;
      iban?: string;
      raastId?: string;
      paymentInstructions?: string;
    },
    actor: Actor,
  ) {
    const config = await this.requireConfig(configId);
    if (config.methodKey !== BillingPaymentMethodKey.BANK_TRANSFER) {
      throw new BadRequestException({
        code: 'NOT_A_BANK_TRANSFER_METHOD',
        message: 'Receiving accounts belong to a bank-transfer method.',
      });
    }
    if (!this.secrets.isEnabled) {
      // Fail closed: `encrypt` would otherwise store the account in plaintext.
      throw new ConflictException({
        code: 'SECRET_ENCRYPTION_UNAVAILABLE',
        message:
          'Bank details cannot be stored until secret encryption is configured.',
      });
    }
    const iban = input.iban?.replace(/\s+/g, '').toUpperCase();
    if (iban && !isValidIban(iban)) {
      throw new BadRequestException({
        code: 'IBAN_INVALID',
        message: 'The IBAN failed its checksum.',
      });
    }
    if (!iban && !input.accountNumber?.trim() && !input.raastId?.trim()) {
      throw new BadRequestException({
        code: 'RECEIVING_IDENTIFIER_REQUIRED',
        message: 'Provide an IBAN, an account number or a Raast ID.',
      });
    }
    const accountNumber = input.accountNumber?.trim();
    const raastId = input.raastId?.trim();
    const created = await this.prisma.bankReceivingAccount.create({
      data: {
        paymentMethodConfigId: configId,
        currency: config.currency,
        bankName: input.bankName.trim(),
        accountTitleEncrypted: this.secrets.encrypt(input.accountTitle.trim()),
        accountNumberEncrypted: accountNumber
          ? this.secrets.encrypt(accountNumber)
          : null,
        ibanEncrypted: iban ? this.secrets.encrypt(iban) : null,
        raastIdEncrypted: raastId ? this.secrets.encrypt(raastId) : null,
        maskedAccountTitle: maskAccountTitle(input.accountTitle),
        maskedAccountNumber: accountNumber
          ? maskIdentifier(accountNumber)
          : null,
        maskedIban: iban ? maskIdentifier(iban) : null,
        maskedRaastId: raastId ? maskIdentifier(raastId) : null,
        paymentInstructions: input.paymentInstructions?.trim() || null,
        status: ReceivingAccountStatus.PENDING_APPROVAL,
        isActive: false,
        createdById: actor.platformUserId,
      },
    });
    // The audit snapshot carries the masked projection, never the identifiers.
    await this.record(
      'RECEIVING_ACCOUNT_CREATED',
      created.id,
      actor,
      null,
      toMaskedAccount(created),
    );
    return toMaskedAccount(created);
  }

  /**
   * Approving is a second pair of eyes: whoever entered an account cannot also
   * approve it, so no single operator can route customer money to an account
   * nobody else has looked at.
   */
  async decideAccount(
    accountId: string,
    decision: 'APPROVE' | 'REJECT' | 'SUSPEND',
    reason: string | undefined,
    actor: Actor,
  ) {
    const before = await this.requireAccount(accountId);
    if (
      decision === 'APPROVE' &&
      actor.platformUserId &&
      before.createdById === actor.platformUserId
    ) {
      throw new ConflictException({
        code: 'SEPARATION_OF_DUTIES',
        message:
          'A receiving account must be approved by a different operator.',
      });
    }
    if (decision !== 'APPROVE' && !reason?.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A reason is required.',
      });
    }
    const now = new Date();
    const updated = await this.prisma.bankReceivingAccount.update({
      where: { id: accountId },
      data:
        decision === 'APPROVE'
          ? {
              status: ReceivingAccountStatus.APPROVED,
              approvedAt: now,
              approvedById: actor.platformUserId,
              rejectedAt: null,
              rejectionReason: null,
              updatedById: actor.platformUserId,
            }
          : {
              status:
                decision === 'REJECT'
                  ? ReceivingAccountStatus.REJECTED
                  : ReceivingAccountStatus.SUSPENDED,
              rejectedAt: now,
              rejectionReason: reason!.trim(),
              // A rejected or suspended account must stop receiving new invoices.
              isActive: false,
              updatedById: actor.platformUserId,
            },
    });
    await this.record(
      {
        APPROVE: 'RECEIVING_ACCOUNT_APPROVED',
        REJECT: 'RECEIVING_ACCOUNT_REJECTED',
        SUSPEND: 'RECEIVING_ACCOUNT_SUSPENDED',
      }[decision],
      accountId,
      actor,
      toMaskedAccount(before),
      toMaskedAccount(updated),
    );
    return toMaskedAccount(updated);
  }

  /**
   * Make an approved account the one new invoices point at. Orders already
   * issued keep the account they were told about, so switching never redirects
   * money a buyer has already been asked to send.
   */
  async activateAccount(accountId: string, actor: Actor) {
    const account = await this.requireAccount(accountId);
    if (account.status !== ReceivingAccountStatus.APPROVED) {
      throw new ConflictException({
        code: 'ACCOUNT_NOT_APPROVED',
        message: 'Only an approved account can be activated.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.bankReceivingAccount.updateMany({
        where: {
          paymentMethodConfigId: account.paymentMethodConfigId,
          isActive: true,
        },
        data: { isActive: false },
      }),
      this.prisma.bankReceivingAccount.update({
        where: { id: accountId },
        data: { isActive: true, updatedById: actor.platformUserId },
      }),
    ]);
    await this.record('RECEIVING_ACCOUNT_ACTIVATED', accountId, actor, null, {
      id: accountId,
    });
    return toMaskedAccount(await this.requireAccount(accountId));
  }

  // ---- internals ------------------------------------------------------------

  private async requireConfig(id: string) {
    const row = await this.prisma.paymentMethodConfiguration.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Payment method not found.');
    return row;
  }

  private async requireAccount(id: string) {
    const row = await this.prisma.bankReceivingAccount.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Receiving account not found.');
    return row;
  }

  private record(
    action: string,
    entityId: string,
    actor: Actor,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.platformUserId,
      action,
      entityType: 'PaymentMethodConfiguration',
      entityId,
      sourceModule: 'billing',
      beforeSnapshot: before,
      afterSnapshot: after,
    });
  }
}

export function toMaskedAccount(row: BankReceivingAccount) {
  return {
    id: row.id,
    paymentMethodConfigId: row.paymentMethodConfigId,
    currency: row.currency,
    bankName: row.bankName,
    maskedAccountTitle: row.maskedAccountTitle,
    maskedAccountNumber: row.maskedAccountNumber,
    maskedIban: row.maskedIban,
    maskedRaastId: row.maskedRaastId,
    paymentInstructions: row.paymentInstructions,
    status: row.status,
    isActive: row.isActive,
    createdById: row.createdById,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
