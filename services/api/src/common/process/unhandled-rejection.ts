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
import { redactSecretsInText } from '../errors/sanitize-error-log';

export type RejectionLogger = {
  error(message: string, stack?: string): void;
};

type ProcessLike = {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  listenerCount(event: 'unhandledRejection'): number;
};

const MAX_MESSAGE_LENGTH = 200;

/**
 * What is safe to write to a production log about an arbitrary rejection.
 *
 * A raw message is not safe: Prisma errors embed the SQL statement and the bound
 * values, and a driver error can carry a connection string. So this keeps the
 * error class and code, the FIRST line of the message only (truncated and passed
 * through the same secret redaction the error log uses), and the stack FRAMES
 * without the message lines above them. The frames say where; they carry no data.
 */
export function describeRejection(reason: unknown): {
  message: string;
  stack?: string;
} {
  if (reason instanceof Error) {
    const code = (reason as { code?: unknown }).code;
    const firstLine = redactSecretsInText(
      (reason.message ?? '').split('\n')[0] ?? '',
    ).slice(0, MAX_MESSAGE_LENGTH);
    const label =
      typeof code === 'string' ? `${reason.name} ${code}` : reason.name;
    const frames = (reason.stack ?? '')
      .split('\n')
      .filter((line) => /^\s+at\s/.test(line))
      .join('\n');
    return {
      message: `${label}: ${firstLine}`,
      stack: frames || undefined,
    };
  }
  if (typeof reason === 'string') {
    return {
      message: redactSecretsInText(reason).slice(0, MAX_MESSAGE_LENGTH),
    };
  }
  // Never serialise an arbitrary object: it can hold request data or secrets.
  return { message: `non-Error rejection of type ${typeof reason}` };
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
