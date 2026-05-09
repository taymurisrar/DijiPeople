import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { RequestWithId } from '../middleware/request-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const requestId =
      request.requestId ?? response.getHeader('X-Request-Id')?.toString();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const standardError = this.buildStandardError({
      exception,
      exceptionResponse,
      method: request.method,
      path: request.url,
      requestId: requestId ?? 'req_unavailable',
      status,
    });

    const logContext = {
      traceId: standardError.traceId,
      method: request.method,
      path: request.url,
      statusCode: status,
      userId: (request as Request & { user?: { userId?: string } }).user
        ?.userId,
      tenantId: (request as Request & { user?: { tenantId?: string } }).user
        ?.tenantId,
      code: standardError.code,
    };

    if (status >= 500) {
      this.logger.error(
        JSON.stringify(logContext),
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(JSON.stringify(logContext));
    }

    response.status(status).json({
      success: false,
      error: standardError,
    });
  }

  private buildStandardError({
    exception,
    exceptionResponse,
    method,
    path,
    requestId,
    status,
  }: {
    exception: unknown;
    exceptionResponse: string | object | null;
    method: string;
    path: string;
    requestId: string;
    status: number;
  }) {
    const payload =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};
    const rawMessage =
      payload.message ??
      (typeof exceptionResponse === 'string' ? exceptionResponse : undefined) ??
      (exception instanceof Error ? exception.message : undefined);
    const message = this.sanitizeMessage(status, rawMessage);
    const code = this.resolveErrorCode(status, payload);

    return {
      code,
      message,
      details: status === 400 || status === 422 ? rawMessage : null,
      traceId: requestId,
      timestamp: new Date().toISOString(),
      path,
      method,
    };
  }

  private resolveErrorCode(
    status: number,
    payload: Record<string, unknown>,
  ): string {
    if (typeof payload.code === 'string' && payload.code.trim()) {
      return payload.code.trim();
    }

    if (status === 401) {
      return 'AUTH_REQUIRED';
    }

    if (status === 403) {
      return 'ACCESS_DENIED';
    }

    if (status === 400 || status === 422) {
      return 'VALIDATION_ERROR';
    }

    if (status >= 500) {
      return 'INTERNAL_SERVER_ERROR';
    }

    return 'REQUEST_FAILED';
  }

  private sanitizeMessage(status: number, rawMessage: unknown) {
    if (status >= 500) {
      return 'Something went wrong. Please contact support with the reference ID.';
    }

    if (Array.isArray(rawMessage)) {
      return rawMessage.filter(Boolean).join(', ');
    }

    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      return rawMessage.trim();
    }

    if (status === 403) {
      return 'You do not have permission to perform this action.';
    }

    if (status === 401) {
      return 'Authentication is required.';
    }

    return 'Request failed.';
  }
}
