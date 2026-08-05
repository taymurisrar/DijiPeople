import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type PartnerActor = { userId: string; partnerId: string; email: string };
export type PartnerRequest = Request & { partnerActor?: PartnerActor };

@Injectable()
export class PartnerAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<PartnerRequest>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token)
      throw new UnauthorizedException('Partner access token is required.');
    try {
      const payload =
        await this.jwt.verifyAsync<Record<string, unknown>>(token);
      if (
        payload.actorType !== 'PARTNER' ||
        typeof payload.sub !== 'string' ||
        typeof payload.partnerId !== 'string' ||
        typeof payload.email !== 'string'
      )
        throw new Error('Invalid partner token.');
      request.partnerActor = {
        userId: payload.sub,
        partnerId: payload.partnerId,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Partner access token is invalid or expired.',
      );
    }
  }
}
