import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagedRenewalService } from './managed-renewal.service';

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 60 * 1000;

/**
 * Runs `ManagedRenewalService.runOnce` on an interval: re-verifies unconfirmed
 * payments, issues renewal invoices and moves DijiPeople-billed subscriptions
 * across period boundaries.
 *
 * The same shape as `SubscriptionOrderSweeperWorker`, and off by default for
 * the same reason: a billing sweep that starts itself in every process starts
 * in tests, seeds and one-off scripts too. At least one deployed instance must
 * set `MANAGED_BILLING_WORKER_ENABLED=true` once Safepay is live, or renewals
 * are never invoiced and lapsed subscriptions never expire.
 */
@Injectable()
export class ManagedBillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ManagedBillingWorker.name);

  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow pass overlapping the next tick. */
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly renewals: ManagedRenewalService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Managed billing worker disabled (MANAGED_BILLING_WORKER_ENABLED is not "true"); Safepay renewals are not invoiced and unconfirmed payments are verified only when a buyer or webhook asks.',
      );
      return;
    }

    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    this.timer.unref?.();

    this.logger.log(
      `Managed billing worker started; polling every ${interval}ms.`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isEnabled(): boolean {
    return (
      this.configService.get<string>('MANAGED_BILLING_WORKER_ENABLED') ===
      'true'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>('MANAGED_BILLING_WORKER_POLL_INTERVAL_MS'),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  /** Never throws: a timer callback that rejects takes the process down. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.renewals.runOnce();
      if (
        result.verified ||
        result.abandoned ||
        result.neverOpened ||
        result.issued ||
        result.transitioned
      ) {
        this.logger.log(
          JSON.stringify({ event: 'billing.managed.sweep', ...result }),
        );
      }
    } catch (error) {
      this.logger.error(
        `Managed billing sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
