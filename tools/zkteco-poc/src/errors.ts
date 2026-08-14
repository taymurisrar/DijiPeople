/**
 * Actionable error taxonomy for the POC.
 *
 * Codes are shared with the x86 worker: the worker reports a code in its JSON
 * result and the CLI surfaces it unchanged, so an operator sees one vocabulary
 * whether the failure happened in the COM adapter or on this side.
 */

export const ZK_ERROR_CODES = [
  'CONFIG_INVALID',
  'ARCHITECTURE_MISMATCH',
  'SDK_NOT_AVAILABLE',
  'SDK_REGISTRATION_FAILED',
  'DEVICE_UNREACHABLE',
  'CONNECTION_TIMEOUT',
  'AUTHENTICATION_FAILED',
  'INVALID_COMM_KEY',
  'DEVICE_BUSY',
  'READ_DEVICE_INFO_FAILED',
  'READ_USERS_FAILED',
  'READ_ATTENDANCE_FAILED',
  'READ_ONLY_VIOLATION',
  'DISCONNECT_FAILED',
  'UNSUPPORTED_DEVICE',
  'OUTPUT_WRITE_FAILED',
  'UNKNOWN_ERROR',
] as const;

export type ZkErrorCode = (typeof ZK_ERROR_CODES)[number];

/**
 * A type alias rather than an interface on purpose: TypeScript grants implicit
 * index signatures to type aliases, which lets these details be spread straight
 * into the logger's `Record<string, unknown>` fields.
 */
export type ThrownDetails = {
  message: string;
  /** Node/system error code (`ENOENT`, `EACCES`, ...) when present. */
  systemCode?: string;
};

export class ZkPocError extends Error {
  readonly code: string;
  readonly remediation: string[];
  readonly systemCode?: string;

  constructor(
    code: ZkErrorCode | string,
    message: string,
    options: { remediation?: string[]; systemCode?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ZkPocError';
    this.code = code;
    this.remediation = options.remediation ?? [];
    if (options.systemCode) this.systemCode = options.systemCode;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      systemCode: this.systemCode,
      remediation: this.remediation,
    };
  }
}

/** Normalises anything throwable into a message plus an optional system code. */
export function describeThrown(thrown: unknown): ThrownDetails {
  if (thrown instanceof Error) {
    const systemCode = (thrown as NodeJS.ErrnoException).code;
    return systemCode ? { message: thrown.message, systemCode } : { message: thrown.message };
  }

  if (typeof thrown === 'object' && thrown !== null) {
    const candidate = thrown as { message?: unknown; code?: unknown };
    const systemCode = typeof candidate.code === 'string' ? candidate.code : undefined;
    const message =
      typeof candidate.message === 'string' && candidate.message.length > 0
        ? candidate.message
        : 'Unknown error object';
    return systemCode ? { message, systemCode } : { message };
  }

  return { message: String(thrown) };
}

export function isZkPocError(value: unknown): value is ZkPocError {
  return value instanceof ZkPocError;
}
