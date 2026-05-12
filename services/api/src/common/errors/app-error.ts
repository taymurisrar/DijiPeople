import {
  ERROR_CATALOG,
  ErrorCode,
  ErrorSeverity,
  getErrorCatalogEntry,
} from './error-catalog';

export class AppError extends Error {
  readonly errorCode: ErrorCode;
  readonly statusCode: number;
  readonly description: string;
  readonly details?: unknown;
  readonly severity: ErrorSeverity;
  readonly isOperational: boolean;
  readonly cause?: unknown;

  constructor(
    errorCode: ErrorCode,
    options: {
      message?: string;
      description?: string;
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
      severity?: ErrorSeverity;
      isOperational?: boolean;
    } = {},
  ) {
    const catalog = ERROR_CATALOG[errorCode] ?? ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
    super(options.message ?? catalog.message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = options.statusCode ?? catalog.statusCode;
    this.description = options.description ?? catalog.description;
    this.details = options.details;
    this.cause = options.cause;
    this.severity = options.severity ?? catalog.severity;
    this.isOperational = options.isOperational ?? true;
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CATALOG;
}

export function createAppError(code: string, options: ConstructorParameters<typeof AppError>[1] = {}) {
  const resolved = isErrorCode(code) ? code : 'SYSTEM_UNEXPECTED_ERROR';
  const catalog = getErrorCatalogEntry(resolved);
  return new AppError(resolved, {
    statusCode: catalog.statusCode,
    ...options,
  });
}
