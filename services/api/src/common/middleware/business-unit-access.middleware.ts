import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { getAccessTokenSecret } from '../config/auth.config';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { RequestContextService } from '../request-context/request-context.service';
import { OrganizationAccessService } from '../../modules/organization/organization-access.service';

type AccessTokenPayload = {
  sub?: string;
  userId?: string;
  tenantId?: string;
};

@Injectable()
export class BusinessUnitAccessMiddleware implements NestMiddleware {
  constructor(
    private readonly configService: ConfigService,
    private readonly organizationAccessService: OrganizationAccessService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const token = this.extractAccessToken(req);

    if (!token) {
      req.buAccess = null;
      return this.requestContextService.runWithContext(null, () => next());
    }

    try {
      const decoded = jwt.verify(
        token,
        getAccessTokenSecret(this.configService),
      ) as AccessTokenPayload;
      const userId = decoded.userId ?? decoded.sub;

      if (!userId) {
        req.buAccess = null;
        return this.requestContextService.runWithContext(null, () => next());
      }

      const buAccess =
        await this.organizationAccessService.resolveBusinessUnitAccessContext(
          userId,
        );

      req.buAccess = buAccess;
      return this.requestContextService.runWithContext(buAccess, () => next());
    } catch {
      req.buAccess = null;
      return this.requestContextService.runWithContext(null, () => next());
    }
  }

  private extractAccessToken(req: AuthenticatedRequest) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }

    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const parts = cookieHeader.split(';').map((part) => part.trim());
    for (const part of parts) {
      if (part.startsWith('dp_access_token=')) {
        return decodeURIComponent(part.slice('dp_access_token='.length));
      }
    }

    return null;
  }
}
