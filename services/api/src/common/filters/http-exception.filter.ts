import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ErrorLogsService } from '../../modules/error-logs/error-logs.service';
import { AppError, isErrorCode } from '../errors/app-error';
import { ErrorCode, getErrorCatalogEntry } from '../errors/error-catalog';
import { getErrorFrameworkConfig } from '../errors/error-config';
import { sanitizeForErrorLog } from '../errors/sanitize-error-log';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import type { RequestWithId } from '../middleware/request-id.middleware';

type StandardErrorContract = {
  success: false;
  traceId: string;
  timestamp: string;
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  description: string;
  path: string;
  method: string;
  details: unknown;
  support: {
    reference: string;
    message: string;
  };
  stack?: string;
};

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly errorLogsService: ErrorLogsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId & { user?: AuthenticatedUser }>();
    const config = getErrorFrameworkConfig(this.configService);
    const traceId = this.resolveTraceId(request, response, config.traceHeader);
    const normalized = this.normalizeException(exception);
    const timestamp = new Date().toISOString();
    const details = normalized.details ?? {};

    const contract: StandardErrorContract = {
      success: false,
      traceId,
      timestamp,
      statusCode: normalized.statusCode,
      errorCode: normalized.errorCode,
      message: normalized.message,
      description: normalized.description,
      path: request.originalUrl ?? request.url,
      method: request.method,
      details,
      support: {
        reference: traceId,
        message: config.supportMessage,
      },
    };

    if (config.verboseResponse && this.canExposeStack(request.user, config.exposeStackToSystemCustomizer)) {
      contract.stack = normalized.stack;
    }

    const logContext = {
      traceId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode: normalized.statusCode,
      errorCode: normalized.errorCode,
      severity: normalized.severity,
      userId: request.user?.userId,
      tenantId: request.user?.tenantId,
    };

    if (normalized.statusCode >= 500) {
      this.logger.error(JSON.stringify(logContext), normalized.stack);
    } else {
      this.logger.warn(JSON.stringify(logContext));
    }

    void this.errorLogsService.persist({
      traceId,
      errorCode: normalized.errorCode,
      statusCode: normalized.statusCode,
      severity: normalized.severity,
      message: normalized.message,
      description: normalized.description,
      stack: normalized.stack,
      cause: normalized.cause,
      details,
      method: request.method,
      path: request.originalUrl ?? request.url,
      params: request.params,
      query: request.query,
      requestBody: request.body,
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
      userId: request.user?.userId,
      tenantId: request.user?.tenantId,
      organizationId: request.user?.accessContext?.organizationId,
      businessUnitId: request.user?.accessContext?.businessUnitId,
    });

    response.status(normalized.statusCode).json(contract);
  }

  private normalizeException(exception: unknown): {
    errorCode: ErrorCode;
    statusCode: number;
    message: string;
    description: string;
    details?: unknown;
    severity: string;
    cause?: unknown;
    stack?: string;
  } {
    if (exception instanceof AppError) {
      return {
        errorCode: exception.errorCode,
        statusCode: exception.statusCode,
        message: exception.message,
        description: exception.description,
        details: exception.details,
        severity: exception.severity,
        cause: sanitizeCause(exception.cause),
        stack: exception.stack,
      };
    }

    const prismaError = this.mapPrismaError(exception);
    if (prismaError) return prismaError;

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = readObject(exception.getResponse());
      const rawCode = readString(payload.code) ?? readString(payload.errorCode);
      const errorCode = this.mapLegacyCode(rawCode, statusCode);
      const catalog = getErrorCatalogEntry(errorCode);
      const rawMessage = payload.message;
      const message = readMessage(rawMessage) ?? readString(payload.error) ?? catalog.message;
      const description = readString(payload.description) ?? catalog.description;

      return {
        errorCode,
        statusCode,
        message,
        description,
        details: this.extractValidationDetails(rawMessage, payload),
        severity: catalog.severity,
        stack: exception.stack,
      };
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    const networkError = /timeout|timed out|econnrefused|enotfound|network|connection/i.test(message);
    const errorCode: ErrorCode = networkError ? 'NETWORK_ERROR' : 'SYSTEM_UNEXPECTED_ERROR';
    const catalog = getErrorCatalogEntry(errorCode);

    return {
      errorCode,
      statusCode: catalog.statusCode,
      message: catalog.message,
      description: catalog.description,
      details: {},
      severity: catalog.severity,
      cause: sanitizeCause(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    };
  }

  private mapPrismaError(exception: unknown) {
    let errorCode: ErrorCode | null = null;
    const message = exception instanceof Error ? exception.message : '';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') errorCode = 'DATABASE_DUPLICATE_RECORD';
      else if (exception.code === 'P2025') errorCode = 'DATABASE_RECORD_NOT_FOUND';
      else if (exception.code === 'P2003') errorCode = 'DATABASE_CONSTRAINT_FAILED';
      else errorCode = 'PRISMA_KNOWN_REQUEST_ERROR';
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      errorCode = 'PRISMA_VALIDATION_ERROR';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      errorCode = 'PRISMA_CONNECTION_ERROR';
    } else if (/pool|connection|connect|database/i.test(message)) {
      errorCode = /timeout|timed out/i.test(message) ? 'DATABASE_TIMEOUT' : 'DATABASE_CONNECTION_FAILED';
    }

    if (!errorCode) return null;

    const catalog = getErrorCatalogEntry(errorCode);
    return {
      errorCode,
      statusCode: catalog.statusCode,
      message: catalog.message,
      description: catalog.description,
      details:
        exception instanceof Prisma.PrismaClientKnownRequestError
          ? sanitizeForErrorLog({ prismaCode: exception.code, meta: exception.meta })
          : {},
      severity: catalog.severity,
      cause: sanitizeCause(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    };
  }

  private mapLegacyCode(code: string | null, statusCode: number): ErrorCode {
    if (code && isErrorCode(code)) return code;

    const normalized = code?.toUpperCase();
    if (normalized === 'AUTH_REQUIRED') return 'AUTH_TOKEN_MISSING';
    if (normalized === 'INVALID_TOKEN') return 'AUTH_TOKEN_INVALID';
    if (normalized === 'ACCESS_TOKEN_EXPIRED') return 'SESSION_EXPIRED';
    if (normalized === 'VALIDATION_ERROR' || normalized === 'BAD_REQUEST') return 'VALIDATION_FAILED';
    if (normalized === 'FORBIDDEN') return 'ACCESS_DENIED';
    if (normalized === 'UNAUTHORIZED') return 'AUTH_UNAUTHORIZED';
    if (normalized === 'NOT_FOUND') return 'DATABASE_RECORD_NOT_FOUND';

    if (statusCode === 401) return 'AUTH_UNAUTHORIZED';
    if (statusCode === 403) return 'ACCESS_DENIED';
    if (statusCode === 404) return 'DATABASE_RECORD_NOT_FOUND';
    if (statusCode === 409) return 'DATABASE_CONSTRAINT_FAILED';
    if (statusCode === 400 || statusCode === 422) return 'VALIDATION_FAILED';
    if (statusCode === 429) return 'RATE_LIMIT_EXCEEDED';
    return 'SYSTEM_UNEXPECTED_ERROR';
  }

  private extractValidationDetails(rawMessage: unknown, payload: Record<string, unknown>) {
    if (Array.isArray(rawMessage)) {
      return {
        fields: rawMessage
          .filter((message): message is string => typeof message === 'string')
          .map((message) => {
            const match = message.trim().match(/^([A-Za-z0-9_.-]+)\s+(.+)$/);
            return { field: match?.[1] ?? 'request', message };
          }),
      };
    }

    return sanitizeForErrorLog(payload.details ?? payload.errors ?? {});
  }

  private resolveTraceId(request: RequestWithId, response: Response, traceHeader: string) {
    const incoming = request.header(traceHeader);
    const existing = incoming ?? request.requestId ?? response.getHeader('X-Request-Id')?.toString();
    const traceId = existing && existing.trim() ? existing.trim().slice(0, 128) : `req_${randomUUID()}`;
    request.requestId = traceId;
    response.setHeader('X-Trace-Id', traceId);
    response.setHeader('X-Request-Id', traceId);
    return traceId;
  }

  private canExposeStack(
    user: AuthenticatedUser | undefined,
    exposeStackToSystemCustomizer: boolean,
  ) {
    return Boolean(
      exposeStackToSystemCustomizer &&
        (user?.accessContext?.isSystemCustomizer ||
          user?.roleKeys?.includes('system-customizer')),
    );
  }
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : typeof value === 'string'
      ? { message: value }
      : {};
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMessage(value: unknown) {
  if (Array.isArray(value)) {
    const messages = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return messages.length ? messages.join(', ') : null;
  }
  return readString(value);
}

function sanitizeCause(value: unknown) {
  if (value instanceof Error) {
    return sanitizeForErrorLog({ name: value.name, message: value.message });
  }
  return sanitizeForErrorLog(value);
}
