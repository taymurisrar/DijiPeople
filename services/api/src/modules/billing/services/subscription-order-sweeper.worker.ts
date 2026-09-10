import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionOrderService } from './subscription-order.service';

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 60 * 1000;

/**
 * Runs `SubscriptionOrderService.abandonExpired` on an interval.
 *
 * BUG-2618: the sweep was written, commented and covered by an e2e test that
 * calls it directly, but nothing in the running application ever called it.
 * `submissionHash` and `requestedSlug` are unique columns, so an unpaid order
 * that nobody ages out holds its workspace address and its idempotency hash
 * forever — permanently refusing a name to every later buyer, including the
 * person who abandoned the checkout.
 *
 * Deliberately the same shape as `OutboxWorkerService` and
 * `ReportSchedulerWorker`: `OnModuleInit`/`OnModuleDestroy`, one unref'd
 * interval, a re-entrancy guard, an explicit env flag, and a tick that cannot
 * throw. Off by default for the same reason those two are: a worker that
 * starts itself in every process starts in tests, in seeds and in one-off
 * scripts too, and enabling a background sweep of billing state is a
 * deployment decision, not an import-time side effect.
 */
@Injectable()
export class SubscriptionOrderSweeperWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionOrderSweeperWorker.name);

  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow sweep overlapping the next tick. */
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly subscriptionOrderService: SubscriptionOrderService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Subscription order sweeper disabled (SUBSCRIPTION_ORDER_SWEEPER_ENABLED is not "true"); expired PENDING_PAYMENT orders accumulate and their workspace address and submission hash stay held.',
      );
      return;
    }

    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);

    // Without this the Node process cannot exit while the interval is
    // pending, which turns every CLI invocation that loads the Nest container
    // into a process that has to be killed.
    this.timer.unref?.();

    this.logger.log(
      `Subscription order sweeper started; polling every ${interval}ms.`,
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
      this.configService.get<string>('SUBSCRIPTION_ORDER_SWEEPER_ENABLED') ===
      'true'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>(
        'SUBSCRIPTION_ORDER_SWEEPER_POLL_INTERVAL_MS',
      ),
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_POLL_INTERVAL_MS;
    }
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  /**
   * One sweep.
   *
   * Never throws. An unhandled rejection from a timer callback takes the
   * process down, and a transient database blip must not be able to stop the
   * sweeper permanently — the next tick retries on its own.
   */
  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const count = await this.subscriptionOrderService.abandonExpired();
      if (count > 0) {
        this.logger.log(
          `Subscription order sweep: abandoned ${count} expired order(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Subscription order sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
