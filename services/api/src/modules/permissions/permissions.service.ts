import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionBootstrapService } from './permission-bootstrap.service';
import { PermissionsRepository } from './permissions.repository';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly permissionBootstrapService: PermissionBootstrapService,
  ) {}

  findByTenant(tenantId: string) {
    return this.permissionsRepository.findByTenant(tenantId);
  }

  findByIds(tenantId: string, permissionIds: string[]) {
    return this.permissionsRepository.findByIds(tenantId, permissionIds);
  }

  bootstrapTenantDefaults(
    tenantId: string,
    db?: PrismaDb,
    actorUserId?: string,
  ) {
    return this.permissionBootstrapService.bootstrapTenantRbac(
      tenantId,
      db,
      actorUserId,
    );
  }
}
