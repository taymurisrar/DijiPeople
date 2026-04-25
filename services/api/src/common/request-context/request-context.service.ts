import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RoleAccessLevel } from '@prisma/client';

export type BuAccessRequestContext = {
  userId: string;
  tenantId: string;
  businessUnitId: string;
  organizationId: string;
  accessibleBusinessUnitIds: string[];
  accessibleUserIds: string[];
  effectiveAccessLevel: RoleAccessLevel;
  requiresSelfScope: boolean;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<BuAccessRequestContext | null>();

  runWithContext<T>(context: BuAccessRequestContext | null, callback: () => T) {
    return this.storage.run(context, callback);
  }

  getContext() {
    return this.storage.getStore() ?? null;
  }
}
