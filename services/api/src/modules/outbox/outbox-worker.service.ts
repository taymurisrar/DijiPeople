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
 * How many back-to-back drains one `kick()` may run.
 *
 * A paid order's chain is three events deep — PAYMENT_CONFIRMED opens the
 * onboarding and emits PROVISIONING_REQUESTED, whose handler provisions and
 * emits TENANT_READY — and each is only claimable once the previous handler's
 * transaction has committed. So one drain is not enough to finish the chain,
 * and an unbounded loop would let a handler that keeps emitting work hold the
 * worker forever. Five passes covers the chain with room to spare; anything
 * left after that waits for the interval, exactly as it always did.
 */
const MAX_KICK_PASSES = 5;

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

  /**
   * A kick that arrived while a drain was running. Honoured when that drain
   * finishes, so an event committed mid-drain is not left for the interval.
   */
  private kickRequested = false;

  private destroyed = false;

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
    this.destroyed = true;
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
   * Drain now instead of at the next interval.
   *
   * Called after a transition a person is actively waiting on — a confirmed
   * payment, with the buyer watching the success page. On a five-second poll
   * the three-event provisioning chain spent up to fifteen seconds sitting in
   * the table between handlers; a kick runs it back to back.
   *
   * It changes *when* the dispatcher runs, never *what* it does: the same
   * `drain`, the same SKIP LOCKED claim, the same per-consumer idempotency. So
   * a kick racing the interval, another instance, or a second kick can only
   * cause a drain that finds nothing to claim.
   *
   * Respects `OUTBOX_WORKER_ENABLED`. A process that was deliberately told not
   * to deliver events — a CLI seed, a test container, a second web instance —
   * must not start delivering them because a payment happened to be confirmed
   * inside it. Non-blocking and never throws: the caller is usually an HTTP
   * request (the Stripe webhook, the buyer's status poll) that must answer
   * without waiting on provisioning.
   */
  kick(): void {
    if (this.destroyed || !this.isEnabled()) {
      return;
    }
    if (this.running) {
      this.kickRequested = true;
      return;
    }
    setImmediate(() => {
      void this.burst();
    });
  }

  /** Up to `MAX_KICK_PASSES` drains, stopping at the first that claims nothing. */
  private async burst(): Promise<void> {
    for (let pass = 0; pass < MAX_KICK_PASSES; pass += 1) {
      if (this.destroyed) return;
      const claimed = await this.tick(true);
      // null: another drain was running and has recorded this kick, so it
      // will re-kick when it finishes. 0: nothing left that is due.
      if (claimed === null || claimed === 0) return;
    }
  }

  /**
   * One poll. Returns how many events it claimed, or null when another drain
   * was already running.
   *
   * Never throws. An unhandled rejection from a timer callback takes the
   * process down, and a transient database blip must not be able to stop event
   * delivery permanently — the next tick retries on its own.
   */
  private async tick(fromKick = false): Promise<number | null> {
    if (this.running) {
      // Recorded synchronously, before yielding, so the running drain's
      // `finally` cannot slip in between and miss it.
      if (fromKick) this.kickRequested = true;
      return null;
    }
    this.running = true;
    let claimed = 0;

    try {
      const result = await this.dispatcher.drain(this.batchSize());
      claimed = result.claimed;
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
      if (this.kickRequested) {
        this.kickRequested = false;
        this.kick();
      }
    }
    return claimed;
  }
}
