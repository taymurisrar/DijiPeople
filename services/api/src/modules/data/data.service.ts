import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { getEntityMetadata } from './entity-registry';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { mapEntityQueryToPrismaArgs } from './entity-prisma.mapper';
import { parseEntityQuery } from './entity-query-parser';
import { EntityQueryParams } from './entity-query.types';
import { validateEntityQuery } from './entity-query-validator';
import { EntityScopeResolver } from './entity-scope.resolver';

type EntityDelegate = {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  count(args: Record<string, unknown>): Promise<number>;
};

@Injectable()
export class DataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionResolver: EntityPermissionResolver,
    private readonly scopeResolver: EntityScopeResolver,
  ) {}

  async findMany(
    entityLogicalName: string,
    queryParams: EntityQueryParams,
    user: AuthenticatedUser,
  ) {
    const metadata = getEntityMetadata(entityLogicalName);
    if (!metadata) {
      throw new NotFoundException(
        `Entity is not available: ${entityLogicalName}`,
      );
    }

    this.permissionResolver.assertCanRead(metadata, user);

    const parsedQuery = parseEntityQuery(queryParams);
    const validatedQuery = validateEntityQuery(metadata, parsedQuery);
    const scopeWhere = this.scopeResolver.buildReadScope(metadata, user);
    const { findManyArgs, countArgs } = mapEntityQueryToPrismaArgs(
      metadata,
      validatedQuery,
      scopeWhere,
    );
    const delegate = this.resolveDelegate(metadata.prismaModel);

    try {
      const [items, total] = await Promise.all([
        delegate.findMany(findManyArgs),
        delegate.count(countArgs),
      ]);
      const totalPages = Math.max(
        1,
        Math.ceil(total / validatedQuery.pageSize),
      );

      return {
        items,
        meta: {
          entityLogicalName: metadata.logicalName,
          page: validatedQuery.page,
          pageSize: validatedQuery.pageSize,
          total,
          totalPages,
          hasNextPage: validatedQuery.page < totalPages,
          hasPreviousPage: validatedQuery.page > 1,
          selectedFields: validatedQuery.select,
          expanded: validatedQuery.expand.map((item) => item.relation),
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(
          'Unable to execute entity data query.',
        );
      }

      throw error;
    }
  }

  private resolveDelegate(prismaModel: string): EntityDelegate {
    const delegate = (this.prisma as unknown as Record<string, unknown>)[
      prismaModel
    ];

    if (
      !delegate ||
      typeof delegate !== 'object' ||
      typeof (delegate as EntityDelegate).findMany !== 'function' ||
      typeof (delegate as EntityDelegate).count !== 'function'
    ) {
      throw new InternalServerErrorException(
        'Entity data source is not configured.',
      );
    }

    return delegate as EntityDelegate;
  }
}
