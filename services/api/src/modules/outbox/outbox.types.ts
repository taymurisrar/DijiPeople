import type { DomainEventType, OutboxEvent, Prisma } from '@prisma/client';

/**
 * What a domain service hands to the outbox inside its own transaction.
 *
 * `idempotencyKey` is deliberately required and deliberately not defaulted to a
 * random value. The whole guarantee of this mechanism is that the same business
 * transition announced twice collapses to one event, and a generated default
 * would silently destroy that guarantee at the one call site that forgot.
 * `buildIdempotencyKey` exists so constructing one is easier than inventing one.
 */
export type EmitDomainEventInput = {
  eventType: DomainEventType;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  tenantId?: string | null;
  customerAccountId?: string | null;
  /** Delay first delivery — used for scheduled transitions, not for retries. */
  availableAt?: Date;
  maxAttempts?: number;
};

/**
 * A consumer's verdict on one event.
 *
 * `MANUAL_ACTION_REQUIRED` is separate from failure on purpose: a failure means
 * "try again", and retrying something no retry can fix just burns the attempt
 * budget and hides the event behind a generic FAILED state that looks like an
 * infrastructure problem.
 */
export type OutboxHandlerOutcome =
  | { status: 'PROCESSED'; detail?: string }
  | { status: 'SKIPPED'; detail: string }
  | { status: 'MANUAL_ACTION_REQUIRED'; detail: string };

export interface OutboxHandler {
  /**
   * Stable identity of this consumer, e.g. `provisioning.request-tenant`.
   * It is written into OutboxEventConsumption, so renaming one makes every
   * event it already handled look unhandled. Treat it as a durable contract.
   */
  readonly consumerKey: string;

  /** The event types this consumer wants. */
  readonly handles: readonly DomainEventType[];

  handle(
    event: OutboxEvent,
    payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome>;
}

/**
 * Injection token for the handler set.
 *
 * Handlers are collected rather than imported one by one so that a module can
 * contribute a consumer without the outbox module having to depend on it —
 * the dependency runs the right way round, from the domain to the mechanism.
 */
export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');

/**
 * Build the business identity of an event.
 *
 * The parts should describe *what happened*, never *when it was noticed*. A
 * timestamp or a random id here would make every redelivery look like a new
 * transition, which is precisely the bug the unique index exists to prevent.
 */
export function buildIdempotencyKey(
  eventType: DomainEventType,
  ...parts: Array<string | number>
): string {
  return [eventType, ...parts.map((part) => String(part).trim())]
    .filter((part) => part.length > 0)
    .join(':')
    .slice(0, 500);
}
