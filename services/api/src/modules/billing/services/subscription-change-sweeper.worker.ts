import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanChangeService } from './plan-change.service';

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 60 * 1000;

/**
 * Runs `PlanChangeService.applyDueChanges` on an interval — EXECPLAN-0037 /
 * BUG-3331.
 *
 * Exactly the shape of `SubscriptionOrderSweeperWorker` (BUG-2618), because
 * this is the same defect in the same module: `applyDueChanges` was written,
 * covered by its own e2e test calling it directly, and had zero callers in
 * the running application. A scheduled DOWNGRADE — the entire point of the
 * asymmetry the record documents (an increase is immediate, a decrease waits
 * for what was already paid for) — would sit in `PlanChangeRequest` forever,
 * `SCHEDULED`, past its `effectiveAt`, never applied.
 *
 * Deliberately does NOT also call `SeatChangeService.applyDueChanges()`. That
 * method reduces `Subscription.purchasedSeats` locally with no matching
 * Stripe quantity update, so wiring it into a running sweeper would start
 * silently under-billing a tenant whose seat count was scheduled to
 * decrease — see `docs/environment-variables.md`'s entry for
 * `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED`. That is a separate, pre-existing gap
 * this worker does not fix.
 *
 * Off by default, for the same reason `OUTBOX_WORKER_ENABLED` and
 * `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` are: a worker that starts itself in
 * every process starts in tests, seeds and one-off scripts too, and enabling
 * a background sweep of billing state is a deployment decision.
 */
@Injectable()
export class SubscriptionChangeSweeperWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionChangeSweeperWorker.name);

  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow sweep overlapping the next tick. */
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly planChangeService: PlanChangeService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Subscription change sweeper disabled (SUBSCRIPTION_CHANGE_SWEEPER_ENABLED is not "true"); scheduled plan downgrades accumulate past their effective date and never apply.',
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
      `Subscription change sweeper started; polling every ${interval}ms.`,
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
      this.configService.get<string>('SUBSCRIPTION_CHANGE_SWEEPER_ENABLED') ===
      'true'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>(
        'SUBSCRIPTION_CHANGE_SWEEPER_POLL_INTERVAL_MS',
      ),
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_POLL_INTERVAL_MS;
    }
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  /**
   * One sweep. Never throws — a transient database or Stripe fault must not
   * stop the sweeper permanently; the next tick retries on its own.
   */
  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const result = await this.planChangeService.applyDueChanges();
      if (result.applied > 0 || result.failed > 0) {
        this.logger.log(
          `Subscription change sweep: applied ${result.applied}, failed ${result.failed}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Subscription change sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
