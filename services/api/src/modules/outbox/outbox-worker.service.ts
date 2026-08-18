import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 25;

/**
 * Polls the outbox on an interval.
 *
 * Deliberately a poll loop over a PostgreSQL table rather than a broker. This
 * repository is a modular monolith with one database and no queue
 * infrastructure — the notification "queue" is a synchronous fallback with no
 * Redis behind it — so introducing a broker here would mean introducing a
 * second deployable and a second failure mode to solve a problem that
 * `FOR UPDATE SKIP LOCKED` already solves inside the transaction boundary we
 * already have.
 *
 * Off by default. A worker that starts itself in every process — including
 * tests, CLI seeds and one-off scripts — is how a background loop ends up
 * running somewhere nobody expected, so enabling it is an explicit deployment
 * decision via `OUTBOX_WORKER_ENABLED`.
 */
@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);

  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow drain overlapping the next tick. */
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Outbox worker disabled (OUTBOX_WORKER_ENABLED is not "true"); events accumulate until a worker or an operator drains them.',
      );
      return;
    }

    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);

    // Without this the Node process cannot exit while the interval is pending,
    // which turns every CLI invocation that loads the Nest container into a
    // process that has to be killed.
    this.timer.unref?.();

    this.logger.log(`Outbox worker started; polling every ${interval}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isEnabled(): boolean {
    return this.configService.get<string>('OUTBOX_WORKER_ENABLED') === 'true';
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>('OUTBOX_WORKER_POLL_INTERVAL_MS'),
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_POLL_INTERVAL_MS;
    }
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  private batchSize(): number {
    const raw = Number(
      this.configService.get<string>('OUTBOX_WORKER_BATCH_SIZE'),
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_BATCH_SIZE;
    }
    return Math.max(1, Math.min(Math.trunc(raw), 200));
  }

  /**
   * One poll.
   *
   * Never throws. An unhandled rejection from a timer callback takes the
   * process down, and a transient database blip must not be able to stop event
   * delivery permanently — the next tick retries on its own.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const result = await this.dispatcher.drain(this.batchSize());
      if (result.claimed > 0) {
        this.logger.log(
          `Outbox drain: claimed=${result.claimed} processed=${result.processed} retried=${result.retried} failed=${result.failed} manual=${result.manualActionRequired}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Outbox drain failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
