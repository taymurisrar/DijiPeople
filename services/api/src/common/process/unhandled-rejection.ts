/**
 * A last-resort guard so one forgotten `.catch` cannot take the API down.
 *
 * Node terminates the process on an unhandled promise rejection by default. A
 * fire-and-forget call whose rejection is discarded therefore turns a single
 * failed side effect (an audit write, a notification, a cache touch) into an
 * outage for every tenant. BUG-4625 was exactly that: one request from any
 * signed-in tenant user ended the process.
 *
 * This logs the rejection loudly, with its stack, and keeps serving. It is a net
 * under the real fix (every fire-and-forget call must carry its own `.catch`),
 * not a substitute for it, so it does not hide the failure: it is logged at
 * error level every time.
 *
 * Deliberately NOT installed for `uncaughtException`. A synchronous throw that
 * nothing caught leaves the process in an unknown state, and restarting it is the
 * safe response.
 */
export type RejectionLogger = {
  error(message: string, stack?: string): void;
};

type ProcessLike = {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  listenerCount(event: 'unhandledRejection'): number;
};

export function describeRejection(reason: unknown): {
  message: string;
  stack?: string;
} {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }
  try {
    return {
      message: typeof reason === 'string' ? reason : JSON.stringify(reason),
    };
  } catch {
    return { message: String(reason) };
  }
}

/** Idempotent: a second call, or a process that already has a handler, is a no-op. */
export function installUnhandledRejectionHandler(
  logger: RejectionLogger,
  target: ProcessLike = process,
): boolean {
  if (target.listenerCount('unhandledRejection') > 0) return false;
  target.on('unhandledRejection', (reason: unknown) => {
    const { message, stack } = describeRejection(reason);
    logger.error(
      `Unhandled promise rejection (process kept alive): ${message}`,
      stack,
    );
  });
  return true;
}
