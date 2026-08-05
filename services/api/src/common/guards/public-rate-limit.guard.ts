import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const windows = new Map<string, { count: number; resetsAt: number }>();

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${request.ip ?? 'unknown'}:${request.path}`;
    const current = windows.get(key);
    const limit = request.method === 'GET' ? 120 : 20;
    if (!current || current.resetsAt <= now) {
      windows.set(key, { count: 1, resetsAt: now + 10 * 60_000 });
      this.cleanup(now);
      return true;
    }
    if (current.count >= limit) {
      throw new HttpException(
        {
          code: 'PUBLIC_RATE_LIMITED',
          message: 'Too many requests. Wait a few minutes and try again.',
        },
        429,
      );
    }
    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    if (windows.size < 5_000) return;
    for (const [key, value] of windows)
      if (value.resetsAt <= now) windows.delete(key);
  }
}
