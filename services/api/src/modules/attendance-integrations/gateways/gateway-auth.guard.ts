import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  GatewayCredentialService,
  type ResolvedGatewayIdentity,
} from './gateway-credential.service';

/**
 * Authenticates a gateway service credential.
 *
 * Deliberately NOT the employee/admin JwtAuthGuard. A gateway is a machine, not
 * a person: it holds no user session, has no permissions, and must never be able
 * to reach a normal web endpoint. Keeping the two guards separate is what stops
 * a leaked gateway secret from being usable against the tenant web API, and
 * stops an employee token from being usable to inject attendance events.
 *
 * Tenant and gateway identity are resolved from the stored credential, so
 * anything the caller claims about tenancy in the body is irrelevant.
 */

export interface GatewayAuthenticatedRequest extends Request {
  gateway: ResolvedGatewayIdentity;
}

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(private readonly credentials: GatewayCredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<GatewayAuthenticatedRequest>();

    const presented = this.extractCredential(request);
    if (!presented) {
      throw new UnauthorizedException('Gateway credential required.');
    }

    const identity = await this.credentials.resolveCredential(
      presented,
      request.ip ?? null,
    );

    if (!identity) {
      // One message for absent, malformed, unknown, revoked and expired, so the
      // response cannot be used to probe which credentials exist.
      throw new UnauthorizedException('Gateway credential is not valid.');
    }

    request.gateway = identity;
    return true;
  }

  private extractCredential(request: Request): string | null {
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    const alternate = request.headers['x-gateway-credential'];
    if (typeof alternate === 'string' && alternate.trim().length > 0) {
      return alternate.trim();
    }

    return null;
  }
}
